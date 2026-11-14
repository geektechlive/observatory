# 0034. Flares come from NOAA SWPC; the rest of DONKI comes through api.nasa.gov

Status: Accepted · Date: 2026-11-14

## Context

The `data-refresh` workflow's health check opened #65 for `/api/donki`, answering 200 but
degraded. DONKI had been failing since 2026-10-11 (#42), with flares coming from NOAA only.
Checked on 2026-11-14:

- **DONKI moved.** NASA's Community Coordinated Modeling Center (CCMC) migrated it on 2026-09-30.
  Its notice (`ccmc.gsfc.nasa.gov/tools/DONKI/` and `/news/major-updates/`) says the public API
  base `https://ccmc.gsfc.nasa.gov/DONKI-API/get/...` replaces
  `https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/...`, with parameters and formats unchanged. The
  new base answers a laptop with 200 in 0.14 s, keyless; the old `kauai` host times out.
- **CCMC does not answer Cloudflare Workers egress.** A preview deploy of the first fix, which
  called the CCMC host, answered on a fresh cache miss with `x-produce-ms: 3000`,
  `x-error-kind: upstream`, `x-data-source: noaa-flares` and no CMEs: every CCMC call hit the 3 s
  deadline, while the same URL answers a laptop in 0.14 s. It joins CelesTrak and RocketLaunch.live
  (data-feeds doc).
- **`api.nasa.gov` still serves CME, GST and SEP, not FLR.** Production, calling it with the
  key, answered a fresh miss in 811 ms with 22 CMEs. `api.nasa.gov/DONKI/FLR` answers 404 with a
  body naming the new path (`/DONKI-API/get/FLR/`). That it "stopped proxying" FLR is an
  inference from that body.
- CME rows have no top-level `speed` or `type`; both sit in `cmeAnalyses[]`, for example
  `{"isMostAccurate":true,"speed":327.0,"type":"S"}`. `CmeSchema` read the top level, so the
  strip and ticker never showed them. Production's CMEs carried no top-level speed either.
- NOAA's 7-day flare list is about 43 KB, not the ~23 KB the code comment said.

## Decision

- **NOAA SWPC's `xray-flares-7-day.json` is the flare source.** `/api/donki` no longer asks DONKI
  for flares. NOAA alone does not mark an answer degraded and sends no `X-Error-Kind` or
  `X-Data-Source`.
- **CME, GST and SEP come from `api.nasa.gov/DONKI/<FEED>` with `NASA_API_KEY`**, as before, with
  `X-Quota-Remaining`. The handler never calls `ccmc.gsfc.nasa.gov`.
- **The server lifts CME `speed` and `type`** from the `cmeAnalyses` entry with
  `isMostAccurate: true`, else the last entry, so the client payload keeps its flat shape and its
  schema gains no union (`CLAUDE.md` bundle rule).
- **The cache key is `v3`**, so no old-shape body can be served.
- Degradation means a real failure: CME, GST, SEP or NOAA failing. It says so with `X-Error-Kind`
  and `X-Data-Source`, which here names the source that FAILED: `donki`, `noaa`, or `donki,noaa`
  (elsewhere the header names what served the answer, e.g. `kv-stale`). Never 502 or 504
  (ADR 0004). The health contract (`hasContent`, the `/api/donki` probe) needs no change: the
  probe flags only a degraded answer or a missing array.
- No CSP change: the calls are server-side, and `connect-src` governs the browser only.

## Consequences

- Flares, CMEs with speed and type, storms and SEPs return.
- The three DONKI feeds depend on `api.nasa.gov` continuing to proxy them.
- **If `api.nasa.gov` stops too,** move DONKI into the refresh job, KV-first (ADR 0003), but only
  after proving that GitHub Actions can reach CCMC, which is not yet known.
- Revisit if NOAA changes its flare list shape (the content contract is the tripwire).

## Evidence

- #65, #42, #82.
- `functions/api/donki.ts` (`NASA_API_BASE`, `RawCmeSchema`), `tests/unit/functions/donki.test.ts`.
- `docs/reference/data-feeds-and-monitoring.md`, "DONKI moved".
- CCMC notice: `https://ccmc.gsfc.nasa.gov/tools/DONKI/`.
