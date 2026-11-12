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

import { launchOrder, orbitClassOf } from '../orbitClass'
import { EPOCH_WINDOW_MS, rowEpochMs, rowToOmm, type SatGroupId, type SatRow } from '../satCatalog'
import type { bulkRuntime } from './bulkEci'
import { propagateBulk } from './bulkEci'
import { SAT_FAILED, SAT_OK, SAT_OUT_OF_WINDOW } from './satStatus'

export { SAT_FAILED, SAT_OK, SAT_OUT_OF_WINDOW }

type Runtime = Awaited<ReturnType<typeof bulkRuntime>>

export interface SatGroupRows {
  group: SatGroupId
  rows: SatRow[]
  /** 1 where a row carries CelesTrak SupGP elements (#209), aligned with rows; absent = GP. */
  supgp?: Uint8Array | undefined
}

export interface SatField {
  count: number
  groups: { group: SatGroupId; start: number; count: number }[]
  /** NORAD ids in field order, for picking and the inspector. */
  ids: string[]
  names: string[]
  satrecs: satellite.SatRec[]
  epochMs: Float64Array
  /** Orbit class code per object (orbitClass.ts), for the satellite browser (#158). */
  orbit: Uint8Array
  /** Launch order per object (orbitClass.ts launchOrder), 0 when unknown (#158). */
  launch: Int32Array
  /** 1 where the object's elements are CelesTrak SupGP, 0 for GP (#209). */
  supgp: Uint8Array
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
export function decodeSatGroup(
  body: ArrayBuffer,
): SatGroupRows & { supgp: Uint8Array; dropped: number } {
  const parsed = OrrerySatsSchema.parse(JSON.parse(new TextDecoder().decode(body)))
  // The first supgpCount stored rows are SupGP (#209): flag them before any is dropped.
  const supgpCount = parsed.supgpCount ?? 0
  const rows: SatRow[] = []
  const flags: number[] = []
  parsed.rows.forEach((row, i) => {
    if (!isSatRow(row)) return
    rows.push(row)
    flags.push(i < supgpCount ? 1 : 0)
  })
  return {
    group: parsed.group,
    rows,
    supgp: Uint8Array.from(flags),
    dropped: parsed.rows.length - rows.length,
  }
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
    orbit: new Uint8Array(0),
    launch: new Int32Array(0),
    supgp: new Uint8Array(0),
  }
  const epochs: number[] = []
  const orbits: number[] = []
  const launches: number[] = []
  const supgp: number[] = []
  for (const { group, rows, supgp: flags } of groups) {
    field.groups.push({ group, start: field.count, count: rows.length })
    for (const [i, row] of rows.entries()) {
      supgp.push(flags?.[i] ?? 0)
      field.satrecs.push(satellite.json2satrec(rowToOmm(row)))
      field.ids.push(row[1])
      field.names.push(row[0])
      epochs.push(rowEpochMs(row))
      orbits.push(orbitClassOf(row[4], row[5]))
      launches.push(launchOrder(row[2]))
    }
    field.count += rows.length
  }
  field.epochMs = Float64Array.from(epochs)
  field.orbit = Uint8Array.from(orbits)
  field.launch = Int32Array.from(launches)
  field.supgp = Uint8Array.from(supgp)
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
