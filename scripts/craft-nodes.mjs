/**
 * Remove named nodes, and the meshes only they use, from a glTF Document before a model is
 * simplified (#194). For parts of a source model that are modelling leftovers and not part of
 * the object, such as the ISS (B) file's seven flat discs 15 units above the station. Throws
 * if a name matches no node, so a list that no longer fits its source cannot pass silently.
 * No imports: it only calls the Document's own methods.
 */
export function dropNodes(doc, names) {
  for (const name of names) {
    const found = doc
      .getRoot()
      .listNodes()
      .filter((node) => node.getName() === name)
    if (found.length === 0) throw new Error(`dropNodes: no node named ${name}`)
    for (const node of found) {
      const mesh = node.getMesh()
      node.dispose()
      if (mesh && mesh.listParents().every((parent) => parent.propertyType === 'Root')) {
        mesh.dispose()
      }
    }
  }
}

/**
 * Draw named materials in a plain colour, without their colour texture (#194). For a source
 * whose material shows the wrong picture, such as the Aqua (B) file's array back, coloured
 * with a normal map. `colours` maps material name to an RGBA factor. Throws if a name matches
 * no material, so an entry that no longer fits its source cannot pass silently.
 */
export function plainMaterials(doc, colours) {
  for (const [name, colour] of Object.entries(colours)) {
    const found = doc
      .getRoot()
      .listMaterials()
      .filter((m) => m.getName() === name)
    if (found.length === 0) throw new Error(`plainMaterials: no material named ${name}`)
    for (const material of found) material.setBaseColorTexture(null).setBaseColorFactor(colour)
  }
}
