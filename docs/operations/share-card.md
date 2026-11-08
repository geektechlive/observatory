# The share card (#110)

The card is generated: `node scripts/og-image.mjs [baseURL]`. Re-run it after a visual change to
the globe or the header, and commit `public/og-image.png`.

- **The design is "one lens, one line"**, after the owner called a busier first version "a bit
  busy and kind of not professional looking". It has the copper globe on void, the painted name,
  one Fraunces line and a credit line. Don't add chips, backdrops or markers back.
- **The capture.** It screenshots the live site's globe in Chromium on the real GPU. It refuses to
  run if the globe draws `sprites` rather than `bloom`, so it needs a Mac, not SwiftShader.
  - It loads `#earth?layers=terminator`. With `layers=` alone, the night side and its city lights
    go as well.
  - It hides the bezel's minor ticks, numerals and census arc.
  - It waits for `data-globe-textures="4096"`. It polls from Node, because the site's CSP blocks
    the eval a string `waitForFunction` needs.
- **The lighting is fixed.** The page clock is set (`page.clock.setFixedTime`) to the UTC hour
  whose lighting frames best. At some hours the evening terminator runs down the Pacific and no
  facing near it shows land.
- **The framing.** The globe can't be dragged. The script waits for its turn (3.44°/s) to reach
  subsolar +60…80°, so the terminator sits about 20° east of centre, then hovers to stop it.
- **The output.** The capture is composed in `scripts/og/template.html` at 1200×630, then written
  as a palette PNG under 300 KB.
- `tests/unit/share-meta.test.ts` checks the PNG and keeps the og and twitter tags in step. It
  also bans "cosmo" and em dashes from the `<head>`. The old card said "cosmo.observatory" for
  months.
- Platforms cache previews by URL. Discord and iMessage refresh on their own schedule; X and
  LinkedIn have inspector tools to force it.
