# cosmo.observatory

A real-time NASA data dashboard for the web — live ISS tracking, EONET natural events, near-Earth asteroid close approaches, JPL Sentry impact risk, space weather (DONKI), fireballs, and NASA's Astronomy Picture of the Day.

Live at **[observatory.geektechlive.com](https://observatory.geektechlive.com)**

<img width="1461" height="814" alt="Screenshot 2026-04-29 at 9 27 05 PM" src="https://github.com/user-attachments/assets/8be50245-dafc-4267-99ae-70894ed80ffe" />

## Credits

This project is a port of and is inspired by **[cosmo-tui](https://github.com/irahulstomar/cosmo-tui)** by [Rahul Tomar (@irahulstomar)](https://github.com/irahulstomar) — a beautifully crafted Python Textual terminal dashboard for NASA's open APIs. cosmo-tui demonstrated that NASA's data could be made genuinely compelling to look at. This web version carries that spirit into a browser.

## Data sources

Thirty-two endpoints across NASA, NOAA, USGS and others, grouped by console:

| Console   | Sources                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Earth** | EONET events, USGS earthquakes, GDACS disasters, FIRMS fires, OpenAQ air quality, NWS alerts, NDBC buoys, live aircraft (adsb.lol), EPIC imagery   |
| **Sun**   | GOES X-ray and solar wind, planetary Kp, Kyoto Dst, IMF Bz, DONKI CME, SWPC alerts, solar cycle, SDO and SOHO LASCO imagery                        |
| **Sky**   | APOD, sun/moon ephemeris, JPL Horizons planets, exoplanet archive, Mars weather, space news, CO2                                                   |
| **Orbit** | ISS TLE and SGP4 tracking, satellite catalog, launch schedule, people in space, NEO close approaches, JPL Sentry and fireballs, Deep Space Network |

API calls are proxied through Cloudflare Pages Functions, so API keys never reach
the browser. Responses are cached with the Cloudflare Cache API; Workers KV holds
only durable fallbacks, written out-of-band by a scheduled GitHub Action.

Every source carries a content contract in `src/lib/health.ts`. A feed that changes
shape and starts returning an empty-but-valid payload grades as an error and the
header reads DEGRADED rather than LIVE.

## Design

The Phase 1 visual-direction mockup (Glass / Luxury Futurist) is kept as design
history at [docs/design-history/mockups.html](docs/design-history/mockups.html).

## Stack

- **Frontend**: Vite 8 + React 19 + TypeScript (strict)
- **Data**: TanStack Query v5 with per-endpoint polling intervals; Zod schemas on every response
- **Map**: MapLibre GL JS + CARTO Dark Matter tiles
- **Orbit math**: satellite.js v5 (SGP4 propagation, in-browser)
- **State**: Zustand (layer toggles and map mode persisted)
- **API proxy**: Cloudflare Pages Functions, Cloudflare Cache API for responses, Workers KV for durable fallbacks
- **Hosting**: Cloudflare Pages at observatory.geektechlive.com

## Local development

```bash
pnpm install

# Vite dev server (no CF Functions):
pnpm dev

# With Pages Functions and KV bindings:
pnpm pages:dev
```

Create `.dev.vars` (gitignored) for local Pages Functions:

```
NASA_API_KEY=your_key_here
FIRMS_MAP_KEY=your_key_here
OPENAQ_API_KEY=your_key_here
```

### Scheduled data refresh

`.github/workflows/data-refresh.yml` writes TLE and launch snapshots into Workers KV
twice a day, and probes the live endpoints every six hours. It needs three repository
secrets: `CLOUDFLARE_API_TOKEN` (scoped to Workers KV Storage: Edit),
`CLOUDFLARE_ACCOUNT_ID`, and `DISCORD_BOT_TOKEN` + `DISCORD_CHANNEL_ID` for failure alerts.

## Commands

```bash
pnpm build       # production build → dist/
pnpm typecheck   # tsc strict check
pnpm lint        # ESLint + stylelint
pnpm test:unit   # Vitest unit tests
pnpm test:e2e    # Playwright e2e
```

## License

MIT. See [LICENSE](LICENSE).

The upstream cosmo-tui project is also MIT licensed. Attribution to @irahulstomar is preserved in the status bar About popover, the footer, and here.
