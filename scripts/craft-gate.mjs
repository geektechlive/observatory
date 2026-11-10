/**
 * The asset gate for the orrery's 3D models (#202): what a manifest entry must hold
 * before its model can ship, the source-hash check, and the promotion from the staging
 * folder to public/models/craft/. Data lives in scripts/craft-manifest.mjs; the rules and
 * the checklist for a new model are in docs/reference/satellite-models.md.
 *
 * Plain functions with node built-ins only, so a test can import them without sharp or
 * gltf-transform.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SHA256 = /^[0-9a-f]{64}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

const blank = (v) => typeof v !== 'string' || v.trim() === ''

/**
 * Why an entry may not ship, as "field: reason" strings; empty when it is complete.
 * A `legacy` entry (a model shipped before the gate, source files no longer to hand) is
 * never complete: its source hash is not pinned.
 */
export function entryProblems(entry) {
  const problems = []
  if (blank(entry.sourceUrl)) problems.push('sourceUrl: missing')
  if (blank(entry.sourceVersion)) problems.push('sourceVersion: missing')
  if (blank(entry.licence)) problems.push('licence: missing')
  if (blank(entry.licenceEvidence?.text) || blank(entry.licenceEvidence?.url)) {
    problems.push('licenceEvidence: needs both text and url')
  }
  if (blank(entry.family)) problems.push('family: missing')
  const logos = entry.logosChecked
  if (!logos || !ISO_DATE.test(logos.date ?? '') || logos.result !== 'clean') {
    problems.push('logosChecked: needs an ISO date and result "clean"')
  }
  if (!Number.isInteger(entry.triangles) || entry.triangles <= 0) {
    problems.push('triangles: needs a positive integer budget')
  }
  const sources = entry.sources
  if (!Array.isArray(sources) || sources.length === 0) {
    problems.push('sources: at least one source file')
  } else if (sources.some((s) => blank(s.file) || !SHA256.test(s.sha256 ?? ''))) {
    problems.push('sources: every file needs a name and a 64-digit sha256')
  }
  if (entry.legacy) problems.push('legacy: not promotable until its source hash is pinned')
  return problems
}

/** Throw unless each source file in `srcDir` matches the sha256 its entry pins. */
export function verifySources(entry, srcDir) {
  for (const { file, sha256 } of entry.sources) {
    const actual = sha256Hex(readFileSync(join(srcDir, file)))
    if (actual !== sha256) {
      throw new Error(`${file}: sha256 ${actual} does not match the manifest's ${sha256}`)
    }
  }
}

/**
 * Throw unless `files` (what the build reads for `name`) are exactly the files the entry
 * pins, so a hash can never vouch for a different file than the one built from.
 */
export function assertSourceFiles(name, entry, files) {
  const pinned = new Set(entry.sources.map((s) => s.file))
  const read = new Set(files)
  const unpinned = [...read].filter((f) => !pinned.has(f))
  const unread = [...pinned].filter((f) => !read.has(f))
  if (unpinned.length > 0 || unread.length > 0) {
    throw new Error(
      `${name}: the build and the manifest disagree on source files (read but not pinned: ${unpinned.join(', ') || 'none'}; pinned but not read: ${unread.join(', ') || 'none'})`,
    )
  }
}

/** The requested model names that no manifest entry has. */
export function unknownModels(requested, known) {
  return requested.filter((n) => !known.includes(n))
}

/**
 * The simplifier aims at a triangle ratio and lands near it: the shipped models sit within
 * 1.5% of their targets, so 5% over is allowed and anything more is refused.
 */
export const TRIANGLE_TOLERANCE = 1.05

/**
 * Copy `<name>.glb` from the staging folder to `outDir`, only when the manifest entry is
 * complete, the staged file is within `maxBytes`, and its `triangles` count is within
 * the entry's budget plus TRIANGLE_TOLERANCE. Throws, copying nothing, otherwise.
 */
export function promote(name, stagingDir, outDir, entry, maxBytes, triangles) {
  const problems = entryProblems(entry)
  if (problems.length > 0) throw new Error(`${name}: not shipped: ${problems.join('; ')}`)
  const staged = join(stagingDir, `${name}.glb`)
  const bytes = statSync(staged).size
  if (bytes > maxBytes) {
    throw new Error(`${name}: not shipped: ${bytes} B is over the ${maxBytes} B per-model budget`)
  }
  const limit = Math.floor(entry.triangles * TRIANGLE_TOLERANCE)
  if (!Number.isInteger(triangles) || triangles > limit) {
    throw new Error(
      `${name}: not shipped: ${triangles} triangles is over the budget of ${entry.triangles} (+5% = ${limit}) or was not counted`,
    )
  }
  mkdirSync(outDir, { recursive: true })
  copyFileSync(staged, join(outDir, `${name}.glb`))
}
