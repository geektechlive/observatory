# 0019. Björn Jónsson's maps stay, as downscaled textures inside the orrery, credited and linked

Status: Accepted · Date: 2026-11-08

## Context

The orrery draws Saturn, its rings and Neptune with Björn Jónsson's maps (#105), the best global
colour maps of those bodies: Cassini and Voyager mosaics. They are served from this site as
downscaled WebP textures (`public/textures/planets/saturn.webp`, `saturn-rings.webp`,
`neptune.webp`). His terms (https://bjj.mmedia.is/data/planetary_maps.html, read 2026-11-08):

> All the planetary maps available on these pages are publicly available. You do not need a
> special permission to use them but if you do then please mention their origin in your work,
> e.g. "created by Björn Jónsson" or something equivalent. You are also welcome to link to the
> maps from your own website. However, please do not place a copy of the maps on your website.
> One reason for this is that from time to time I "upgrade" the maps with improved versions and
> I don't want to have old, obsolete versions of my maps scattered around on the web.

No replacement of comparable honesty exists: a search on 2026-11-08 found no NASA global colour
map of Saturn or Neptune with clear terms, and the CC BY alternatives (Solar System Scope) are
stylised, with unstated provenance (#180).

## Decision

The owner decided to keep the maps. They are used, as his terms allow, and never offered as maps:
they exist on this site only as downscaled textures wrapped on spheres inside the 3D scene, with
no page, link or download that presents them as maps. Every place they appear credits him by
name and links to his maps page for the real, current versions: the orrery inspector's credit,
the README's credits and this record.

## Consequences

- The orrery keeps its best-quality Saturn, rings and Neptune.
- The texture files are reachable by URL, as every asset a web page draws must be. The README
  states how they are used so the use is clear to anyone, including him.
- If he objects, the maps come off the site and a replacement is chosen (a shaded body like Venus
  and Uranus, or a licensed alternative). Revisit then, or if this site ever offers maps for
  download.

## Evidence

- #105, #180.
- `src/lib/orrery/imagery.ts` (`JONSSON_MAPS`, `creditUrl`), `src/components/orrery/ImageryFacts.tsx`,
  `tests/unit/imagery-credit-link.test.tsx`, `README.md` (Images and type).
