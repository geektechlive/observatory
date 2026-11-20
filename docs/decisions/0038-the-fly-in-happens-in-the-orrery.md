# 0038. The spacecraft fly-in happens in the orrery itself: it eases to true scale, then flies in

Status: Accepted · Date: 2026-11-20

## Context

- The owner found the fly-in's separate close-up (ADR 0037) jarring. In his words: "That extra window is jarring and breaks the feeling of flying up to the object from the orrery view." He wanted "Look closer" to stay in the orrery and zoom in to where it goes now.
- ADR 0037's addendum (2026-11-18) corrected the record: one engine is possible. NASA Eyes on the Solar System flies from its overview to a true-size model on one three.js canvas. This orrery's Proportional mode already draws true distances and radii. Only the default Big bodies view (and Log distance) has no continuous path to true scale.
- A two-canvas hand-over was weighed and rejected. In numbers it is a dissolve between two different pictures: the Sun shrinks about 37 times across the fade, and the field of view jumps from 30° to 35°.
- Three options were costed:
  - B+: an ease to true scale, then one continuous flight;
  - A: true scale blended in gradually with zoom, from anywhere;
  - the two-canvas hand-over.
- The owner chose B+ on 2026-11-19, on the grounds that "B+ is how NASA does it".
- One depth buffer cannot hold a 3 m craft a few hundred metres away and the planets at once. Eyes writes its own linear-then-log depth for that. three.js's `logarithmicDepthBuffer` is set when the renderer is made, would cost every normal orrery frame, and would need the satellites' shader patched. Even then it rounds 1 + w to 1 below about 1e-7 scene units, so the model's own parts would not sort.
- A Codex review of the plan (2026-11-20) found real gaps, all fixed before building:
  - the collision check sampled a path that could miss a planet;
  - the true model size used the wrong radius;
  - there was no wait for the model;
  - a fast clock could move the bodies under the planned path;
  - the Moon was hidden at true scale;
  - faded labels could still be clicked.

## Decision

"Look closer" on a spacecraft with ESA DISCOS sizes, and zoom-to-enter, run in the orrery itself (B+):

- **Ease (0.7 s; 1 s in the first build, a little long for the owner, 2026-11-20).** Every body, orbit and the craft's path eases from the visitor's scale to true scale. Positions are lerped and radii interpolated geometrically. The Earth frame closes, the moons go to their true places, and the real stars come out. The camera pulls back so the body nearest the craft keeps about its separation on screen, and the badge reads TRUE SCALE.
- **Flight (4 s, the owner's earlier choice).** The camera flies in to the model at its real size, eased in log distance. It comes straight in along the visitor's own line of sight and goes straight back out along it (owner, 2026-11-20: the first build's turn to the framing side, opposite the biggest-looking body as ADR 0037 had it, swung the camera up to 180°, more or less depending on where the visitor was looking). It turns to the framing side only when a body sits on that line in. Lines, other markers and labels fade between 30 and 3 million km.
- **Back.** Back, Escape, or a fresh push out at the zoom-out wall (the model about 12 px) reverses it: back out, then the ease back to the visitor's scale and view.
- **Reduced motion** cuts straight to each end.
- **Two passes, no log depth.** During the fly-in the orrery draws everything but the model with its near plane set from the nearest body's surface. It then clears depth and draws the model in a small scene of its own, in units of the model's radius, with a camera matched in 64-bit numbers (`nearPass.ts`). Nothing can stand between the camera and a craft a few hundred metres away; before that, the model is under a pixel. The normal orrery is unchanged: one pass, as before.
- **A preset, a new selection or a scale change in the fly-in** first puts the camera back at the visitor's view, so the move starts there (from the fly-in's spot a preset swung about 160°).
- **The turn, when there is one, never meets a body.** It is planned so that it cannot: each body is tested against the part of the turn made at its own distance, exactly (`flyInPath.ts` `turnClear`). Failing that, the turn happens in the ease; failing that, the flight comes straight in on the visitor's side.
- The bodies are held at the epoch the fly-in began while the camera moves, so a fast clock cannot move them under the path. Once arrived, the clock is live again.
- **The studio stays for the rest.** Satellites, and craft without DISCOS sizes, keep the studio close-up and its own canvas (ADR 0021).

## Consequences

- What reads as a "new window" is gone for spacecraft. The rail, the time bar and the inspector stay, and the picture never cuts.
- `OrreryRenderer` now carries a fly-in mode, the thing ADR 0021 avoided. Most of it lives outside the renderer:
  - `flyInDriver.ts` (state and camera);
  - `lib/orrery/flyInPath.ts` (timeline, pure and unit-tested);
  - `nearPass.ts` and `starField.ts`.

  The renderer gates its own camera writers on it: the follow, the min-distance sync, the inset refit, the pan release and presets.

- Some things are dropped or still to measure:
  - The old close-up's own sky (`trueSky.ts`) and flight (`flight.ts`) are gone.
  - The orrery's bodies at true scale keep a floor of 1.5 px close in, a point of light rather than nothing; the old close-up let them fall under a pixel.
  - The flight measured 60 fps at phone size with a 4 times CPU slowdown (Chromium, 2026-11-20). A real phone has not been measured yet.
- Revisit:
  - if a real phone drops frames in the flight;
  - if the owner wants Option A (true scale blended in from any zoom);
  - if satellites should fly in too.

  Satellites have no Horizons track or DISCOS framing in the orrery.

## Evidence

- #268; ADR 0037 and its 2026-11-18 addendum; ADR 0021.
- `src/components/orrery/three/flyInDriver.ts`, `src/components/orrery/three/nearPass.ts`, `src/lib/orrery/flyInPath.ts`, `src/components/orrery/FlyInOverlay.tsx`.
- `OrreryRenderer.ts`: `enterFlyIn(`, `drawScene(`, `blend(`, `applyDecor(`.
- `tests/unit/orrery-fly-in-path.test.ts`, `tests/unit/orrery-fly-in-driver.test.ts`, `tests/unit/orrery-fly-in-overlay.test.tsx`, `tests/e2e/orrery-fly-in.spec.ts`.
- [reference/orrery.md](../reference/orrery.md), "The detail view".
