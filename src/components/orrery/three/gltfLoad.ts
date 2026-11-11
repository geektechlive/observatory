/**
 * The one way the orrery fetches a GLB (#115, #203): the focused-model layer and the
 * detail view both call this, so GLTFLoader is a single lazy chunk. The models need no
 * decoder (scripts/craft-models.mjs).
 */
import type { ModelLoader } from './craftModelLoad'

export const loadGltfScene: ModelLoader = (url) =>
  import('three/examples/jsm/loaders/GLTFLoader.js')
    .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(url))
    .then((gltf) => gltf.scene)
