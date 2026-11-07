/**
 * Simplified models for craft with no NASA model to reuse (#115): Psyche and Lucy have
 * none published, and ESA's BepiColombo and Solar Orbiter wait on ESA's licence answer.
 * Built from boxes, cylinders and discs; the inspector calls them a simplified model.
 * Each points its +Y (heat shield, or the face of its arrays) at the Sun.
 */
import {
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three'

import type { StandInKey } from '@/lib/orrery/craftModels'
import { CRAFT_MODEL_HEX } from '@/lib/palette'

type Finish = keyof typeof CRAFT_MODEL_HEX

function material(finish: Finish): MeshStandardMaterial {
  const color = new Color(CRAFT_MODEL_HEX[finish])
  return new MeshStandardMaterial({
    color,
    // A little self-light so the side away from the Sun still shows its shape.
    emissive: color.clone().multiplyScalar(0.18),
    metalness: finish === 'foil' ? 0.5 : 0.2,
    roughness: 0.55,
    flatShading: true,
    side: DoubleSide,
  })
}

function box(w: number, h: number, d: number, finish: Finish, x = 0, y = 0, z = 0): Mesh {
  const m = new Mesh(new BoxGeometry(w, h, d), material(finish))
  m.position.set(x, y, z)
  return m
}

/** A flat panel lying in the XZ plane (its face toward +Y). */
function panel(w: number, d: number, x: number, z = 0): Mesh {
  return box(w, 0.04, d, 'cells', x, 0, z)
}

function disc(radius: number, x: number): Mesh {
  const m = new Mesh(new CircleGeometry(radius, 32), material('cells'))
  m.rotation.x = -Math.PI / 2
  m.position.set(x, 0, 0)
  return m
}

const BUILD: Record<StandInKey, () => Mesh[]> = {
  // A boxy body between two X-shaped arrays of five panels.
  psyche: () => [
    box(1.2, 1.2, 1.4, 'foil'),
    ...[-1, 1].flatMap((side) => [panel(3.2, 0.7, side * 2.6), panel(0.7, 3.2, side * 2.6)]),
  ],
  // Two big round arrays either side of a small body.
  lucy: () => [box(1, 1.2, 1, 'foil'), disc(1.9, -2.9), disc(1.9, 2.9)],
  // A heat shield over the body, two angled wings, and the instrument boom behind.
  'solar-orbiter': () => {
    const left = panel(2.2, 0.8, -2.1)
    const right = panel(2.2, 0.8, 2.1)
    left.rotation.z = 0.5
    right.rotation.z = -0.5
    const boom = new Mesh(new CylinderGeometry(0.05, 0.05, 3, 6), material('structure'))
    boom.position.set(0, -2.2, 0)
    return [box(2.4, 0.15, 2.4, 'white', 0, 0.9), box(1.5, 1.4, 1.5, 'foil'), left, right, boom]
  },
  // The stacked cruise composite: a long column of modules with one long wing.
  bepicolombo: () => [
    box(1.6, 1, 1.6, 'white', 0, 0.9),
    box(1.8, 1.2, 1.8, 'foil', 0, -0.3),
    box(1.4, 1.4, 1.4, 'structure', 0, -1.6),
    panel(4.5, 1, 3.1),
  ],
}

export function buildStandIn(key: StandInKey): Group {
  const group = new Group()
  group.name = `stand-in:${key}`
  group.add(...BUILD[key]())
  return group
}
