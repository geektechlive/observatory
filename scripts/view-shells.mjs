// Static shells for the views (ADR 0036): after `vite build`, writes dist/orrery/index.html,
// dist/sun/index.html, dist/sky/index.html and dist/orbit/index.html from dist/index.html.
// Each is the same app (same bundle, same preloads) with its own title, description,
// canonical, share tags, JSON-LD and noscript text, so a crawler that reads only the HTML
// of /orrery/ finds the orrery and not the Earth page. No Function: Pages serves these files.
//
// `renderShell` is pure and is tested against the source index.html (tests/unit/view-shells
// .test.ts), because `pnpm verify` runs the unit tests before the build.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { CONSOLE_VIEWS, SITE_ORIGIN, VIEW_META } from '../src/lib/viewMeta.ts'

/**
 * What each shell says. Descriptions and sources follow README.md ("What it shows", "Data
 * sources and credits"); say here only what the view shows.
 */
export const SHELL_COPY = {
  earth: { name: 'Earth' },
  orrery: {
    name: 'Orrery',
    description:
      'A 3D orrery of the solar system: the planets, major moons, Voyager 1 and 2, New Horizons and other spacecraft, and passing asteroids. Run it from 3000 BC to 3000 AD.',
    about:
      'A full-page 3D solar system you can drag, zoom and run through time: the planets, their major moons, spacecraft such as Voyager 1 and 2 and New Horizons, near-Earth asteroids and tracked satellites around Earth.',
    sources:
      "JPL Horizons and JPL's close-approach data, JPL's approximate planet positions, CelesTrak and Space-Track.org for satellites, NASA 3D Resources for spacecraft models.",
    // Its own share card (#255), built by scripts/og-image.mjs; the other shells keep the home one.
    image: {
      path: '/og-orrery.png',
      alt: "Observatory's orrery: the live Sun and the inner planets' orbits seen from above",
    },
  },
  sun: {
    name: 'Sun',
    description:
      "The live Sun from NASA's Solar Dynamics Observatory and SOHO, with NOAA space weather: X-ray flux and flares, the storm scales, the solar wind and the Kp index.",
    about:
      "The Sun today at three wavelengths, as a magnetogram and in SOHO's coronagraphs, beside NOAA's space weather: flares, the R/S/G storm scales and their forecast, solar wind, geomagnetic indices, CME arrival forecasts and the solar cycle.",
    sources:
      "NASA's Solar Dynamics Observatory and SOHO, NOAA's Space Weather Prediction Center, NASA's DONKI.",
  },
  sky: {
    name: 'Sky',
    description:
      "Tonight's sky: the planets and Moon on a sky chart, rise and set times, comets bright enough to find, near-Earth asteroids this week and NASA's picture of the day.",
    about:
      "The planets and Moon on a sky chart, rise and set times for your location, tonight's cloud cover, comets and asteroids you can look for, JPL Sentry's impact-risk list, recent fireballs and NASA's Astronomy Picture of the Day.",
    sources:
      "JPL Horizons, JPL Sentry and fireball data, NASA's NeoWs and APOD, the US Naval Observatory, Open-Meteo.",
  },
  orbit: {
    name: 'Orbit',
    description:
      "Who is in space right now, the ISS on a 3D globe, the Deep Space Network's live links, the next launches and space news.",
    about:
      "Who is in space right now, the ISS on a 3D globe in true colour, the Deep Space Network's live links to spacecraft, the next launches and space news.",
    sources:
      "CelesTrak for the ISS orbit, NASA's Deep Space Network Now, RocketLaunch.live for launches, the International Space Station APIs, the Spaceflight News API.",
  },
}

const SHELL_VIEWS = CONSOLE_VIEWS.filter((v) => v !== 'earth')
const NOSCRIPT_STYLE = `<style>
        .noscript {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100dvh;
          /* --void and --bone-dim as hex; no tokens before the app's CSS loads */
          background: #030101;
          color: #a9a49c;
          font-family: 'IBM Plex Mono', ui-monospace, monospace;
          font-size: 0.875rem;
          letter-spacing: 0.05em;
          text-align: center;
          gap: 12px;
          padding: 24px;
        }
        .noscript p {
          max-width: 60ch;
          margin: 0;
        }
        .noscript a {
          color: #c46b39;
        }
        .noscript-title {
          color: #c46b39;
          font-size: 1.1rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          margin: 0;
        }
      </style>`

const escapeHtml = (s) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

const urlOf = (view) => `${SITE_ORIGIN}${VIEW_META[view].path}`

/** The five view links, as plain anchors a crawler (or a visitor without JavaScript) can follow. */
function viewLinks() {
  const items = CONSOLE_VIEWS.map(
    (v) => `<a href="${VIEW_META[v].path}">${escapeHtml(SHELL_COPY[v].name)}</a>`,
  )
  return `<nav aria-label="Views">${items.join(' · ')}</nav>`
}

function noscriptBlock(view) {
  const copy = SHELL_COPY[view]
  return `<noscript>
      ${NOSCRIPT_STYLE}
      <div class="noscript">
        <h1 class="noscript-title">Observatory: ${escapeHtml(copy.name)}</h1>
        <p>${escapeHtml(copy.about)}</p>
        <p>Sources: ${escapeHtml(copy.sources)}</p>
        <p>JavaScript is required to display live NASA data.</p>
        ${viewLinks()}
      </div>
    </noscript>`
}

/** JSON for a `<script type="application/ld+json">`; `<` is escaped so no value can close it. */
const jsonLd = (data) => JSON.stringify(data).replaceAll('<', '\\u003c')

function applicationLd(view) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: `Observatory: ${SHELL_COPY[view].name}`,
    url: urlOf(view),
    applicationCategory: 'EducationalApplication',
    description: SHELL_COPY[view].description,
    isAccessibleForFree: true,
    operatingSystem: 'Web',
  }
}

/** Replaces the one match of `pattern`; throws if index.html has changed and nothing matches. */
function replaceOnce(html, pattern, replacement, what) {
  if (!pattern.test(html)) throw new Error(`view-shells: index.html has no ${what} to replace`)
  return html.replace(pattern, () => replacement)
}

const metaTag = (attr, key) => new RegExp(`<meta\\s+${attr}="${key}"\\s+content="[^"]*"\\s*/>`)

/**
 * The shell for a view, from index.html's text. Every replacement must match, so an edit to
 * index.html cannot silently leave a shell with the home page's canonical.
 */
export function renderShell(indexHtml, view) {
  const meta = VIEW_META[view]
  const copy = SHELL_COPY[view]
  if (!SHELL_VIEWS.includes(view)) throw new Error(`view-shells: no shell for ${view}`)
  const url = urlOf(view)
  let html = indexHtml
  html = replaceOnce(
    html,
    /<title>[^<]*<\/title>/,
    `<title>${escapeHtml(meta.title)}</title>`,
    '<title>',
  )
  const metas = [
    ['name', 'description', copy.description],
    ['property', 'og:title', meta.title],
    ['property', 'og:description', copy.description],
    ['property', 'og:url', url],
    ['name', 'twitter:title', meta.title],
    ['name', 'twitter:description', copy.description],
    ...(copy.image
      ? [
          ['property', 'og:image', `${SITE_ORIGIN}${copy.image.path}`],
          ['property', 'og:image:alt', copy.image.alt],
          ['name', 'twitter:image', `${SITE_ORIGIN}${copy.image.path}`],
          ['name', 'twitter:image:alt', copy.image.alt],
        ]
      : []),
  ]
  for (const [attr, key, value] of metas) {
    html = replaceOnce(
      html,
      metaTag(attr, key),
      `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`,
      `${key} meta`,
    )
  }
  html = replaceOnce(
    html,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/,
    `<link rel="canonical" href="${url}" />`,
    'canonical link',
  )
  // The home page's WebSite block stays on the home page; this view carries its own app block.
  html = replaceOnce(
    html,
    /\s*<script type="application\/ld\+json" id="ld-website">[\s\S]*?<\/script>/,
    '',
    'WebSite JSON-LD',
  )
  html = replaceOnce(
    html,
    /<script type="application\/ld\+json" id="ld-app">[\s\S]*?<\/script>/,
    `<script type="application/ld+json" id="ld-app">${jsonLd(applicationLd(view))}</script>`,
    'WebApplication JSON-LD',
  )
  return replaceOnce(
    html,
    /<noscript>[\s\S]*?<\/noscript>/,
    noscriptBlock(view),
    '<noscript> block',
  )
}

export const shellViews = SHELL_VIEWS

/**
 * The tags that make the first load: scripts, preloads and stylesheets. Every shell must
 * keep index.html's exactly, so a view's first load is the home page's (ADR 0017).
 */
export function loadTags(html) {
  return [...html.matchAll(/<script\b[^>]*\bsrc=[^>]*>|<link\b[^>]*\brel="(?:modulepreload|preload|stylesheet)"[^>]*>/g)].map(
    (m) => m[0],
  )
}

function main() {
  const dist = join(fileURLToPath(new URL('..', import.meta.url)), 'dist')
  const indexHtml = readFileSync(join(dist, 'index.html'), 'utf8')
  const want = JSON.stringify(loadTags(indexHtml))
  for (const view of SHELL_VIEWS) {
    const dir = join(dist, VIEW_META[view].path)
    mkdirSync(dir, { recursive: true })
    const html = renderShell(indexHtml, view)
    if (JSON.stringify(loadTags(html)) !== want) {
      throw new Error(`view-shells: ${view}'s load tags differ from index.html's (ADR 0017)`)
    }
    writeFileSync(join(dir, 'index.html'), html)
    console.log(`view-shells: wrote ${VIEW_META[view].path}index.html`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
