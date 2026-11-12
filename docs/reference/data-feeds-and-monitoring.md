# Data feeds, caching and monitoring

How the Functions fetch and cache upstream feeds, which upstreams need workarounds, and how
failures become alerts. Decisions:
[ADR 0002](../decisions/0002-stay-on-the-cloudflare-free-plan.md),
[ADR 0003](../decisions/0003-kv-first-feeds-for-blocked-upstreams.md),
[ADR 0004](../decisions/0004-content-contracts-and-issue-per-source-alerts.md).

## Free-plan rules in practice

The rules are in [ADR 0002](../decisions/0002-stay-on-the-cloudflare-free-plan.md). What they
mean day to day:

- All KV writes happen out-of-band in `scripts/refresh-data.mjs` via GitHub Actions. A
  per-request KV write once exhausted the 1,000-a-day budget in hours (fixed in 8e64d2a).
- Without `public/_routes.json` every static asset invokes the Worker; Function invocations once
  tracked total requests almost exactly.
- The Cache API is free and unmetered, but per-colo and evictable, so KV holds only durable
  fallbacks.
- EPIC images are loaded straight from NASA (CSP allowlist), not proxied: they used to stream
  2.6 MB PNGs through a Function.
- Worker CPU is 10 ms per invocation, so parse small feeds: prefer NOAA's 6.5 KB one-hour product
  over the 1.1 MB full feed.

## Upstream quirks

- **CelesTrak is unreachable from Cloudflare Workers egress** (522 since ~2026-09-03) though it
  works from anywhere else. `/api/iss-tle` and `/api/satellites` are KV-first: a GitHub Action
  fetches and validates TLEs from a normal network and writes `tle:iss:v1` /
  `tle:satellites:v1`. The handlers serve fresh KV, then stale KV marked degraded
  (`X-Data-Source: kv-stale`), then a hardcoded fallback (`FALLBACK_TLE` for the ISS, an empty
  list for satellites; `X-Data-Source: fallback`), both with `X-Error-Kind: upstream` so a stale
  copy is held like any upstream outage, not paged at once. They never ask CelesTrak (#214): the request
  could only fail from Workers, and each visitor's cache miss would repeat it.
- **CelesTrak's usage policy** (https://celestrak.org/usage-policy.php, read 2026-11-12): "only
  download data once per update"; GP and SupGP both update every 2 hours; "M2M (machine-to-machine)
  software should immediately stop querying when it receives any non-HTTP 200 responses". Every
  CelesTrak request the refresh job makes (TLEs, the orrery's groups, Starlink's SupGP) follows
  it: one try, and the first non-200 stops CelesTrak for the rest of the run (#212), as
  [satellites.md](satellites.md) describes. The page states no
  numeric error limit and no attribution or redistribution terms.
- **RocketLaunch.live is unreachable from Workers egress too** (seen 2026-10-09, #30), though it
  answers laptops and GitHub runners. `/api/launches` is KV-first: it serves
  `rll:launches:next:v1:backup` (written every 6 h by the refresh job) while it is ≤ 12 h old.
  After that it tries live RLL and logs why it failed, then falls back to the older KV copy marked
  degraded.
- **APOD moved to science.nasa.gov (seen 2026-10-25, #72).** apod.nasa.gov 301s there, and NASA's
  APOD API still scrapes the old page: it answers the real explanation with the title "NASA
  Science" and the NASA logo as `url`. `/api/apod` is KV-first: the refresh job reads the newest
  `/image-article/apod-<date>-…/` page (title from `<h1>`, picture from `og:image`, text from the
  hero description) into `apod:science:v1`, served while ≤ 12 h old. Then NASA's API, which
  rejects the placeholder as a contract failure, then the older KV copy degraded. If the refresh
  starts failing `refresh:apod`, NASA has redesigned the page again: fix `parseApodArticle` in
  `scripts/refresh-data.mjs` against a fresh copy.
- **JPL Horizons answers 503 to overlapping requests from one address (#88, measured
  2026-11-06).** Nine parallel calls got two answers; the same nine one at a time all answered in
  ~140 ms each. `/api/planets` asks one body at a time, and any new Horizons caller must too.
- **NOAA SWPC feed drift (2026-09):** `noaa-planetary-k-index.json` became an array of objects,
  and `solar-wind/{plasma,mag}-7-day.json` returned 404. Solar wind and Bz now come from
  `products/geospace/propagated-solar-wind-1-hour.json` via the shared `functions/api/_swpc.ts`.
  Its cells are numbers, not numeric strings.
- **SWPC active regions and flare odds (#210), `/api/solar-regions`.** Worker-direct, Cache API
  for 30 minutes, key `noaa:solar-regions:v2` (v2: early days, #213). Parsers in
  `src/lib/swpcRegions.ts`.
  - `solar_regions.json` is ~104 kB: about 180 rows, 30 days of daily region reports, newest
    first. Only the newest `observed_date` is validated and kept, and only rows with spots
    (`number_spots > 0` or an area): the Solar Region Summary's "Regions with Sunspots".
    Plage-only and departed regions have neither. Parsing both files measured 0.12 ms warm and
    1.7 ms cold in Node 26 on 2026-11-12, so it fits the 10 ms Worker limit without a
    refresh-job step.
  - A row's position is SWPC's "Locations Valid at" time, the **end** of `observed_date` UTC:
    the 2026-11-11 rows matched SRS 316, "Locations Valid at 11/2400Z", issued 12 Nov 00:30.
    Over all 31 days in the 2026-11-12 file, each day's Carrington longitude plus central
    meridian distance matched the Sun's computed L0 at the end of that day to about 1°.
    Longitude is degrees from the central meridian, **east positive** (S09E65 is 65).
  - **Early days (#213).** The newest day's rows appear during that day, before the summary
    (12 Nov's at 06:12 UTC). They come from individual observatory reports: SWPC's
    `sunspot_report.json` held one for 12 Nov, Learmonth at 01:50, which saw 4566 at S08W48
    and gave it as S08W61, carried forward to 12/2400Z like the summary's positions (the
    row says S08W61 too). So `validAt` is the end of the day even then, hours in the future,
    and `sunDisc.ts` turns the marks back to the image. Area and spot count are that report's.
    Spot and magnetic classes are null, and every region's flare odds are 0, including 4566,
    which had M 40 the day before: placeholders. Regions Learmonth didn't report (4565, 4569)
    are copied from the day before with their classes. Rule: a spotted row with a null
    `spot_class` marks the day `preliminary`; the parser then sets every region's odds to
    null, and the panel shows "–" titled "Not yet issued by SWPC" and says these are early
    reports. No spotted row lacked a class on any of the other 30 days. Chosen over falling
    back to the last complete day because the early positions are a day newer and check out
    against the observatory report; the cost is classes and odds missing until 00:30 UTC.
  - `solar_probabilities.json`: the newest `date` row's `*_1_day` odds are for the **next** UTC
    day. The 2026-11-11 row (M 45, X 5, proton 5) matched the 3-day predictions issued
    11 Nov 22:00 for 12 Nov.
  - A half answer is a 200 marked degraded with `X-Error-Kind` and `X-Data-Source: swpc`. Both
    halves down is a 503, or a 500 when both changed shape. Not a headline source (ADR 0018),
    and not in `check-health.mjs`, like the other below-the-fold Sun feeds.
  - The disc marks (`src/lib/sunDisc.ts`) turn each position by Snodgrass-Ulrich
    differential rotation from the valid time to the SDO image's time, tilt by B0, and scale
    by the limb radius per instrument (AIA 2.4"/px, HMI 2.016"/px in the 1024 px frames; SDO's
    latest frames are north-up). More than 48 h apart, no mark is drawn. Checked against
    HMI's 2026-11-12 05:00 magnetogram: region 4566 projects to (882, 587) px, on its spots.
  - Terms: NOAA/NWS public domain (https://www.weather.gov/disclaimer). The panel credits
    NOAA SWPC with a link, says the data is shown as published, and says the disc marks are
    turned positions; nothing is called official. `www.swpc.noaa.gov` now 301s to
    `www.spaceweather.gov`, so links go there.
- **Upstream drift is silent by default.** A feed that changes shape yields an
  empty-but-HTTP-200 payload. `src/lib/health.ts` gives every source a content contract so this
  reads as an error, and `scripts/check-health.mjs` probes the headline endpoints on a schedule.
- **The on-demand JPL answers have contracts too (#148).** The scheduled probe checks one cached
  Eros span, so it never sees a list, a "not found", a comet or a span past the ephemeris.
  `jpl-lookup` and `jpl-trajectory` in `src/lib/health.ts` (not headline: only a search asks)
  are applied by `src/lib/api/jplLookup.ts`, which calls an answer that fails them "JPL didn't
  answer this time" instead of drawing nothing, and `useLookupHealth` reports them to the store.
- **The header's pill judges the view on screen (#178, ADR 0018).** `VIEW_HEADLINES` lists each
  view's headline sources; SYNCING until they have all reported, LIVE when all pass, DEGRADED
  otherwise. One site-wide list of seven never settled, because no view mounts every hook (on
  2026-11-08 every view read SYNCING indefinitely). `tests/e2e/view-headlines.spec.ts` checks a
  cold load of each view asks for its whole list.
- **Open-Meteo is called straight from the browser (#79), only after the user shares a
  location.** It needs `https://api.open-meteo.com` in `connect-src` (a unit test checks it,
  because dev ignores `_headers`). It sees the visitor's IP and the location rounded to 0.1°, and
  the Tonight panel says so. Its free API is for non-commercial use only, and the limits are per
  IP (10,000/day), so don't proxy it through a Function: that would put every visitor on
  Cloudflare's shared egress limit.
- **NASA GIBS map tiles are fetched straight from the browser (#211)**, like CARTO's: no
  Function, no KV, no health contract (a raster source has no payload to judge). The host is in
  both `img-src` and `connect-src` (`tests/unit/gibs-layers.test.ts` checks it); tiles answer
  `access-control-allow-origin: *`. A day GIBS lacks answers 404 and the tile stays blank.
  - **IMERG lags two days.** At 05:35Z on 2026-11-12 the capabilities' newest
    `IMERG_Precipitation_Rate` day was 2026-11-10 and a 2026-11-11 tile answered 404. No
    latency is published for the daily image (Worldview's layer notes say only that Early IMERG
    arrives "within hours"), so `imergDate()` asks for two days back from noon UTC and three
    before it. The time domain has gap days (2026-02-03 answered 404), which show as no rain.
    If the layer goes blank every morning, the lag has grown: re-read the domain with
    `.../1.0.0/IMERG_Precipitation_Rate/default/GoogleMapsCompatible_Level6/all/<start>--<end>.xml`.
  - **Black Marble is fixed at 2016**, the newest of its two annual composites. If GIBS adds a
    newer year, update `NIGHT_LIGHTS` in `src/lib/gibs.ts`.

## The response cache (`functions/api/_cache.ts`)

- Response caching is the Cloudflare Cache API (`caches.default`), not KV. The cache key's host
  must be one the zone serves, or `cache.put()` is a silent no-op; the helper derives it from the
  request's own origin.
- Lookup order is the positive key then `${key}:neg`, so a 60 s negative entry can never shadow
  fresh data. A non-ok producer `Response` is an error; a 2xx one is an uncached passthrough
  (unused since launches went KV-first in #30).
- Never proxy an upstream status code: `upstreamError()` is always 503, with the upstream status
  in `X-Upstream-Status`, so a NASA 429 is not mistaken for ours.
- **When a fix changes what a cached endpoint returns, bump its cache key** (#72): a HIT trusts
  the TTL stored with the entry, so the old answer keeps serving until it runs out.

### `X-Error-Kind` says why a handler failed

- `contractError()` (500, `contract`) is for a payload that broke our schema or parsed to
  nothing. It means shape drift.
- `upstreamError()` (`upstream`) is for an unavailable upstream.
- **Never answer with 502 or 504 (#61).** On the custom domain Cloudflare replaces an origin
  502/504 with its own plain "error code: 502" page, dropping the JSON body and `X-Error-Kind`.
  pages.dev previews do not, so a preview can look fine while production hides the error kind.
  Only Enterprise zones can turn it off. `tests/unit/error-kind-contract.test.ts` scans every
  function for a 502 or 504 status.

### Stale-while-revalidate and stale-if-error (#83)

- `cachedJson` stores positive entries for TTL + 24 h and decides freshness from
  `X-Cached-At`.
- **An expired entry answers at once** as a 200 with `X-Cache: REVALIDATING` and `max-age=0`,
  while `produce()` runs in `waitUntil`. A low-traffic site usually finds its entry expired, so
  visitors used to wait for NASA or NOAA on most loads. It lives in our cache code, not the CDN's
  `stale-while-revalidate` directive: browsers obey that directive too, and previews can't
  exercise it.
- The client's `apiFetch` (every `src/lib/api` fetcher uses it) notices a REVALIDATING answer, and
  `main.tsx` refetches the active queries 10 s later, once the fresh copy has landed. A new
  fetcher must use `apiFetch` or `getJson`, never bare `fetch`.
- **The client's retries wait out what answered them (#218).** `main.tsx`'s default
  `retryDelay` is `defaultRetryDelay` (`src/hooks/useSourceQuery.ts`): 1, 2 and 4 s for a
  dropped connection or a 5xx, but 61 s (or a longer `Retry-After`, up to 2 minutes) after a
  429 or an answer marked `X-Cache: NEG`, which a quick retry would only replay. `HttpError`
  carries `retryAfterS`, `negCached` and `contract` from the response; `defaultRetry` caps every
  query at three retries and never retries a contract: a client-side schema failure, a 400, a
  500 (`contractError()`) or any answer marked `X-Error-Kind: contract`.
- When the background refresh fails, it writes the neg entry, and the next request gets the last
  good body as a 200 with `X-Cache: STALE`, `X-Data-Age`, `X-Stale-Status` and `X-Error-Kind`.
- The health check re-asks 12 s after a REVALIDATING answer and judges the second one. Judged as
  is, an outage would pass every run and never alert.
- Because visitors no longer wait for the upstream, the probe's own time says nothing about it.
  Every positive entry stores `X-Produce-Ms`, how long its producer took, and the health check
  WARNs when a HIT or MISS says more than 3 s (#86). Like every WARN, it only comments on an
  already-open incident issue (and keeps it open); otherwise it shows only in the run's table.
- `staleIfError: false` (inner raw-feed caches) turns both fallbacks off.
- The health check passes an upstream-caused STALE with a WARN for up to 2 h. It fails a STALE
  caused by a contract failure, or one older than 2 h.
- Per-colo and evictable like the rest of the Cache API, so this is best effort, not a guarantee.

## The health check (`scripts/check-health.mjs`)

- **It retries transient failures only.** Status 0, 5xx and 429 get 3 attempts with 2s/5s
  backoff, because a single slow upstream used to fail the workflow and page Discord:
  `fetchUpstream`'s deadline is 8 s, so an upstream slower than that becomes our 503.
  Content-contract failures (missing fields, `X-Data-Degraded`, `X-Error-Kind: contract`) are
  never retried: they mean upstream shape drift, which is the thing the check exists to catch,
  and retrying would only delay the alert.
- **A retry inside the negative cache is not a retry.** `_cache.ts` negative-caches a failure for
  60 s, so the 2 s / 5 s backoff above only replayed one cached error. From #16 until #21, every
  "after 3 attempts" failure took about 70 ms and never reached the upstream. A response with
  `X-Cache: NEG` now waits 65 s before the next attempt. Retry any cached endpoint past its cache
  window.

## Alerts are GitHub issues

Both data-refresh jobs write `incident-report.json`, and `scripts/report-incidents.mjs` keeps one
`incident`-labelled issue per source (`[observatory] health:/api/eonet`).

- Open on failure, comment while still failing, auto-close on recovery, reopen on recurrence.
- Discord pings on open, reopen and close, with the issue link.
- A WARN entry (tolerated: STALE inside grace, a young KV copy) comments but does not close.
- **An open issue gets a comment only when the line changes, or once a day (#120).** Response
  time, retry count, KV age and the run link don't count as a change; the status, HTTP code and
  note do. Otherwise the action is a logged `skip`, with one "no change in 24 h" heartbeat. The
  reporter reads the newest comment (or the opening body) to compare. #65 had 79 identical
  comments through a NASA DONKI outage before this.
- **The health job stays green when endpoints fail (#120).** `check-health.mjs` exits 0 once the
  report is written, because the issue and Discord are the alert and a red job only made GitHub
  email the owner about outages that only the upstream could fix. A crash, an unwritable report or a failing
  reporter still fails the job, and the reporter step's `if: always()` still runs it after a
  crashed check (`ci-contract.test.ts` pins both).
- **An upstream-caused health failure opens only on its 4th run in a row (#71, the owner's
  call), about 18-24 h in.** It counts as upstream only when our handler said
  `X-Error-Kind: upstream` (on its 503, degraded answer or STALE) and the body passed its
  contract. Drift, our own errors and a timeout reaching our site still open on the first run. A
  handler that answers degraded must set `X-Error-Kind` (and `X-Data-Source`) to say why, as
  `donki.ts` does, or its outages page at once. The streak is `incident-streaks.json` in
  actions/cache; losing it only restarts the count. actions/cache is branch-scoped, so a run
  from a feature branch never seeds main's streaks.
- The label listing lags issue creation by seconds, so back-to-back manual runs can open a
  duplicate.

## The KV refresh job (`scripts/refresh-data.mjs`)

- **It pages on staleness, not on one missed fetch.** A failed source counts only once its KV
  copy is past its max age: ISS and satellites 36 h, launches backup 48 h. The refresh runs every
  6 h. Rejected payloads are logged with their keys plus a 300-character excerpt.
- **One deadline, 6 minutes (#128), inside the workflow's 10-minute `timeout-minutes`.** A job
  killed by that limit writes no incident report, so its failures would go unreported. The JPL
  steps' own budgets (4, 2 and 1.5 min) are capped by what is left of it (`stepBudget`), and no
  source, TLE or CelesTrak group starts a fetch once it has passed (`beforeDeadline`). Starlink's
  SupGP download (#209) also takes its timeout from `stepBudget` (60 s, or less if less is
  left), so it never runs past the deadline. A source
  cut short ships what it has or is judged by its KV copy's age. `ci-contract.test.ts` checks
  that the deadline, plus one fetch still running past it (100 s) and a minute for setup, KV
  writes and the reporter, fits the timeout. The step took 2 min 13 s on 2026-11-07.
- Its steps, in order, are described where their data is used:
  [orrery-data.md](orrery-data.md) (Horizons bodies and moons, close approaches, comets) and
  [satellites.md](satellites.md) (CelesTrak groups, Space-Track, DISCOSweb).

## Cloudflare zone notes

- **The console's CSP error for an inline `/cdn-cgi/challenge-platform/scripts/jsd/main.js`
  loader is expected and harmless (#67, checked 2026-10-25).** It is Cloudflare JavaScript
  Detections (zone `bot_management.enable_js: true`), injected into every HTML page. Our
  `script-src` blocks it, so no JS-detection score is set, and no rule on the zone reads one
  (only the `.php` block, the `/api/` rate limit and cache rules), and the free plan never
  enforces on it. Don't "fix" it in the CSP: the snippet carries a per-request ray id and
  timestamp, so a hash can't match, and a nonce would need a static, public value or a Function on
  HTML routes (`_routes.json` forbids that). To silence it, turn `enable_js` off for the zone
  instead; that changes every site on geektechlive.com, so ask first.
- Cloudflare's auto-injected Web Analytics beacon needs BOTH `https://static.cloudflareinsights.com`
  in `script-src` (to load) and `https://cloudflareinsights.com` in `connect-src` (to report). It
  posts to the absolute URL `https://cloudflareinsights.com/cdn-cgi/rum`, not to our own origin,
  so allowing only the script host loads the beacon and then silently blocks every beacon it
  sends. Verified in a browser, 2026-09-08.
- **Two layers answer 429 on `/api/` (#141, read 2026-11-12):** the zone's rate-limiting rule
  "observatory API rate limit" (50 requests per 10 s per `ip.src` + `cf.colo.id`, then a 10 s
  block, Cloudflare's default 429 page, which counts cache HITs too) and the Functions'
  `_middleware.ts` (60 a minute per isolate, JSON `{"error":"Rate limit exceeded"}` with
  `Retry-After: 60`, seen only by requests that reach a Function). A cold orrery load sends
  about 17 `/api/` requests, so five tabs at once from one address can trip either. Which one
  sent #141's 429s wasn't captured. The client waits out both: every query, the orrery bodies
  included, retries a 429 after 61 s (`defaultRetryDelay`, #218, which replaced #141's
  `bodiesRetryDelay`; a 5xx keeps the 1/2/4 s backoff unless it is a negative-cache replay),
  and a JPL lookup reads a 429 as busy and comes back
  after its `Retry-After` (61 s at least for a replayed negative entry, `X-Cache: NEG`).
- When a fix doesn't show on the plain URL of an `/api/` endpoint but does with `?x=1`, the zone's
  cache rule is holding the old answer: purge that URL (#61, #72).
