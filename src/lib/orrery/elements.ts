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

/**
 * Table 2a (#91): the long window, 3000 BC – 3000 AD, same source and frame. Coarser than
 * Table 1 inside 1800–2050, so it is used only outside that window.
 */
export const ELEMENTS_T2: Readonly<Record<PlanetName, Elements>> = {
  Mercury: {
    a: [0.38709843, 0.0],
    e: [0.20563661, 0.00002123],
    I: [7.00559432, -0.00590158],
    L: [252.25166724, 149472.67486623],
    peri: [77.45771895, 0.15940013],
    node: [48.33961819, -0.12214182],
  },
  Venus: {
    a: [0.72332102, -0.00000026],
    e: [0.00676399, -0.00005107],
    I: [3.39777545, 0.00043494],
    L: [181.9797085, 58517.8156026],
    peri: [131.76755713, 0.05679648],
    node: [76.67261496, -0.27274174],
  },
  Earth: {
    a: [1.00000018, -0.00000003],
    e: [0.01673163, -0.00003661],
    I: [-0.00054346, -0.01337178],
    L: [100.46691572, 35999.37306329],
    peri: [102.93005885, 0.3179526],
    node: [-5.11260389, -0.24123856],
  },
  Mars: {
    a: [1.52371243, 0.00000097],
    e: [0.09336511, 0.00009149],
    I: [1.85181869, -0.00724757],
    L: [-4.56813164, 19140.29934243],
    peri: [-23.91744784, 0.45223625],
    node: [49.71320984, -0.26852431],
  },
  Jupiter: {
    a: [5.20248019, -0.00002864],
    e: [0.0485359, 0.00018026],
    I: [1.29861416, -0.00322699],
    L: [34.33479152, 3034.90371757],
    peri: [14.27495244, 0.18199196],
    node: [100.29282654, 0.13024619],
  },
  Saturn: {
    a: [9.54149883, -0.00003065],
    e: [0.05550825, -0.00032044],
    I: [2.49424102, 0.00451969],
    L: [50.07571329, 1222.11494724],
    peri: [92.86136063, 0.54179478],
    node: [113.63998702, -0.25015002],
  },
  Uranus: {
    a: [19.18797948, -0.00020455],
    e: [0.0468574, -0.0000155],
    I: [0.77298127, -0.00180155],
    L: [314.20276625, 428.49512595],
    peri: [172.43404441, 0.09266985],
    node: [73.96250215, 0.05739699],
  },
  Neptune: {
    a: [30.06952752, 0.00006447],
    e: [0.00895439, 0.00000818],
    I: [1.7700552, 0.000224],
    L: [304.22289287, 218.46515314],
    peri: [46.68158724, 0.01009938],
    node: [131.78635853, -0.00606302],
  },
}

/** Table 2b: terms added to M for Jupiter–Neptune, M += b T² + c cos(f T) + s sin(f T). */
export interface ExtraTerms {
  readonly b: number
  readonly c: number
  readonly s: number
  /** Degrees per Julian century. */
  readonly f: number
}

export const EXTRA_T2: Readonly<Partial<Record<PlanetName, ExtraTerms>>> = {
  Jupiter: { b: -0.00012452, c: 0.0606406, s: -0.35635438, f: 38.35125 },
  Saturn: { b: 0.00025899, c: -0.13434469, s: 0.87320147, f: 38.35125 },
  Uranus: { b: 0.00058331, c: -0.97731848, s: 0.17689245, f: 7.67025 },
  Neptune: { b: -0.00041348, c: 0.68346318, s: -0.10162547, f: 7.67025 },
}

/** Table 2's window, 3000 BC Jan 1 (Julian calendar) to 3000 AD Jan 1, as Julian dates. */
export const VALID_T2_FROM_JD = 625673.5
export const VALID_T2_TO_JD = 2816787.5

/**
 * JPL's nominal errors per table: heliocentric longitude (arcsec) and distance (1000 km).
 * Shown as the confidence reason in the inspector.
 */
export const NOMINAL_ERROR: Readonly<
  Record<1 | 2, Readonly<Record<PlanetName, readonly [number, number]>>>
> = {
  1: {
    Mercury: [15, 1],
    Venus: [20, 4],
    Earth: [20, 6],
    Mars: [40, 25],
    Jupiter: [400, 600],
    Saturn: [600, 1500],
    Uranus: [50, 1000],
    Neptune: [10, 200],
  },
  2: {
    Mercury: [20, 1],
    Venus: [40, 8],
    Earth: [40, 15],
    Mars: [100, 30],
    Jupiter: [600, 1000],
    Saturn: [1000, 4000],
    Uranus: [2000, 8000],
    Neptune: [400, 4000],
  },
}
