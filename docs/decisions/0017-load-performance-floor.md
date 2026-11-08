# 0017. Load performance has reached its floor; no more slow-phone squeezing

Status: Accepted · Date: 2026-11-08

## Context

A loading pass on 2026-11-08 (#155, #162, #167, #168, #169) brought production to 0.81 s for the
orrery's first 3D frame on desktop (1.40 s that morning), 4.75 s on a deliberately harsh
throttled phone profile (150 ms RTT, 1.6 Mbps, 4x CPU; 5.86 s that morning), and about 0.4 s
for the Earth page on desktop. What remains on the throttled phone is mostly the orrery's ~300 kB
of data on a link slower than real phones. The owner finds it fast on a current iPhone.

## Decision

The owner: "where we sit right now is perfectly fine". No further load-time work for slow
devices: no drawing planets before data, no shrinking orrery payloads, unless real-visitor data
shows a problem.

## Consequences

- No trade-off that would cost quality for people on modern phones with good connections.
- The bundle budgets and the first-load chain guard stay, so the floor doesn't erode.
- Leftover polish issues (#172–#176) stay as filed.
- Revisit when Cloudflare Web Analytics (real visitors) shows a problem; the first re-check is
  #177.

## Evidence

- #155, #162, #167, #168, #169, #177; commits 1e504d4, 151e622.
- [reference/bundle-and-loading.md](../reference/bundle-and-loading.md#measurements-2026-11-08).
