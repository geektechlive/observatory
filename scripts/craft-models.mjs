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
 */
import { mkdirSync, readFileSync, statSync } from 'node:fs'
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

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(ROOT, 'public', 'models', 'craft')

/** Output name -> source file and the triangle budget it is simplified to. */
export const SOURCES = {
  voyager: { file: 'voyager.glb', triangles: 14_000 },
  parker: { file: 'parker.glb', triangles: 14_000 },
  juno: { file: 'juno.glb', triangles: 14_000 },
  dscovr: { file: 'dscovr.glb', triangles: 9_000 },
  soho: { file: 'soho.glb', triangles: 14_000 },
  wind: { file: 'wind.glb', triangles: 14_000 },
  ace: { file: 'ace.glb', triangles: 14_000 },
  jwst: { file: 'jwst.glb', triangles: 16_000 },
  // 35.7 MB, 203k triangles and 43 textures: its maps go (material colours stay) and it
  // gets a looser error to reach the budget.
  // It is thousands of small closed parts the simplifier cannot shrink, so components
  // under 1.5% of a mesh's size (sub-pixel at a focused craft's ~150 px) go first.
  clipper: { file: 'clipper.glb', triangles: 16_000, textures: false, error: 0.05, minPart: 0.015 },
}

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

async function build(io, name, source, srcDir) {
  const { file, triangles, textures = true, error = SIMPLIFY_ERROR, minPart = 0 } = source
  const doc = await io.read(join(srcDir, file))
  const before = triangleCount(doc)
  stripAttributes(doc, textures)
  await doc.transform(dedup(), weld())
  if (minPart > 0) pruneSmallComponents(doc, minPart)
  const ratio = Math.min(1, triangles / Math.max(1, triangleCount(doc)))
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
  const out = join(OUT, `${name}.glb`)
  await io.write(out, doc)
  const bounds = getBounds(doc.getRoot().listScenes()[0])
  const size = bounds.max.map((v, i) => +(v - bounds.min[i]).toFixed(3))
  console.log(
    `${name}: ${file} ${statSync(join(srcDir, file)).size} B, ${before} tris -> ${triangleCount(doc)} tris, ${statSync(out).size} B, extent ${size.join(' x ')}`,
  )
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
async function buildNewHorizons(io, srcDir) {
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
  part('nh_7399_05_rp_body.stl', [0.78, 0.62, 0.3, 1], [0, 0, 0])
  part('nh_7399_05_rp_antenna.stl', [0.92, 0.92, 0.9, 1], [-0.1, 2.3, 0.2])
  // RTG: a dark rod, turned to lie along -x from the body's far corner.
  const s = Math.SQRT1_2
  part('nh_7399_05_rp_rtg.stl', [0.25, 0.25, 0.27, 1], [-2.8, 0.9, -1.2], [0, 0, s, s])
  await doc.transform(dedup(), weld())
  const before = triangleCount(doc)
  await doc.transform(
    simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, 12_000 / before), error: SIMPLIFY_ERROR, lockBorder: false }),
    prune(),
    quantize(),
  )
  const out = join(OUT, 'new-horizons.glb')
  await io.write(out, doc)
  console.log(`new-horizons: 5 STL parts, ${before} tris -> ${triangleCount(doc)} tris, ${statSync(out).size} B`)
}

async function main() {
  const srcDir = process.argv[2]
  if (!srcDir) throw new Error('usage: node scripts/craft-models.mjs <source-dir>')
  await MeshoptSimplifier.ready
  mkdirSync(OUT, { recursive: true })
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })
  const only = process.argv.slice(3)
  for (const [name, source] of Object.entries(SOURCES)) {
    if (only.length > 0 && !only.includes(name)) continue
    await build(io, name, source, srcDir)
  }
  if (only.length === 0 || only.includes('new-horizons')) await buildNewHorizons(io, srcDir)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
