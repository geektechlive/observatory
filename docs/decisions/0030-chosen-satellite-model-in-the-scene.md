# 0030. The chosen satellite draws as its model in the scene, at a fixed size

Status: Accepted · Date: 2026-11-12

## Context

Only Look closer showed satellite models (ADR 0021). #194 asks for the chosen satellite's model in
the 3D scene, in place of its marker. The Earth frame is true scale, so a low-orbit satellite is
far smaller than a pixel. A first build drew the model at a size that stayed clear of Earth and
under the Sun: about 4 px for the ISS and Hubble and 7 px for a geostationary bus, the size of the
dot it replaced, so it showed nothing new.

The options put to the owner were (a) a close-up camera that flies in to the satellite, (b) a
fixed readable size, labelled as not to scale, the way spacecraft icons work, and (c) no in-scene
models. The owner chose (b) on 2026-11-12.

## Decision

- A second `CraftModelLayer` holds the chosen satellite's model, so a craft focus and a satellite
  choice never clear each other. Only the chosen one loads, and it is disposed when the choice
  moves.
- **Size: two cases, by whether the Sun is on screen (owner, 2026-11-12, after seeing 9 px).**
  - **Sun on screen:** the focused craft's rule, `craftModelPx(sunPx)` (#204): 0.9 of the Sun's drawn
    radius, 9 px at its floor, 18 px across. The Sun rule (#195, #204: nothing near Earth outgrows
    the Sun) keeps its meaning where the Sun can be compared with the model.
  - **Sun off screen (the usual Earth-orbit view):** 20 px radius, about 40 px across.
  - Either way it does not follow the satellite's real size or height, is held to a quarter of
    Earth's drawn radius so a far-off Earth is never swallowed, and is never under the marker.
  - "On screen" is the projected Sun: in front of the camera, its disc reaching into the view
    (`sunOnScreen`). Once on it stays on until the disc is 48 px clear of the view: a Sun
    drifting along an edge (camera, or time playing) would otherwise flip the model between 9 and
    20 px every frame. The size change at the edge is a step, not an animation.
- **The ring** is 1.25 of the model, and under 0.95 of the Sun while the Sun is on screen.
- **Labelled as not to scale.** The stage's NOT TO SCALE badge is always on. The inspector's
  Shape row says "Its own model once loaded, drawn at a fixed size" and "not to scale", the wording
  spacecraft already use.
- **Own models only.** A satellite with only a family stand-in (CubeSat, generic bus, the shared
  TDRS models) keeps its dot in the scene. Look closer still shows the stand-in with its note
  (ADR 0028). At a fixed size every satellite of a family would show the same shape with no way
  to read the note at that size, which implies a shape we do not have.
- Facing: the descriptor's `attitude` is read in scene space (`earth` is nadir, `sun` points at
  the Sun). Roll about the axis is free.

## Consequences

- The Earth guard decides the default view. Measured on a real GPU at 1440x900, Earth's drawn
  radius at the default Earth-orbit view is 56 px, so a quarter is 14 px (28 across), not 20. The
  full 20 px needs Earth at 80 px, which a few zoom steps give. If 40 px across is wanted at the
  default view, the guard share has to go from 0.25 to 0.36: a separate call, since the model
  would then cover more of a small Earth.
- The ISS goes from 4 px to 14 px radius at the default view. Readable as a shape; Look closer is
  still where detail is. Option (a) remains open.
- A LEO model is bigger than its height above Earth, so part of it can sit in front of or behind
  the limb. Accepted: it is a symbol, not a body.
- The ring can reach the satellite's label at 20 px.
- Cost: a few kB in the lazy orrery chunk. Nothing in the first load.
