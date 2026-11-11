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

const GLB_MAGIC = 0x46546c67
const CHUNK_JSON = 0x4e4f534a

/**
 * Drop every `*Texture` reference from a material: top level, `pbrMetallicRoughness` and each
 * entry of `extensions` (KHR_materials_specular's specularTexture and the like).
 */
function withoutTextureRefs(material) {
  const strip = (obj) =>
    Object.fromEntries(Object.entries(obj).filter(([key]) => !key.endsWith('Texture')))
  const out = strip(material)
  if (material.pbrMetallicRoughness) out.pbrMetallicRoughness = strip(material.pbrMetallicRoughness)
  if (material.extensions) {
    out.extensions = Object.fromEntries(
      Object.entries(material.extensions).map(([name, ext]) => [name, strip(ext)]),
    )
  }
  return out
}

/**
 * A GLB's bytes with its texture images, samplers and the materials' texture references
 * removed, so a model whose images are separate files that were never published (Terra
 * names `..\Terra.fbm\solarpanels.tga`, which is not in NASA's repository) can still be read.
 * Materials keep their colour factors. Throws if the file embeds an image (nothing is
 * dropped silently) or is not a GLB. The source file and its hash are not changed.
 */
export function glbWithoutExternalImages(bytes) {
  const buf = Buffer.from(bytes)
  if (buf.length < 20 || buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error('not a GLB file')
  const jsonLength = buf.readUInt32LE(12)
  if (buf.readUInt32LE(16) !== CHUNK_JSON) throw new Error('GLB: first chunk is not JSON')
  const jsonEnd = 20 + jsonLength
  const json = JSON.parse(buf.subarray(20, jsonEnd).toString('utf8'))
  if ((json.images ?? []).some((image) => image.uri === undefined || image.uri.startsWith('data:'))) {
    throw new Error('GLB embeds an image: only external images may be dropped')
  }
  delete json.images
  delete json.textures
  delete json.samplers
  if (json.materials) json.materials = json.materials.map(withoutTextureRefs)
  let text = Buffer.from(JSON.stringify(json), 'utf8')
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)])
  const rest = buf.subarray(jsonEnd)
  const header = Buffer.alloc(20)
  header.writeUInt32LE(GLB_MAGIC, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(20 + text.length + rest.length, 8)
  header.writeUInt32LE(text.length, 12)
  header.writeUInt32LE(CHUNK_JSON, 16)
  return new Uint8Array(Buffer.concat([header, text, rest]))
}

/**
 * A copy of raw pixels (`channels` bytes each, row by row) with the rectangle `{ x, y, w, h }`
 * painted the mean colour of the ring of pixels one step outside it. Used to blank a mark in
 * an isolated spot of a texture, such as a small label plate, before the texture ships.
 * Throws if the rectangle is empty or leaves the picture.
 */
export function blankRegion(pixels, width, height, channels, { x, y, w, h }) {
  if (w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > width || y + h > height) {
    throw new Error(`blankRegion: ${w} x ${h} at ${x},${y} is outside the ${width} x ${height} picture`)
  }
  const out = Buffer.from(pixels)
  const sums = new Array(channels).fill(0)
  let count = 0
  for (let py = Math.max(0, y - 1); py <= Math.min(height - 1, y + h); py += 1) {
    for (let px = Math.max(0, x - 1); px <= Math.min(width - 1, x + w); px += 1) {
      if (px >= x && px < x + w && py >= y && py < y + h) continue
      for (let c = 0; c < channels; c += 1) sums[c] += pixels[(py * width + px) * channels + c]
      count += 1
    }
  }
  if (count === 0) throw new Error('blankRegion: the rectangle covers the picture, no ring to sample')
  for (let py = y; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) {
      for (let c = 0; c < channels; c += 1) {
        out[(py * width + px) * channels + c] = Math.round(sums[c] / count)
      }
    }
  }
  return out
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
