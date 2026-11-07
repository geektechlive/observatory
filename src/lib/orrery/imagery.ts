/**
 * What each orrery body looks like, and how honest that look is (#105; spec Part 16).
 * Maps are equirectangular WebP files under public/textures; they load with the orrery,
 * never with the page. Every body says which kind of colour it shows, the mission
 * behind it and its credit line, and the inspector prints all three.
 */
import type { BodyName } from './bodies'
import type { PlanetName } from './elements'
import type { Vec3 } from './scale'

/**
 * - true: close to what an eye would see.
 * - enhanced: real colour differences stretched far past what an eye would see.
 * - simulated: colour added to data that had little or none.
 * - shaded: no global map exists or none would show anything; its palette colour (BODY_HEX).
 * - observed: a live observation (the Sun, in extreme ultraviolet).
 */
export type ColourKind = 'true' | 'enhanced' | 'simulated' | 'shaded' | 'observed'

export interface BodyImagery {
  /** Public path of the map, or none (drawn smooth in its palette colour). */
  readonly texture?: string
  readonly colour: ColourKind
  /** One line on what the colour means for this body. */
  readonly note: string
  readonly mission: string
  readonly credit: string
  /** Sidereal rotation period, hours; negative for retrograde (NASA planetary fact sheet). */
  readonly rotationHours?: number
}

export const BODY_IMAGERY: Readonly<Record<BodyName, BodyImagery>> = {
  Sun: {
    colour: 'observed',
    note: 'Extreme ultraviolet at 171 Å, shown in gold. Invisible to the eye.',
    mission: 'GOES SUVI (NOAA)',
    credit: 'NOAA Space Weather Prediction Center',
  },
  Mercury: {
    texture: '/textures/planets/mercury.webp',
    colour: 'enhanced',
    note: 'Differences in rock are stretched far past what an eye would see.',
    mission: 'MESSENGER MDIS',
    credit: 'NASA/JHU APL/Carnegie Institution of Washington; mosaic by USGS Astrogeology',
    rotationHours: 1407.6,
  },
  Venus: {
    colour: 'shaded',
    note: 'Smooth pale cream: in visible light Venus is a near-featureless cloud deck.',
    mission: 'None (no visible-light surface map exists)',
    credit: 'Shaded by Observatory',
    rotationHours: -5832.5,
  },
  Earth: {
    texture: '/textures/day-2048.webp',
    colour: 'true',
    note: 'Close to natural colour, cloud-free.',
    mission: 'NASA Blue Marble',
    credit: 'NASA Visible Earth',
    rotationHours: 23.9345,
  },
  Mars: {
    texture: '/textures/planets/mars.webp',
    colour: 'simulated',
    note: 'A greyscale Viking mosaic, tinted from Viking colour images.',
    mission: 'Viking Orbiter MDIM 2.1',
    credit: 'NASA/JPL; mosaic by USGS Astrogeology',
    rotationHours: 24.6229,
  },
  Jupiter: {
    texture: '/textures/planets/jupiter.webp',
    colour: 'true',
    note: 'Near natural colour.',
    mission: 'Cassini ISS (PIA07782)',
    credit: 'NASA/JPL/Space Science Institute',
    rotationHours: 9.925,
  },
  Saturn: {
    texture: '/textures/planets/saturn.webp',
    colour: 'true',
    note: 'About natural colour. Rings from Voyager profiles coloured by Cassini.',
    mission: 'Cassini and Voyager',
    credit: 'Map and ring profiles created by Björn Jónsson',
    rotationHours: 10.656,
  },
  Uranus: {
    colour: 'shaded',
    note: 'Smooth pale green-blue: no real global map of Uranus exists.',
    mission: 'None (Voyager 2 saw a nearly featureless disc)',
    credit: 'Shaded by Observatory',
    rotationHours: -17.24,
  },
  Neptune: {
    texture: '/textures/planets/neptune.webp',
    colour: 'true',
    note: 'About natural colour.',
    mission: 'Voyager 2',
    credit: 'Map created by Björn Jónsson',
    rotationHours: 16.11,
  },
}

/** Saturn's rings, as one radial strip (Jónsson's profiles; inner edge to outer edge). */
export const SATURN_RINGS = {
  texture: '/textures/planets/saturn-rings.webp',
  innerKm: 74_510,
  outerKm: 140_390,
  /** Saturn's equatorial radius, km, which the ring radii are measured against. */
  saturnRadiusKm: 60_268,
  credit:
    'Ring profiles created by Björn Jónsson (Voyager occultation and imaging, Cassini colour)',
} as const

/**
 * North poles, ICRF right ascension and declination at J2000, degrees (IAU WGCCRE; the
 * secular rates and periodic terms are ignored, which moves a pole by under a degree).
 * orrery-imagery.test.ts checks each against the fact-sheet obliquity. Mars uses the
 * 2009 mean pole: the 2015 model's constant needs its periodic terms (1.3° off without).
 */
const POLE_RA_DEC: Readonly<Record<PlanetName, readonly [number, number]>> = {
  Mercury: [281.0103, 61.4155],
  Venus: [272.76, 67.16],
  Earth: [0, 90],
  Mars: [317.68143, 52.8865],
  Jupiter: [268.056595, 64.495303],
  Saturn: [40.589, 83.537],
  Uranus: [257.311, -15.175],
  Neptune: [299.36, 43.46],
}

const OBLIQUITY_J2000 = (23.4392911 * Math.PI) / 180
const DEG = Math.PI / 180

/** A planet's IAU north pole as a unit vector, ecliptic J2000. */
export function poleEcliptic(planet: PlanetName): Vec3 {
  const [ra, dec] = POLE_RA_DEC[planet]
  const x = Math.cos(dec * DEG) * Math.cos(ra * DEG)
  const y = Math.cos(dec * DEG) * Math.sin(ra * DEG)
  const z = Math.sin(dec * DEG)
  const c = Math.cos(OBLIQUITY_J2000)
  const s = Math.sin(OBLIQUITY_J2000)
  return { x, y: y * c + z * s, z: -y * s + z * c }
}

/**
 * Spin about the IAU north pole since J2000, radians in [0, 2π); decreasing for a
 * retrograde rotator. The rate is real; the phase is not (no prime meridian is fitted).
 */
export function spinAngle(body: BodyName, jd: number): number {
  const period = BODY_IMAGERY[body].rotationHours
  if (!period) return 0
  const hours = (jd - 2451545) * 24
  const turns = (hours % Math.abs(period)) / Math.abs(period)
  const angle = turns * 2 * Math.PI * Math.sign(period)
  return angle
}
