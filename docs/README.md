# Observatory docs

- **[decisions/](decisions/README.md):** settled decisions and why. Read before re-proposing
  anything they cover.
- **reference/**, by area. Each carries the details, measurements and history behind the rules
  in `CLAUDE.md`.
  - [data-feeds-and-monitoring.md](reference/data-feeds-and-monitoring.md): upstream quirks, the
    response cache, error kinds, stale-while-revalidate, the health check, incident issues, the
    KV refresh job, Cloudflare zone notes.
  - [bundle-and-loading.md](reference/bundle-and-loading.md): first-load budget, chunking,
    orrery prefetch, the first view from the hash, Earth textures, layout shift, measurements.
  - [globe-and-design.md](reference/globe-and-design.md): colours, page layout, expand, the
    globe, the map, fonts.
  - [orrery.md](reference/orrery.md): the orrery page, renderer, presets, labels, playback,
    links, guide, imagery, spacecraft models.
  - [orrery-data.md](reference/orrery-data.md): craft, moons, close approaches, the Earth frame,
    comets, on-demand JPL.
  - [satellites.md](reference/satellites.md): satellites, the satellite browser, Space-Track and
    DISCOSweb, satellite.js 7.
  - [satellite-models.md](reference/satellite-models.md): which 3D models exist for Earth-orbit
    satellites, their licences, and the gaps (#194).
  - [dependencies.md](reference/dependencies.md): updates, the two TypeScripts, pins, pnpm 12.
- **operations/**, runbooks.
  - [landing.md](operations/landing.md): issue to production, the gate.
  - [local-dev.md](operations/local-dev.md): commands, secrets, the JPL queue locally, a real GPU
    in Playwright, test conventions.
  - [share-card.md](operations/share-card.md): regenerating `public/og-image.png`.
- [history.md](history.md): the phases, oldest first.
- [design-history/](design-history/): the ROCI v2 spec, audit and prototypes.
