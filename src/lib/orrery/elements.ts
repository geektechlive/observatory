/**
 * Keplerian elements and their rates for the eight planets (#90), from JPL's
 * "Approximate Positions of the Planets", Table 1 (E.M. Standish and J.G. Williams,
 * https://ssd.jpl.nasa.gov/planets/approx_pos.html). Mean ecliptic and equinox of J2000,
 * fitted for 1800–2050 only: JPL says the elements are not valid outside that window.
 * Each pair is [value at J2000, rate per Julian century].
 */

export type PlanetName =
  'Mercury' | 'Venus' | 'Earth' | 'Mars' | 'Jupiter' | 'Saturn' | 'Uranus' | 'Neptune'

type Pair = readonly [number, number]

export interface Elements {
  /** Semi-major axis, au. */
  readonly a: Pair
  /** Eccentricity. */
  readonly e: Pair
  /** Inclination, degrees. */
  readonly I: Pair
  /** Mean longitude, degrees. */
  readonly L: Pair
  /** Longitude of perihelion, degrees. */
  readonly peri: Pair
  /** Longitude of the ascending node, degrees. */
  readonly node: Pair
}

/** Sun outward. */
export const PLANETS: readonly PlanetName[] = [
  'Mercury',
  'Venus',
  'Earth',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
]

/** Table 1. "Earth" is JPL's EM Bary, the Earth–Moon barycentre. */
export const ELEMENTS: Readonly<Record<PlanetName, Elements>> = {
  Mercury: {
    a: [0.38709927, 0.00000037],
    e: [0.20563593, 0.00001906],
    I: [7.00497902, -0.00594749],
    L: [252.2503235, 149472.67411175],
    peri: [77.45779628, 0.16047689],
    node: [48.33076593, -0.12534081],
  },
  Venus: {
    a: [0.72333566, 0.0000039],
    e: [0.00677672, -0.00004107],
    I: [3.39467605, -0.0007889],
    L: [181.9790995, 58517.81538729],
    peri: [131.60246718, 0.00268329],
    node: [76.67984255, -0.27769418],
  },
  Earth: {
    a: [1.00000261, 0.00000562],
    e: [0.01671123, -0.00004392],
    I: [-0.00001531, -0.01294668],
    L: [100.46457166, 35999.37244981],
    peri: [102.93768193, 0.32327364],
    node: [0.0, 0.0],
  },
  Mars: {
    a: [1.52371034, 0.00001847],
    e: [0.0933941, 0.00007882],
    I: [1.84969142, -0.00813131],
    L: [-4.55343205, 19140.30268499],
    peri: [-23.94362959, 0.44441088],
    node: [49.55953891, -0.29257343],
  },
  Jupiter: {
    a: [5.202887, -0.00011607],
    e: [0.04838624, -0.00013253],
    I: [1.30439695, -0.00183714],
    L: [34.39644051, 3034.74612775],
    peri: [14.72847983, 0.21252668],
    node: [100.47390909, 0.20469106],
  },
  Saturn: {
    a: [9.53667594, -0.0012506],
    e: [0.05386179, -0.00050991],
    I: [2.48599187, 0.00193609],
    L: [49.95424423, 1222.49362201],
    peri: [92.59887831, -0.41897216],
    node: [113.66242448, -0.28867794],
  },
  Uranus: {
    a: [19.18916464, -0.00196176],
    e: [0.04725744, -0.00004397],
    I: [0.77263783, -0.00242939],
    L: [313.23810451, 428.48202785],
    peri: [170.9542763, 0.40805281],
    node: [74.01692503, 0.04240589],
  },
  Neptune: {
    a: [30.06992276, 0.00026291],
    e: [0.00859048, 0.00005105],
    I: [1.77004347, 0.00035372],
    L: [-55.12002969, 218.45945325],
    peri: [44.96476227, -0.32241464],
    node: [131.78422574, -0.00508664],
  },
}

/** Table 1's window, 1800-01-01 to 2050-01-01, as Julian dates. */
export const VALID_FROM_JD = 2378496.5
export const VALID_TO_JD = 2469807.5
