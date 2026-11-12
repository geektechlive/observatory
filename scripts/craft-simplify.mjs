import { simplifyPrimitive, weld } from '@gltf-transform/functions'

/**
 * Simplify every triangle primitive of `doc` to `ratio`, as glTF-Transform's simplify() does,
 * except the primitives whose material name starts with one of `keep`, which are left as
 * they are (#194). Some NASA models (Fermi, ICESat-2) build each solar array from hundreds of
 * small cell quads over a backing: simplifying collapses cells, and even with their open
 * edges locked it thins the grid inside a panel, so a panel shows holes or see-through
 * wedges. The arrays are a minority of the triangles, so keeping them whole costs less than
 * a higher budget for the whole model would. Throws if a prefix matches no material, so an
 * entry that no longer fits its source cannot pass silently.
 */
export async function simplifyKeeping(doc, { simplifier, ratio, error, keep }) {
  await simplifier.ready
  await doc.transform(weld({ overwrite: false }))
  const materialName = (prim) => prim.getMaterial()?.getName() ?? ''
  const prims = doc
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives().map((prim) => ({ mesh, prim })))
  for (const prefix of keep) {
    if (!prims.some(({ prim }) => materialName(prim).startsWith(prefix))) {
      throw new Error(`simplifyKeeping: no material starts with ${prefix}`)
    }
  }
  const TRIANGLES = 4
  for (const { mesh, prim } of prims) {
    // Both models it serves are indexed triangles; anything else would pass through
    // unsimplified without a word, so stop instead.
    if (prim.getMode() !== TRIANGLES || !prim.getIndices()) {
      throw new Error(
        `simplifyKeeping: ${mesh.getName()} has a primitive that is not indexed triangles`,
      )
    }
    if (keep.some((prefix) => materialName(prim).startsWith(prefix))) continue
    simplifyPrimitive(prim, { simplifier, ratio, error, lockBorder: false })
    if ((prim.getIndices()?.getCount() ?? 0) === 0) {
      mesh.removePrimitive(prim)
      prim.dispose()
    }
  }
  for (const mesh of doc.getRoot().listMeshes()) {
    if (mesh.listPrimitives().length === 0) mesh.dispose()
  }
}
