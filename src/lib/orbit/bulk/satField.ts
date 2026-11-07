/**
 * The orrery's satellite field (#98): every loaded group's satrecs in one array, and one
 * SGP4 pass over all of them per frame. Runs inside the satellite worker
 * (sats.worker.ts), never on the main thread.
 *
 * Positions are ECI (TEME), km, [x, y, z] per object in group order; the renderer turns
 * them into its Earth frame. Each object also gets a status byte, so a missing position
 * says why: SGP4 failed, or the date is more than three days from the object's own
 * element epoch, where the spec refuses to draw it.
 */
import * as satellite from 'satellite.js'

import { OrrerySatsSchema } from '@/schemas/orrerySats'

import { EPOCH_WINDOW_MS, rowEpochMs, rowToOmm, type SatGroupId, type SatRow } from '../satCatalog'
import type { bulkRuntime } from './bulkEci'
import { propagateBulk } from './bulkEci'

export const SAT_OK = 0
export const SAT_FAILED = 1
export const SAT_OUT_OF_WINDOW = 2

type Runtime = Awaited<ReturnType<typeof bulkRuntime>>

export interface SatGroupRows {
  group: SatGroupId
  rows: SatRow[]
}

export interface SatField {
  count: number
  groups: { group: SatGroupId; start: number; count: number }[]
  /** NORAD ids in field order, for picking and the inspector. */
  ids: string[]
  names: string[]
  satrecs: satellite.SatRec[]
  epochMs: Float64Array
}

export interface SatFrame {
  positions: Float32Array
  status: Uint8Array
}

function isSatRow(value: unknown): value is SatRow {
  if (!Array.isArray(value) || value.length !== 13) return false
  for (let i = 0; i < 4; i++) if (typeof value[i] !== 'string') return false
  for (let i = 4; i < 13; i++)
    if (typeof value[i] !== 'number' || !Number.isFinite(value[i])) return false
  return Number.isFinite(rowEpochMs(value as SatRow))
}

/** A stored group's body (as fetched, undecoded) as rows; bad rows are dropped and counted. */
export function decodeSatGroup(body: ArrayBuffer): SatGroupRows & { dropped: number } {
  const parsed = OrrerySatsSchema.parse(JSON.parse(new TextDecoder().decode(body)))
  const rows = parsed.rows.filter(isSatRow)
  return { group: parsed.group, rows, dropped: parsed.rows.length - rows.length }
}

/** Every group's satrecs, concatenated in the order given. */
export function buildSatField(groups: SatGroupRows[]): SatField {
  const field: SatField = {
    count: 0,
    groups: [],
    ids: [],
    names: [],
    satrecs: [],
    epochMs: new Float64Array(0),
  }
  const epochs: number[] = []
  for (const { group, rows } of groups) {
    field.groups.push({ group, start: field.count, count: rows.length })
    for (const row of rows) {
      field.satrecs.push(satellite.json2satrec(rowToOmm(row)))
      field.ids.push(row[1])
      field.names.push(row[0])
      epochs.push(rowEpochMs(row))
    }
    field.count += rows.length
  }
  field.epochMs = Float64Array.from(epochs)
  return field
}

/** Reuse the caller's buffers when they fit; otherwise allocate. */
function frameFor(field: SatField, reuse?: SatFrame): SatFrame {
  if (reuse?.positions.length === field.count * 3 && reuse.status.length === field.count)
    return reuse
  return { positions: new Float32Array(field.count * 3), status: new Uint8Array(field.count) }
}

/** Mark statuses from the positions (NaN = SGP4 failed) and the epoch window. */
function settle(field: SatField, dateMs: number, frame: SatFrame): SatFrame {
  const { positions, status } = frame
  for (let i = 0; i < field.count; i++) {
    // Written so an unreadable epoch (NaN) also counts as outside.
    if (!(Math.abs(dateMs - (field.epochMs[i] ?? Number.NaN)) <= EPOCH_WINDOW_MS)) {
      status[i] = SAT_OUT_OF_WINDOW
      positions[i * 3] = positions[i * 3 + 1] = positions[i * 3 + 2] = Number.NaN
    } else {
      status[i] = Number.isNaN(positions[i * 3]) ? SAT_FAILED : SAT_OK
    }
  }
  return frame
}

/** One SGP4 pass over the whole field in WebAssembly (satellite.js 7 BulkPropagator). */
export function propagateField(
  rt: Runtime,
  field: SatField,
  dateMs: number,
  reuse?: SatFrame,
): SatFrame {
  const frame = frameFor(field, reuse)
  if (field.count > 0) propagateBulk(rt, field.satrecs, [new Date(dateMs)], frame.positions)
  return settle(field, dateMs, frame)
}

/** The same pass with satellite.js's JS propagate, for when the WASM runtime won't load. */
export function propagateFieldJs(field: SatField, dateMs: number, reuse?: SatFrame): SatFrame {
  const frame = frameFor(field, reuse)
  const date = new Date(dateMs)
  for (let i = 0; i < field.count; i++) {
    const satrec = field.satrecs[i]
    const pv = satrec ? satellite.propagate(satrec, date) : null
    frame.positions[i * 3] = pv ? pv.position.x : Number.NaN
    frame.positions[i * 3 + 1] = pv ? pv.position.y : Number.NaN
    frame.positions[i * 3 + 2] = pv ? pv.position.z : Number.NaN
  }
  return settle(field, dateMs, frame)
}
