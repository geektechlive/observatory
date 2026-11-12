/**
 * The orrery's Data sources list (#207): the providers the orrery itself uses, each with one
 * plain sentence for visitors and the credit its terms require. The full provider registry
 * (#91), with statuses, terms, limits and the providers we checked and do not use, is in
 * docs/reference/orrery-data.md, so none of it ships to the browser.
 */

export interface OrrerySource {
  readonly id: string
  readonly name: string
  /** The provider's documentation, which the name links to. */
  readonly docs: string
  /** What it gives the orrery, in one plain sentence. */
  readonly gives: string
  /** The credit the provider's terms require, where they require one. */
  readonly credit?: string
}

export const SOURCES: readonly OrrerySource[] = [
  {
    id: 'horizons',
    name: 'JPL Horizons',
    docs: 'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
    gives:
      'Where the spacecraft, Earth, the Moon and the other moons are, and the path of anything you look up.',
  },
  {
    id: 'sbdb',
    name: 'JPL Small-Body Database',
    docs: 'https://ssd-api.jpl.nasa.gov/doc/sbdb.html',
    gives: 'The asteroid or comet you look up, and which comets are bright enough to show.',
  },
  {
    id: 'cad',
    name: 'JPL Close Approach Data',
    docs: 'https://ssd-api.jpl.nasa.gov/doc/cad.html',
    gives: 'The asteroids passing Earth, with how close each one comes.',
  },
  {
    id: 'scout',
    name: 'JPL Scout',
    docs: 'https://ssd-api.jpl.nasa.gov/doc/scout.html',
    gives: 'Newly found objects whose orbits are still uncertain.',
  },
  {
    id: 'neocc',
    name: 'ESA NEO Coordination Centre',
    docs: 'https://neo.ssa.esa.int/en/computer-access',
    gives: 'ESA’s risk list: the asteroids with a small chance of hitting Earth.',
  },
  {
    id: 'celestrak',
    name: 'CelesTrak',
    docs: 'https://celestrak.org/NORAD/documentation/gp-data-formats.php',
    gives: 'The orbit data behind every satellite on the orrery.',
  },
  {
    id: 'space-track',
    name: 'Space-Track.org',
    docs: 'https://www.space-track.org/documentation',
    gives: 'Re-entry predictions, who owns a satellite and when it launched.',
    credit: 'Data from Space-Track.org',
  },
  {
    id: 'discosweb',
    name: 'ESA DISCOSweb',
    docs: 'https://discosweb.esoc.esa.int/',
    gives: 'Mass, size and operator for the spacecraft and some satellites.',
  },
  {
    id: 'suvi',
    name: 'NOAA GOES SUVI',
    docs: 'https://www.spaceweather.gov/products/goes-solar-ultraviolet-imager-suvi',
    gives: 'The live picture of the Sun.',
  },
  {
    id: 'solar-wind',
    name: 'NOAA solar wind',
    docs: 'https://www.spaceweather.gov/products/solar-wind',
    gives: 'How fast the solar wind is blowing past the L1 point.',
  },
  {
    id: 'enlil',
    name: 'NOAA WSA-ENLIL',
    docs: 'https://www.spaceweather.gov/products/wsa-enlil-solar-wind-prediction',
    gives: 'Whether a cloud thrown off by the Sun is forecast to reach Earth, and when.',
  },
  {
    id: 'dsn',
    name: 'NASA Deep Space Network',
    docs: 'https://eyes.nasa.gov/apps/dsn-now/dsn.html',
    gives: 'Which spacecraft the big dishes are talking to.',
  },
]
