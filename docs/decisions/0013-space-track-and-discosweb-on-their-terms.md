# 0013. Space-Track and DISCOSweb are read on their own terms, in the refresh job only

Status: Accepted · Date: 2026-11-07

## Context

Space-Track.org (USSPACECOM's catalogue, re-entry predictions and element history) and ESA
DISCOSweb (mass, size, operator) need accounts, which the owner created for the site (#101).
Space-Track's API Use Guidelines set rates, daily download windows, a once-per-lifetime rule for
GP_HISTORY, and a citation condition on redistribution.

## Decision

Both are read only by the refresh job, with the owner's credentials held as GitHub Actions
secrets, and only in the login form or an `Authorization` header: never a URL, an error, a log
line, the payload or a fixture. The job follows Space-Track's guidelines as written: one login per
run, requests 3 s apart, TIP at most hourly, SATCAT, Box Score and Decay once a day after 17:00
UTC, each completed month of GP_HISTORY asked once and stored for good, SATCAT in one query.
Every surface that shows the data credits "Space-Track.org". DISCOSweb is asked at most four
times a run, each object again after a week.

## Consequences

- The site can show re-entry predictions, owners, radar sizes and launch facts without putting a
  credential near a visitor request.
- `spacetrack:history:v1` must never be deleted: losing it would mean asking for history again,
  which the guidelines forbid.
- A missing secret skips its step with a warning rather than failing the job.
- Revisit if either service changes its terms.

## Evidence

- #101; commit 208b181.
- `scripts/spacetrack.mjs`, `scripts/discos.mjs`, `tests/unit/ci-contract.test.ts` (the env
  lines).
- https://www.space-track.org/documentation (API Use Guidelines, read 2026-11-07).
- [reference/satellites.md](../reference/satellites.md#space-trackorg-and-esa-discosweb-101).
