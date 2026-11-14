# 0036. Views are paths; a view's own state stays in the hash

Status: Accepted · Date: 2026-11-14

## Context

Every view lived at `/#orrery`, `/#sun` and so on. Google's JavaScript SEO basics page says to
use the History API for views and that Googlebot cannot reliably resolve fragment URLs
(https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).
The canonical tag pinned every state to `/`, no `document.title` was set anywhere in `src/`, the
view dial was `<button>`s (so a crawler found no internal links), and unknown paths answered 200
with the home page, a soft 404. Only the home page could be indexed or ranked (#232, #233).

`/robots.txt` was Cloudflare's managed block, which nobody chose: it turned away several AI
crawlers, set `Content-Signal: ai-train=no` and had no `Sitemap:` line (#234).

## Decision

**Views are paths.** `/` is Earth (the home page), then `/orrery/`, `/sun/`, `/sky/` and
`/orbit/`. Deep-link state stays in the hash, without the view name, so ADR 0033's "the address
is the state" holds: `/orrery/#t=…&focus=…&preset=…&detail=1`, `/sky/#target=…&t=…`,
`/#layers=iss,quakes`, `/orbit/#layers=…`. Switching views pushes history to the new path; state
changes still use `replaceState`. `src/lib/viewRoute.ts` is the one reader and writer of the
address; `src/lib/viewMeta.ts` holds each view's path, title and header subtitle.

**Old links keep working.** Any `#<view>?…` form (`/#orrery?t=…`, `#/sun`, `#earth?layers=…`) is
read, and rewritten in place with `replaceState` the first time the address is read and on every
later address change, so shared links, bookmarks and a hand-typed hash all land on the new form
before any state is read.

**Static shells, no Function.** After `vite build`, `scripts/view-shells.mjs` writes
`dist/orrery/index.html`, `dist/sun/index.html`, `dist/sky/index.html` and `dist/orbit/index.html`
from `dist/index.html`. Each is the same app (same bundle, same preloads, so ADR 0017's first load
is unchanged) with its own title, description, canonical, og and twitter tags, `WebApplication`
JSON-LD and a `<noscript>` paragraph with plain links to all five views. `public/_routes.json`
still includes only `/api/*`. `index.html` carries `WebSite` and `WebApplication` JSON-LD.
`document.title` and the header subtitle follow the view.

**Unknown paths answer 404.** `public/404.html` is a self-contained page in the site's style. A
top-level `404.html` also turns off Pages' single-page-app fallback, which is what made unknown
paths answer 200 (Cloudflare, "Serving Pages": https://developers.cloudflare.com/pages/configuration/serving-pages/).

**AI crawlers are allowed.** The site presents public NASA and NOAA data, and being quotable by AI
assistants is a discovery channel. The owner decided this on 2026-11-14. `public/robots.txt` is
our own: allow all, with a `Sitemap:` line. It replaces Cloudflare's managed robots.txt, which the
owner turns off in the zone. `public/sitemap.xml` lists the five URLs; `public/llms.txt` is a
short description for assistants that read it (Google says no special files are needed for its AI
features, so it is kept short and not maintained further).

## Consequences

- Each view can be indexed, linked and shared as its own page. The dial's items are `<a href>`
  with the same look, ARIA and keyboard behaviour; a plain click navigates in the app, and
  modified clicks (new tab, new window) behave as links.
- The JSON-LD blocks need no CSP change. A `<script>` with a type that is not a JavaScript MIME
  type, `module`, `importmap` or `speculationrules` is a data block: the HTML spec's "prepare the
  script element" returns at the type check, before it asks Content Security Policy whether the
  inline script may run (https://html.spec.whatwg.org/multipage/scripting.html#prepare-the-script-element).
  `script-src` still allows no inline script.
- A new view needs a row in `viewMeta.ts` and copy in `view-shells.mjs`; `renderShell` throws if
  `index.html` loses a tag it rewrites, so a shell cannot ship with the home page's canonical.
- Costs: the build has one more step; `viewRoute.ts` and the titles are in the first load
  (153.1 to 153.8 kB gzip); history now has real paths, so a server that serves `/orrery/` must
  keep serving the shell (Pages does).
- Allowing AI crawlers means the site's content can be used to train and answer; the data is
  public NASA and NOAA data and the code is open. Revisit if crawler load shows up in the Worker's
  CPU or request counts (the `/api/*` routes are the costly ones), or if the owner's view changes.
- Not covered here: an orrery share card (#232 item 5) and the zone's robots.txt setting, which
  is a Cloudflare change made by the owner.

## Evidence

- #232, #233, #234; ADR 0033 (the address is the state), ADR 0017 (first load), ADR 0014 (the
  guide teaches through links; its lessons apply links in code, not by URL, so they did not change).
- `src/lib/viewRoute.ts`, `src/lib/viewMeta.ts`, `src/hooks/useHashView.ts`,
  `src/hooks/useViewTitle.ts`, `src/components/nav/OrbitalDial.tsx`, `scripts/view-shells.mjs`,
  `public/404.html`, `public/robots.txt`, `public/sitemap.xml`, `public/llms.txt`.
- Tests: `tests/unit/view-route.test.ts`, `view-shells.test.ts`, `crawler-files.test.ts`,
  `hash-view.test.ts`; `tests/e2e/view-paths.spec.ts`.
