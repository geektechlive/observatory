# cosmo.observatory

A real-time NASA data dashboard for the web — live ISS tracking, EONET natural events, near-Earth asteroid close approaches, JPL Sentry impact risk, space weather (DONKI), fireballs, and NASA's Astronomy Picture of the Day.

Live at **[observatory.geektechlive.com](https://observatory.geektechlive.com)**

<img width="1461" height="814" alt="Screenshot 2026-04-29 at 9 27 05 PM" src="https://github.com/user-attachments/assets/8be50245-dafc-4267-99ae-70894ed80ffe" />


## Credits

This project is a port of and is inspired by **[cosmo-tui](https://github.com/irahulstomar/cosmo-tui)** by [Rahul Tomar (@irahulstomar)](https://github.com/irahulstomar) — a beautifully crafted Python Textual terminal dashboard for NASA's open APIs. cosmo-tui demonstrated that NASA's data could be made genuinely compelling to look at. This web version carries that spirit into a browser.

## Data sources

| Source                       | Endpoint         |
| ---------------------------- | ---------------- |
| EONET natural events         | NASA EONET v3    |
| Near-Earth Objects           | NASA NeoWs       |
| Impact risk                  | JPL Sentry       |
| Space weather                | NASA DONKI       |
| Astronomy Picture of the Day | NASA APOD        |
| Fireball events              | JPL Fireball API |
| ISS orbital elements         | CelesTrak (TLE)  |

All NASA API calls are proxied through Cloudflare Pages Functions with per-endpoint KV caching. The NASA API key never reaches the browser.

## Stack

- **Frontend**: Vite 8 + React 19 + TypeScript (strict)
- **Data**: TanStack Query v5 with per-endpoint polling intervals
- **Map**: MapLibre GL JS + CARTO Dark Matter tiles
- **Orbit math**: satellite.js v5 (SGP4 propagation, in-browser)
- **API proxy**: Cloudflare Pages Functions + Workers KV
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
```

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
