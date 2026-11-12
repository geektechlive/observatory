# 0026. Charon ships as a window around each refresh, drawn to Pluto's own scale

Status: Accepted · Date: 2026-11-12

## Context

The dwarf planets landed without Charon (#99 item 8, ADR 0023). JPL Horizons covers Charon
("Charon (901)", plu060) from 1800-01-03 to 2199-12-29. The plan in #99 was to draw it across that whole window.

Charon circles the Pluto barycentre every 6.387 days at about 17,500 km. To interpolate a circle
the orrery needs many samples an orbit: the major moons use 14 or more (`moons.ts`). Over 400
years, 6 h samples are about 584,000 rows. Asked directly on 2026-11-12, Horizons refused it
("Output length exceeded ... max. is 90000"). Even 14 positions an orbit would be about 320,000
rows and several MB, against a dwarf-planet payload of 59 KB gzip. Propagating from fitted
elements would be a new model, and the orrery's rule is to interpolate JPL's samples and never
extrapolate.

At the scene's own scale Charon is far below a pixel from Pluto at any zoom, and Pluto is drawn
as a px-clamped marker (4 to 6 px) with no radius for the moon layer to work from.

## Decision

- Charon travels with the dwarf planets (`charon` in `horizons:dwarfs:v1`), asked from the Pluto
  barycentre (`500@9`), the point Pluto's marker stands for, over the moons' window and step:
  ±15 days at 6 h around the last daily fetch (refreshed at most once a day), so at worst
  about 14 days remain ahead. The job also refetches Charon, inside the day, once fewer than 7
  days of samples remain ahead. Outside the window Charon is hidden and the stage says which days
  the site carries and that JPL covers 1800 to 2199.
- It is drawn only with the Dwarf planets switch on and Pluto or Charon focused, to Pluto's own
  scale around Pluto's marker: a linear magnification of the pair, so Charon sits its true 14.7
  Pluto radii out. The inspector says the pair is magnified.

## Consequences

- Charon is visible only near the present. Scrubbing the clock more than about two weeks hides it.
- The dwarf-planet payload grows by 9 KB (3.2 KB gzip), and the step makes one more JPL request.
- The camera frames the barycentre when Charon is chosen, not Charon itself.
- Revisit if JPL publishes a compact long-term form for Charon, or if visitors want Charon in the
  past or future more than in the present.
