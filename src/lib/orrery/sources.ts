/**
 * The provider registry (#91; Chris's orrery spec, Part 1 and Phase 2). Every source the
 * spec names, with what it gives, how it is reached and where this repo stands with it.
 * A static table, not runtime adapters: on the free plan the data comes from the refresh
 * job and per-feed Functions. Terms and limits are from the 2026-11-06 fact-check.
 *
 * Status, as in the spec:
 * - registered: known and documented here, not used yet
 * - implemented: code exists but needs configuration (a key or account) to run
 * - configured: implemented and its credentials are set
 * - operational: the site uses it today
 * - unavailable: the documented endpoint does not exist or cannot be reached
 */

export const SOURCE_STATUSES = [
  'registered',
  'implemented',
  'configured',
  'operational',
  'unavailable',
] as const
export type SourceStatus = (typeof SOURCE_STATUSES)[number]

export type SourceAuth = 'none' | 'key' | 'account'

export interface Source {
  readonly id: string
  readonly name: string
  readonly org: string
  readonly docs: string
  readonly url: string
  readonly auth: SourceAuth
  /** What it gives, in a few words. */
  readonly provides: string
  readonly status: SourceStatus
  /** Licence or usage terms worth knowing. */
  readonly terms?: string
  /** The issue that brings it in, if planned. */
  readonly plannedIn?: number
  readonly note?: string
  /** Spec Part 2: beyond the primary 20. */
  readonly optional?: boolean
}

export const SOURCES: readonly Source[] = [
  {
    id: 'horizons',
    name: 'JPL Horizons',
    org: 'NASA JPL',
    docs: 'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
    url: 'https://ssd.jpl.nasa.gov/api/horizons.api',
    auth: 'none',
    provides: 'Ephemerides: planets, moons, small bodies, spacecraft',
    status: 'operational',
    terms: 'JPL Fair Use: one request at a time, cache results',
    note: 'Sky tab planets; the orrery’s 15 spacecraft, Earth and Moon (#93), sampled every 6 h by the refresh job; asteroid tracks in #92',
  },
  {
    id: 'celestrak',
    name: 'CelesTrak GP',
    org: 'CelesTrak',
    docs: 'https://celestrak.org/NORAD/documentation/gp-data-formats.php',
    url: 'https://celestrak.org/NORAD/elements/gp.php',
    auth: 'none',
    provides: 'Satellite orbital elements (OMM/TLE)',
    status: 'operational',
    note: 'ISS and satellites via the refresh job. No TLE for catalogue numbers 100000+ since 2026-07-11: OMM JSON for the catalogue (#98)',
  },
  {
    id: 'space-track',
    name: 'Space-Track.org',
    org: 'US Space Force',
    docs: 'https://www.space-track.org/documentation',
    url: 'https://www.space-track.org/basicspacedata/query',
    auth: 'account',
    provides: 'Catalogue, element history, decay and launch data',
    status: 'registered',
    terms: '30 requests/min, 300/h; redistribution of basic SSA data with citation',
    plannedIn: 101,
  },
  {
    id: 'sbdb',
    name: 'JPL Small-Body Database',
    org: 'NASA JPL',
    docs: 'https://ssd-api.jpl.nasa.gov/doc/sbdb.html',
    url: 'https://ssd-api.jpl.nasa.gov/sbdb.api',
    auth: 'none',
    provides: 'Asteroid and comet orbits and physical data',
    status: 'registered',
    plannedIn: 99,
  },
  {
    id: 'cad',
    name: 'JPL Close Approach Data',
    org: 'NASA JPL',
    docs: 'https://ssd-api.jpl.nasa.gov/doc/cad.html',
    url: 'https://ssd-api.jpl.nasa.gov/cad.api',
    auth: 'none',
    provides: 'Close approaches with 3-sigma distance range',
    status: 'operational',
    note: 'The refresh job asks it every 6 h for /api/orrery-neo',
    plannedIn: 92,
  },
  {
    id: 'neows',
    name: 'NASA NeoWs',
    org: 'NASA',
    docs: 'https://api.nasa.gov/',
    url: 'https://api.nasa.gov/neo/rest/v1/feed',
    auth: 'key',
    provides: 'Near-Earth objects: size, hazard flag, approaches',
    status: 'operational',
  },
  {
    id: 'scout',
    name: 'JPL Scout',
    org: 'NASA JPL',
    docs: 'https://ssd-api.jpl.nasa.gov/doc/scout.html',
    url: 'https://ssd-api.jpl.nasa.gov/scout.api',
    auth: 'none',
    provides: 'Newly found objects with preliminary, uncertain orbits',
    status: 'operational',
    note: 'The refresh job asks it every 6 h for /api/orrery-neo',
    plannedIn: 92,
  },
  {
    id: 'sentry',
    name: 'JPL Sentry',
    org: 'NASA JPL',
    docs: 'https://ssd-api.jpl.nasa.gov/doc/sentry.html',
    url: 'https://ssd-api.jpl.nasa.gov/sentry.api',
    auth: 'none',
    provides: 'Modelled impact probabilities (a model, not a prediction)',
    status: 'operational',
  },
  {
    id: 'neocc',
    name: 'ESA NEO Coordination Centre',
    org: 'ESA',
    docs: 'https://neo.ssa.esa.int/en/computer-access',
    url: 'https://neo.ssa.esa.int/',
    auth: 'none',
    provides: 'Risk list and close approaches (flat files)',
    status: 'operational',
    note: 'The refresh job reads it every 6 h for /api/orrery-neo; ESA says the interface may change without notice',
    plannedIn: 92,
  },
  {
    id: 'n2yo',
    name: 'N2YO',
    org: 'N2YO',
    docs: 'https://www.n2yo.com/api/',
    url: 'https://api.n2yo.com/rest/v1/satellite/',
    auth: 'key',
    provides: 'Satellite positions and passes',
    status: 'registered',
    terms: 'Per hour: positions 1,000, visual passes 100',
    note: 'Not a live source: positions are computed locally; a one-off validation check only',
  },
  {
    id: 'keeptrack',
    name: 'KeepTrack API v4',
    org: 'KeepTrack',
    docs: 'https://api.keeptrack.space/v4/docs',
    url: 'https://api.keeptrack.space/v4',
    auth: 'key',
    provides: 'Satellite catalogue and positions',
    status: 'registered',
    terms: 'CC BY-NC 4.0; 500/h, 5,000/day, 50/day for position calculations; scraping banned',
    note: 'Not a live source: positions are computed locally',
  },
  {
    id: 'sscweb',
    name: 'NASA SSCWeb',
    org: 'NASA GSFC',
    docs: 'https://sscweb.gsfc.nasa.gov/WebServices/REST/',
    url: 'https://sscweb.gsfc.nasa.gov/WS/sscr/2/',
    auth: 'none',
    provides: 'Science spacecraft trajectories (incl. DSCOVR, ACE, SOHO, Wind)',
    status: 'registered',
    note: 'Horizons covers the same craft; a cross-check at most',
  },
  {
    id: 'spice',
    name: 'NASA NAIF SPICE',
    org: 'NASA JPL',
    docs: 'https://naif.jpl.nasa.gov/naif/data.html',
    url: 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/',
    auth: 'none',
    provides: 'Ephemeris kernels and toolkit',
    status: 'registered',
    note: 'Horizons serves the same SPICE data, so the app uses Horizons',
  },
  {
    id: 'discosweb',
    name: 'ESA DISCOSweb',
    org: 'ESA',
    docs: 'https://discosweb.esoc.esa.int/',
    url: 'https://discosweb.esoc.esa.int/api/',
    auth: 'account',
    provides: 'Object metadata: mass, size, launch, re-entry',
    status: 'registered',
    plannedIn: 101,
  },
  {
    id: 'mpc-orb',
    name: 'Minor Planet Center orbits',
    org: 'IAU MPC',
    docs: 'https://docs.minorplanetcenter.net/mpc-ops-docs/apis/get-orb',
    url: 'https://data.minorplanetcenter.net/api/get-orb',
    auth: 'none',
    provides: 'Asteroid and comet orbits with uncertainty',
    status: 'registered',
    note: 'GET with a JSON body (a query string returns 501); refresh job only',
  },
  {
    id: 'mpc-obs',
    name: 'Minor Planet Center observations',
    org: 'IAU MPC',
    docs: 'https://docs.minorplanetcenter.net/mpc-ops-docs/apis/get-obs/',
    url: 'https://data.minorplanetcenter.net/api/get-obs',
    auth: 'none',
    provides: 'Original astrometric observations',
    status: 'registered',
    note: 'GET with a JSON body; observations, never calculated positions',
  },
  {
    id: 'sb_ident',
    name: 'JPL Small-Body Identification',
    org: 'NASA JPL',
    docs: 'https://ssd-api.jpl.nasa.gov/doc/sb_ident.html',
    url: 'https://ssd-api.jpl.nasa.gov/sb_ident.api',
    auth: 'none',
    provides: 'Known small bodies in a field of view',
    status: 'registered',
    plannedIn: 100,
  },
  {
    id: 'sb_obs',
    name: 'JPL Small-Body Observability',
    org: 'NASA JPL',
    docs: 'https://ssd-api.jpl.nasa.gov/doc/sb_obs.html',
    url: 'https://ssd-api.jpl.nasa.gov/sb_obs.api',
    auth: 'none',
    provides: 'Observable small bodies (as the spec described it)',
    status: 'unavailable',
    note: 'Does not exist: docs and API both 404 (checked 2026-11-06). Computed in-house instead (#99)',
  },
  {
    id: 'sbdb_query',
    name: 'JPL SBDB Query',
    org: 'NASA JPL',
    docs: 'https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html',
    url: 'https://ssd-api.jpl.nasa.gov/sbdb_query.api',
    auth: 'none',
    provides: 'Catalogue-wide small-body search',
    status: 'operational',
    note: 'The refresh job picks the brightest comets with it every 6 h for /api/orrery-smallbodies',
    plannedIn: 99,
  },
  {
    id: 'fireball',
    name: 'JPL Fireball Data',
    org: 'NASA JPL',
    docs: 'https://ssd-api.jpl.nasa.gov/doc/fireball.html',
    url: 'https://ssd-api.jpl.nasa.gov/fireball.api',
    auth: 'none',
    provides: 'Historical atmospheric fireballs (events, not orbits)',
    status: 'operational',
  },
  {
    id: 'satnogs',
    name: 'SatNOGS DB',
    org: 'Libre Space Foundation',
    docs: 'https://db.satnogs.org/api/schema/docs/',
    url: 'https://db.satnogs.org/api/',
    auth: 'none',
    provides: 'Satellite identity and radio transmitters',
    status: 'registered',
    terms: 'CC BY-SA 4.0',
    optional: true,
  },
  {
    id: 'll2',
    name: 'Launch Library 2',
    org: 'The Space Devs',
    docs: 'https://thespacedevs.com/llapi',
    url: 'https://ll.thespacedevs.com/2.3.0/',
    auth: 'none',
    provides: 'Launches, vehicles, missions',
    status: 'registered',
    terms: '15 unauthenticated requests/hour',
    note: 'The spec named 2.2.0; 2.3.0 is current. Launches here come from RocketLaunch.live',
    optional: true,
  },
]
