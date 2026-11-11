#!/usr/bin/env node
/**
 * Build the orrery's spacecraft models (#115) from NASA's 3D Resources into
 * public/models/craft/. Usage: node scripts/craft-models.mjs <source-dir>
 *
 * The source dir holds the downloads named as in SOURCES (see CRAFT_MODELS in
 * src/lib/orrery/craftModels.ts for each file's origin and credit). Every model is
 * decoded here, simplified to a triangle budget, quantized and given WebP textures,
 * and written WITHOUT Draco or meshopt compression: those need a WebAssembly decoder
 * in the browser, and the site's CSP (public/_headers) allows no WebAssembly compile
 * ('wasm-unsafe-eval'). Quantized geometry loads with three's GLTFLoader alone.
 *
 * The asset gate (#202): scripts/craft-manifest.mjs holds an entry per model. The build
 * checks each source file against the entry's SHA-256, writes the result to a staging
 * folder, and copies it to public/models/craft/ only when the entry is complete and the
 * file is within the per-model budget (scripts/craft-gate.mjs). A 'legacy' entry builds
 * to staging for inspection but is never promoted. Rules: docs/reference/satellite-models.md.
 */
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import {
  compactPrimitive,
  dedup,
  getBounds,
  prune,
  quantize,
  simplify,
  textureCompress,
  weld,
} from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'
import { MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'

import { BUDGETS } from './check-bundle.mjs'
import { dropNodes } from './craft-nodes.mjs'
import { SOURCES } from './craft-sources.mjs'
import {
  assertSourceFiles,
  blankRegion,
  glbWithoutExternalImages,
  promote,
  sha256Hex,
  unknownModels,
  verifySources,
} from './craft-gate.mjs'
import { MANIFEST } from './craft-manifest.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(ROOT, 'public', 'models', 'craft')

const TEXTURE_SIZE = 512
const SIMPLIFY_ERROR = 0.02

function triangleCount(doc) {
  let n = 0
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices()
      const position = prim.getAttribute('POSITION')
      n += Math.floor((indices ? indices.getCount() : (position?.getCount() ?? 0)) / 3)
    }
  }
  return n
}

/**
 * Drop per-face normals (and UVs where no texture reads them). NASA's models carry hard
 * normals, so every triangle owns three vertices: nothing welds, the simplifier cannot
 * collapse across the seams, and a 9k-triangle model weighed 330 kB. The orrery draws
 * craft flat-shaded (normals from screen-space derivatives), which suits hardware.
 */
function stripAttributes(doc, keepTextures) {
  if (!keepTextures) {
    for (const material of doc.getRoot().listMaterials()) {
      material
        .setBaseColorTexture(null)
        .setEmissiveTexture(null)
        .setMetallicRoughnessTexture(null)
        .setOcclusionTexture(null)
    }
  }
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      prim.setAttribute('NORMAL', null)
      prim.setAttribute('TANGENT', null)
      const material = prim.getMaterial()
      const textured =
        material !== null &&
        [
          material.getBaseColorTexture(),
          material.getEmissiveTexture(),
          material.getMetallicRoughnessTexture(),
          material.getNormalTexture(),
          material.getOcclusionTexture(),
        ].some(Boolean)
      if (!textured) {
        for (const semantic of prim.listSemantics()) {
          if (semantic.startsWith('TEXCOORD_')) prim.setAttribute(semantic, null)
        }
      }
    }
  }
  // A normal map needs the normals and tangents just removed.
  for (const material of doc.getRoot().listMaterials()) material.setNormalTexture(null)
}

/**
 * Paint out marks in isolated spots of the textures the materials use: each region names a
 * texture and a pixel rectangle, which becomes the colour around it (blankRegion). Throws when
 * a region matches no texture, so a stale name or an edited source cannot pass unnoticed.
 */
async function blankTextures(doc, regions) {
  for (const region of regions) {
    const { texture: name, ...rect } = region
    const used = new Set()
    for (const material of doc.getRoot().listMaterials()) {
      const t = material.getBaseColorTexture()
      if (t && t.getName() === name) used.add(t)
    }
    if (used.size === 0) throw new Error(`blank: no texture named ${name} is used by a material`)
    for (const texture of used) {
      const { data, info } = await sharp(Buffer.from(texture.getImage()))
        .raw()
        .toBuffer({ resolveWithObject: true })
      const painted = blankRegion(data, info.width, info.height, info.channels, rect)
      const png = await sharp(painted, { raw: { width: info.width, height: info.height, channels: info.channels } })
        .png()
        .toBuffer()
      texture.setImage(new Uint8Array(png)).setMimeType('image/png')
    }
    console.log(`blanked ${rect.w} x ${rect.h} at ${rect.x},${rect.y} in ${name}`)
  }
}

/**
 * Remove disconnected components smaller than `error` (a share of each primitive's
 * size) with meshoptimizer's simplifyPrune. A model built of many small closed parts
 * cannot otherwise reach its budget: the simplifier never deletes a component.
 */
function pruneSmallComponents(doc, error) {
  let before = 0
  let after = 0
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices()
      const position = prim.getAttribute('POSITION')
      if (!indices || !position) continue
      const positions = Float32Array.from(position.getArray())
      const kept = MeshoptSimplifier.simplifyPrune(
        Uint32Array.from(indices.getArray()),
        positions,
        3,
        error,
      )
      before += indices.getCount()
      after += kept.length
      indices.setArray(kept)
      // Drop the vertices nothing references now, or they still count in the bounds.
      compactPrimitive(prim)
    }
  }
  console.log(`pruned small components: ${before / 3} -> ${after / 3} tris`)
}

async function build(io, name, source, srcDir, outDir) {
  const {
    textures = true,
    error = SIMPLIFY_ERROR,
    minPart = 0,
    dropExternalImages = false,
    aim,
    blank = [],
    dropNodes: dropList = [],
  } = source
  const { triangles, sources } = MANIFEST[name]
  if (sources.length !== 1) throw new Error(`${name}: expects one source file, the manifest has ${sources.length}`)
  const file = sources[0].file
  const started = Date.now()
  const doc = dropExternalImages
    ? await io.readBinary(glbWithoutExternalImages(readFileSync(join(srcDir, file))))
    : await io.read(join(srcDir, file))
  const before = triangleCount(doc)
  dropNodes(doc, dropList)
  stripAttributes(doc, textures)
  await blankTextures(doc, blank)
  await doc.transform(dedup(), weld())
  if (minPart > 0) pruneSmallComponents(doc, minPart)
  const ratio = Math.min(1, (aim ?? triangles) / Math.max(1, triangleCount(doc)))
  await doc.transform(
    // error is a share of the model's size: 2% is invisible at the ~150 px a focused
    // craft draws at, and lets the simplifier reach the budget.
    simplify({ simplifier: MeshoptSimplifier, ratio, error, lockBorder: false }),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEXTURE_SIZE, TEXTURE_SIZE] }),
    quantize(),
  )
  // Decoded already: drop the compression extensions so the browser needs no decoder.
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    const id = ext.extensionName
    if (id === 'KHR_draco_mesh_compression' || id === 'EXT_meshopt_compression') ext.dispose()
  }
  const out = join(outDir, `${name}.glb`)
  await io.write(out, doc)
  const bounds = getBounds(doc.getRoot().listScenes()[0])
  const size = bounds.max.map((v, i) => +(v - bounds.min[i]).toFixed(3))
  console.log(
    `${name}: ${file} ${statSync(join(srcDir, file)).size} B, ${before} tris -> ${triangleCount(doc)} tris, ${statSync(out).size} B, extent ${size.join(' x ')}, ${((Date.now() - started) / 1000).toFixed(1)} s`,
  )
  return triangleCount(doc)
}

/** Positions of a binary STL (no indices; weld() joins them). */
function readStl(path) {
  const buf = readFileSync(path)
  const n = buf.readUInt32LE(80)
  const out = new Float32Array(n * 9)
  for (let t = 0; t < n; t += 1) {
    for (let k = 0; k < 9; k += 1) out[t * 9 + k] = buf.readFloatLE(84 + t * 50 + 12 + k * 4)
  }
  return out
}

/**
 * New Horizons: NASA publishes only 3D-printing parts, each laid on the print bed from
 * y = 0. Assembled here as flown in outline: the dish on top of the body along the spin
 * axis, the RTG cantilevered from one corner. The arrangement is approximate, and the
 * credit says so (craftModels.ts).
 */
const NH_BODY = 'nh_7399_05_rp_body.stl'
const NH_ANTENNA = 'nh_7399_05_rp_antenna.stl'
const NH_RTG = 'nh_7399_05_rp_rtg.stl'

async function buildNewHorizons(io, srcDir, outDir) {
  assertSourceFiles('new-horizons', MANIFEST['new-horizons'], [NH_BODY, NH_ANTENNA, NH_RTG])
  const doc = new Document()
  const buffer = doc.createBuffer()
  const scene = doc.createScene()
  const part = (file, colour, translation, rotation) => {
    const positions = doc
      .createAccessor()
      .setType('VEC3')
      .setArray(readStl(join(srcDir, file)))
      .setBuffer(buffer)
    const material = doc.createMaterial().setBaseColorFactor(colour).setMetallicFactor(0.3).setRoughnessFactor(0.6)
    const prim = doc.createPrimitive().setAttribute('POSITION', positions).setMaterial(material)
    const node = doc.createNode(file).setMesh(doc.createMesh(file).addPrimitive(prim))
    node.setTranslation(translation)
    if (rotation) node.setRotation(rotation)
    scene.addChild(node)
  }
  // Body: gold foil. Dish: white, sitting on the body's top face (body height 2.3).
  part(NH_BODY, [0.78, 0.62, 0.3, 1], [0, 0, 0])
  part(NH_ANTENNA, [0.92, 0.92, 0.9, 1], [-0.1, 2.3, 0.2])
  // RTG: a dark rod, turned to lie along -x from the body's far corner.
  const s = Math.SQRT1_2
  part(NH_RTG, [0.25, 0.25, 0.27, 1], [-2.8, 0.9, -1.2], [0, 0, s, s])
  await doc.transform(dedup(), weld())
  const before = triangleCount(doc)
  await doc.transform(
    simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, MANIFEST['new-horizons'].triangles / before), error: SIMPLIFY_ERROR, lockBorder: false }),
    prune(),
    quantize(),
  )
  const out = join(outDir, 'new-horizons.glb')
  await io.write(out, doc)
  console.log(`new-horizons: 3 STL parts, ${before} tris -> ${triangleCount(doc)} tris, ${statSync(out).size} B`)
  return triangleCount(doc)
}

async function main() {
  const srcDir = process.argv[2]
  if (!srcDir) throw new Error('usage: node scripts/craft-models.mjs <source-dir> [name...]')
  const only = process.argv.slice(3)
  const unknown = unknownModels(only, Object.keys(MANIFEST))
  if (unknown.length > 0) throw new Error(`no manifest entry for: ${unknown.join(', ')}`)
  await MeshoptSimplifier.ready
  const staging = mkdtempSync(join(tmpdir(), 'craft-models-'))
  try {
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })
    const built = new Map()
    for (const [name, source] of Object.entries(SOURCES)) {
      if (only.length > 0 && !only.includes(name)) continue
      gateSources(name, srcDir)
      built.set(name, await build(io, name, source, srcDir, staging))
    }
    if (only.length === 0 || only.includes('new-horizons')) {
      gateSources('new-horizons', srcDir)
      built.set('new-horizons', await buildNewHorizons(io, srcDir, staging))
    }
    for (const [name, triangles] of built) {
      try {
        promote(name, staging, OUT, MANIFEST[name], BUDGETS.craftModelBytes, triangles)
        console.log(`promoted ${name} to public/models/craft/`)
        // A rebuilt file must be pinned on purpose: say so, and fail, when the bytes moved.
        const pinned = MANIFEST[name].outputSha256
        if (pinned) {
          const actual = sha256Hex(readFileSync(join(OUT, `${name}.glb`)))
          if (actual !== pinned) {
            console.warn(`${name}: output sha256 ${actual} differs from the manifest's outputSha256 ${pinned}; update the manifest`)
            process.exitCode = 1
          }
        }
      } catch (e) {
        console.warn(e.message)
        process.exitCode = 1
      }
    }
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

/** Check a model's source files against the manifest; a legacy entry has no hash to check. */
function gateSources(name, srcDir) {
  const entry = MANIFEST[name]
  if (!entry) throw new Error(`${name}: no manifest entry (scripts/craft-manifest.mjs)`)
  if (entry.legacy) console.warn(`${name}: legacy entry, source hash not checked`)
  else verifySources(entry, srcDir)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
