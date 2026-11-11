# 0021. The close-up model view has a canvas and renderer of its own, and the orrery steps aside

Status: Accepted · Date: 2026-11-10

## Context

The "Look closer" view (#203) shows one spacecraft or satellite model large, lit, and turnable
with the pointer. The orrery's single `OrreryRenderer` is built for a solar system: its camera has a
minimum distance and a minimum pixel size per body tuned for planets, a frame loop that updates
bodies, labels and the Earth frame, a stage picker, a view inset that keeps the focus clear of the
inspector, and controls that follow the focus. A devil's-advocate review of the first plan (reuse
the renderer, with a "detail mode") listed what that mode would have to guard: the frame loop,
the label positions, the stage picker, the view inset and the camera controls. Each guard
missed would be a bug of its own. `OrreryRenderer.detach()` already exists, is tested, and stops
the loop, the tick and the Sun image, takes the canvas off the page and keeps the scene.

## Decision

The owner decided (2026-11-10, on #203, replacing the issue's item 2) that the view gets its own
small canvas and `WebGLRenderer`, mounted only while the view is open. When it opens, the orrery
pauses with `detach()`. When it closes, the detail renderer is disposed in full (controls, the
model's GPU resources, `renderer.dispose()` and `forceContextLoss()`) and the orrery re-attaches
to the stage. The view is a lazy chunk with its own `check-bundle` budget. The first load grows by
18 bytes gzip (151,237 to 151,255 bytes, built at f30e69f and at this change): the entry's
preload map names one more lazy chunk, the shared GLB loader. One effect on the page owns
`attach` and `detach`.

## Consequences

- The orrery renderer gains no close-up mode, no new guard and no new state; its `schedule()` is
  still the only place a frame is requested. The detail scene is one small file and knows
  nothing of planets, labels or the picker.
- **Cost: a second WebGL context exists while the view is open**, and the orrery's own sits idle. A
  browser allows a limited number of live contexts, so the view must free its own on close; a
  test opens and closes it 30 times and checks that nothing is left, and another opens a textured
  model 12 times and checks that none of its geometries or textures remain on the GPU.
- The inspector stays mounted over the view as the facts column, so the facts are one component
  in one place, not a second copy.
- **Alternatives ruled out:**
  - _Reuse the one renderer._ It needs the guards listed above, and every guard is a new way for
    the orrery to break.
  - _A model in the main scene._ The camera's minimum distance and minimum pixel size are
    tuned for planets and spacecraft icons, so a model at inspection size breaks them.
  - _A pre-rendered image._ The model could not be turned, which is the point of the view.
- Revisit if browsers' context limits start to bite on phones (the second context is the whole
  cost), or if the orrery renderer is split so that a scene can be swapped without guards.

## Evidence

- #203 and the owner's design comment on it (2026-11-10).
- `src/components/orrery/three/DetailScene.ts` and `src/components/orrery/DetailView.tsx`.
- `OrreryPage.tsx`: the effect keyed on `detailOpen` that calls `renderer.attach(` and
  `renderer.detach()`.
- `OrreryRenderer.ts`: `detach()`, and `schedule()` guarded by `this.attached`.
- `tests/e2e/orrery-detail-view.spec.ts`: the 30-open soak, the textured-GLB soak, the detach
  check and the abort-on-close check.
- `scripts/check-bundle.mjs`: `detailViewGzip` and the `*-detail-*` rules.
- ADR 0020 and `docs/reference/satellite-models.md` for the models themselves.
