# 0024. Starlink's elements come from CelesTrak SupGP, fetched once a run on the strictest terms

Status: Accepted · Date: 2026-11-12

## Context

Starlink is the largest satellite group in the orrery (11,195 objects on 2026-11-12). Its
elements were CelesTrak's radar-based GP, cut out of `active`. CelesTrak also publishes
supplemental GP (SupGP) for Starlink, fitted to the ephemerides SpaceX publishes (every row
`"DATA_SOURCE":"SpaceX-E"`), which the #207 source review ranked first among additions. The
SupGP answer is about 5 MB, too large for a Worker's 10 ms of CPU, and CelesTrak refuses Workers
egress anyway (ADR 0003). CelesTrak's usage policy asks for each update once, says GP and SupGP
update every 2 hours, and says machine clients should stop at any non-200 answer.

## Decision

The owner approved #209. The refresh job asks for Starlink's SupGP once per run, after the eight
GP groups, and only when `active` gave a Starlink slice and every GP request in that run came
back. It accepts only HTTP 200 and never retries. SupGP's elements replace the GP elements of the
same NORAD id in the stored Starlink group; SupGP objects not in that slice are dropped so no
object is stored twice. The replaced rows come first and the body counts them (`supgpCount`), so
the inspector can name the source per object. A failed SupGP download stores Starlink on GP
elements, as a warning, not an incident.

## Consequences

- Starlink is drawn from SpaceX-derived elements, and the stored body is smaller (476.9 kB against
  550.0 kB at gzip -6) because SupGP's numbers carry fewer digits.
- One more request to CelesTrak per run (four a day, inside its 2-hour update cycle), and 5 MB
  more downloaded by the job.
- A failed run overwrites the stored SupGP elements with GP until the next run, 6 h later. Keeping
  the last SupGP copy instead would mean another KV key and a merge across runs; not worth it
  while SupGP has answered.
- The KV key and the row format are unchanged, so no client or cache migration was needed.
- Revisit if SupGP stops covering most of `active`'s Starlinks, if CelesTrak's policy or terms
  change, or if SpaceX or CelesTrak state attribution terms the orrery doesn't yet meet.

## Evidence

- Issues #209 and #207 (the source review).
- `scripts/celestrak-groups.mjs` (`SUPGP_STARLINK_URL`, `celestrakStrictFetch`,
  `supplementStarlink`); `src/lib/orbit/satCatalog.ts` (`overlaySupplemental`).
- [docs/reference/satellites.md](../reference/satellites.md), the SupGP bullet: the dry run's
  measurements and the credit.
- https://celestrak.org/usage-policy.php and https://celestrak.org/NORAD/elements/supplemental/
