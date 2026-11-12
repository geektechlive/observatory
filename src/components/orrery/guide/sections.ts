/**
 * The guide's reference sections (#159): plain data, so the copy can be tested (no dashes,
 * real glossary ids) and the drawer stays a thin renderer. Every fact is one docs/reference/
 * records as checked, or something the controls themselves say; sources are named inline
 * in the comments next to the facts.
 */
import type { GlossaryId } from '@/lib/orrery/glossary'

export type Tone = 'cyan' | 'amber' | 'red' | 'bone' | 'faint' | 'comet' | 'interstellar'

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: readonly string[] }
  | { kind: 'terms'; ids: readonly GlossaryId[] }
  | { kind: 'marks'; items: readonly { tone: Tone; name: string; text: string }[] }

export interface Section {
  id: string
  title: string
  blocks: readonly Block[]
}

export const SECTIONS: readonly Section[] = [
  {
    id: 'getting-around',
    title: 'Getting around',
    blocks: [
      {
        kind: 'p',
        text: 'The orrery is a 3D model of the solar system. You are the camera. Positions come from data, not artwork, though sizes and some distances are stretched (see “Not to scale”).',
      },
      {
        kind: 'list',
        items: [
          // three.js OrbitControls defaults, which the renderer does not change.
          'Mouse: drag to turn the view, scroll to zoom, and drag with the right button to slide it sideways.',
          'Touch: drag with one finger to turn, pinch to zoom, and drag with two fingers to slide.',
          'Keyboard: Tab moves between the labels on the stage and the controls, and Enter picks one. On the time slider the arrow keys step a day, and Shift with an arrow steps a week.',
          'Click or tap a body, craft or label to open its inspector and fly the camera there. Esc closes this guide, or the close-up of a model when one is open.',
        ],
      },
      {
        kind: 'p',
        text: 'The View buttons jump to a preset. Sun centres on the Sun. Inner reaches out to Mars and Outer to Neptune. Heliosphere frames the whole system out to 200 au, with the Voyagers. Earth–Moon shows Earth, the Moon and the L1 and L2 points, and Earth orbit shows the satellites.',
      },
    ],
  },
  {
    id: 'time',
    title: 'Time',
    blocks: [
      {
        kind: 'p',
        text: 'The bar along the bottom is the clock, in UTC. Now returns to the present at real speed. The slider covers a year either side of its centre. The centre stays put until the clock leaves that year, then jumps to the clock. On wider screens the Go to date box takes YYYY-MM-DD, and a minus sign means BC.',
      },
      {
        kind: 'p',
        text: 'Play speeds run from real time (1×) up to a year a second: 1 min/s, 1 h/s, 1 day/s, 1 wk/s, 1 mo/s and 1 yr/s.',
      },
      {
        kind: 'p',
        text: 'The planets are valid from 3000 BC to 3000 AD, and the clock stops at those edges. Outside 1800 to 2050 they use JPL’s long-window table, a little less precise, and the stage says so.',
      },
      {
        kind: 'p',
        text: 'Spacecraft and moons are drawn only where JPL supplied data. Outside it the inspector says “No data for this date”, the craft is hidden but stays searchable, and the stage counts how many are hidden. Positions are never guessed past the data.',
      },
    ],
  },
  {
    id: 'finding',
    title: 'Finding things',
    blocks: [
      {
        kind: 'p',
        text: 'The Find box searches the planets, spacecraft, moons, space stations and the asteroids on a close pass. Only the stations are listed among the satellites, because 19,000 names would bury everything else.',
      },
      {
        kind: 'p',
        text: 'The Comets & interstellar controls have two switches, both off at first so nothing extra loads. Comets draws the comets JPL’s magnitude forecast puts brightest tonight. Interstellar objects draws ʻOumuamua, Borisov and 3I/ATLAS, visitors from other stars. Once a switch has loaded them, they are in the Find box too.',
      },
      {
        kind: 'p',
        text: 'A comet’s position always comes from JPL Horizons, which supplies 30 days either side of today. Outside them the comet and its line are hidden. The line is drawn from its orbital elements, as a line only. The interstellar objects follow the paths JPL gives them, from three years before they passed the Sun to five years from now. Their inspector shows the eccentricity (above 1, so the Sun cannot hold them), the speed they keep far from the Sun, the discovery date, and whether the date shown lies inside the observations the orbit is fitted to or is extrapolated from them.',
      },
      {
        kind: 'p',
        text: 'When nothing matches, the “Search JPL for …” option looks the name up in JPL’s Small-Body Database, which covers any asteroid or comet. The card shows its distance from the Sun and Earth and its speed, and Show in orrery draws it and flies there. JPL is asked one request at a time, so it can take a moment.',
      },
      {
        kind: 'p',
        text: 'For satellites, choose Earth orbit. The Earth orbit controls have a switch for each kind: space stations, GPS, weather, science, other active satellites, debris and Starlink. Debris and Starlink start off, because Starlink is the biggest download. Satellites show only when you are near Earth and fade out as you zoom away. Choosing a station in the Find box, the ISS for instance, opens that view and switches the stations on.',
      },
      {
        kind: 'p',
        text: 'Browse satellites, in the Earth orbit controls, lists them by kind, by orbit, by launch date, by size on radar, by owner and by the ones about to fall back to Earth, so you can find one without knowing its name. Choosing one flies there and opens its details.',
      },
    ],
  },
  {
    id: 'inspector',
    title: 'Reading the inspector',
    blocks: [
      {
        kind: 'p',
        text: 'Select anything and its inspector opens with the plain facts first. The raw numbers sit behind Scientific data. Words with a dotted underline explain themselves when you press them.',
      },
      {
        kind: 'p',
        text: 'Each number is measured or modelled. The planets are modelled: computed from JPL’s approximate orbital elements, and the inspector gives their accuracy. A spacecraft’s path comes from JPL Horizons, reconstructed from tracking up to the last contact and predicted after it. A satellite’s position is modelled from orbit data fitted at an epoch. What is measured live is the solar wind at L1 (NOAA), the Sun’s picture (NOAA’s GOES SUVI) and which craft the Deep Space Network is talking to.',
      },
      {
        kind: 'p',
        text: 'Spacecraft and satellites that have a 3D model show a Look closer button above their facts. It fills the stage with the model while the orrery pauses behind it. Drag to turn the model, scroll or pinch to zoom, or use the arrow keys and the plus and minus buttons. Esc or Back to orrery returns to the orrery, and focus goes back to the button. On a phone the facts fold away while the view is open, to give the model room: the Facts button beside the name opens them and folds them again. On the orrery a model is drawn no bigger than the Sun, so Look closer is the way to see it full size. Some models are simplified stand-ins, not the exact object, and say so. Every model shows its credit and licence underneath.',
      },
      { kind: 'terms', ids: ['light-time', 'range-rate', 'dsn', 'coarse', 'epoch', 'tle-omm'] },
    ],
  },
  {
    id: 'colours',
    title: 'What the colours and marks mean',
    blocks: [
      {
        kind: 'marks',
        items: [
          {
            tone: 'cyan',
            name: 'Cyan',
            text: 'Spacecraft. A ring around one means NASA’s Deep Space Network is in contact with it right now.',
          },
          {
            tone: 'amber',
            name: 'Amber',
            text: 'An asteroid on a close pass, and also a notice or warning. On a satellite, an amber ring means Space-Track predicts it will re-enter the atmosphere soon.',
          },
          {
            tone: 'red',
            name: 'Red',
            text: 'A potentially hazardous asteroid. The label describes its orbit and size, not a forecast of impact.',
          },
          {
            tone: 'comet',
            name: 'Pale blue',
            text: 'A comet, with its orbit line.',
          },
          {
            tone: 'interstellar',
            name: 'Violet',
            text: 'An interstellar object and its path, or an object you looked up at JPL.',
          },
          {
            tone: 'faint',
            name: 'Thin line and cross',
            text: 'A stalk from a craft down or up to the ecliptic plane, dashed when the craft is south of it, with a cross where it lands. It shows how far the craft is above or below the planets’ plane.',
          },
          {
            tone: 'faint',
            name: 'Marker on the edge',
            text: 'A deep-space craft that is off the edge of the view is shown on the rim of the stage, pointing toward it.',
          },
          {
            tone: 'faint',
            name: 'Dashed ring, “approx.”',
            text: 'The heliopause, about 121.6 au from the Sun. The real edge is a bubble, not a flat ring, and it shifts, so this ring is a rough slice of it through the planets’ plane. A craft at the same distance can sit well above or below it.',
          },
          {
            tone: 'bone',
            name: 'Satellites',
            text: 'Space stations are bone white, Starlink a muted slate grey and debris dim.',
          },
        ],
      },
    ],
  },
  {
    id: 'scale',
    title: 'Not to scale, and why',
    blocks: [
      {
        kind: 'p',
        text: 'Space is almost empty, so a true-scale picture would show nothing. The default, Big bodies, stretches distances on a log scale and draws bodies larger than life. Log distance keeps that stretched spacing but draws the bodies small. Proportional draws true distances and marks the bodies so you can find them. A NOT TO SCALE badge shows whenever the scale is stretched; in Proportional it says SIZES NOT TO SCALE, because the markers are bigger than the bodies.',
      },
      {
        kind: 'p',
        text: 'A body is never drawn smaller than a few pixels, so even a tiny object stays visible.',
      },
      {
        kind: 'p',
        text: 'Near Earth, a separate scale takes over as you zoom in, the Earth frame. It is true to scale out to the geostationary ring and compresses distances beyond it, so the Moon, L1 and a close asteroid pass fit one picture in the right order and direction.',
      },
      { kind: 'terms', ids: ['au', 'ecliptic', 'earth-radius', 'geostationary'] },
    ],
  },
  {
    id: 'data',
    title: 'Where the data comes from',
    blocks: [
      {
        kind: 'p',
        text: 'Most of it is fetched ahead of time by a refresh job and served from a cache, so the orrery rarely waits on an agency’s server. When a copy gets old, the page says so.',
      },
      {
        kind: 'p',
        text: 'Data sources, at the foot of the controls, names each provider the orrery uses, what it gives and any credit its terms ask for. The list below adds how fresh each one is.',
      },
    ],
  },
]

export interface DataSource {
  name: string
  /** The id in the Data sources list, where it has one. */
  sourceId?: string
  url: string
  gives: string
  /** How fresh it is. */
  fresh: string
}

export const DATA_SOURCES: readonly DataSource[] = [
  {
    name: 'JPL Horizons',
    sourceId: 'horizons',
    url: 'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
    gives: 'Where the spacecraft, Earth, the Moon and the other moons are.',
    fresh:
      'Sampled every 6 hours and shown as current for up to 72 hours. The planets do not come from here: they use JPL’s approximate orbital elements, computed in your browser.',
  },
  {
    name: 'JPL Small-Body Database',
    sourceId: 'sbdb',
    url: 'https://ssd-api.jpl.nasa.gov/doc/sbdb.html',
    gives: 'The asteroid or comet you look up, and which comets are bright enough to show.',
    fresh:
      'A lookup is kept for a day. The comets are picked again every 6 hours by the refresh job.',
  },
  {
    name: 'JPL Close Approach Data',
    sourceId: 'cad',
    url: 'https://ssd-api.jpl.nasa.gov/doc/cad.html',
    gives: 'The asteroids passing Earth, with the miss distance and its range of uncertainty.',
    fresh:
      'Asked every 6 hours, for 30 days either side of the run. Flagged as older after 36 hours.',
  },
  {
    name: 'JPL Scout',
    sourceId: 'scout',
    url: 'https://ssd-api.jpl.nasa.gov/doc/scout.html',
    gives: 'Newly found objects whose orbits are still uncertain.',
    fresh: 'Asked in the same 6-hourly run as the close approaches.',
  },
  {
    name: 'ESA NEOCC',
    sourceId: 'neocc',
    url: 'https://neo.ssa.esa.int/en/computer-access',
    gives: 'ESA’s risk list and upcoming close approaches.',
    fresh: 'Read in the same 6-hourly run as the close approaches.',
  },
  {
    name: 'CelesTrak',
    sourceId: 'celestrak',
    url: 'https://celestrak.org/NORAD/documentation/gp-data-formats.php',
    gives: 'The orbit data for about 19,500 satellites.',
    fresh:
      'Refreshed every 6 hours. A satellite more than 3 days from its orbit data’s epoch is hidden.',
  },
  {
    name: 'Space-Track.org',
    sourceId: 'space-track',
    url: 'https://www.space-track.org/documentation',
    gives: 'Re-entry predictions, who owns a satellite, and when it launched.',
    fresh: 'Re-entry predictions every 6 hours. Catalogue entries and the Box Score daily.',
  },
  {
    name: 'ESA DISCOSweb',
    sourceId: 'discosweb',
    url: 'https://discosweb.esoc.esa.int/',
    gives: 'Mass, size and operator for the spacecraft and some satellites.',
    fresh: 'Read weekly.',
  },
  {
    name: 'NOAA GOES SUVI',
    sourceId: 'suvi',
    url: 'https://www.spaceweather.gov/products/goes-solar-ultraviolet-imager-suvi',
    gives: 'The live picture of the Sun.',
    fresh: 'The newest frame, checked every 10 minutes while the orrery is open.',
  },
  {
    name: 'NOAA solar wind',
    sourceId: 'solar-wind',
    url: 'https://www.spaceweather.gov/products/solar-wind',
    gives: 'The speed of the solar wind at L1.',
    fresh: 'Cached for 5 minutes and refetched every 5 minutes.',
  },
  {
    name: 'NOAA WSA-ENLIL',
    sourceId: 'enlil',
    url: 'https://www.spaceweather.gov/products/wsa-enlil-solar-wind-prediction',
    gives: 'Whether a cloud thrown off by the Sun (a CME) is forecast to reach Earth, and when.',
    fresh: 'Cached for 3 hours and refetched every 3 hours.',
  },
  {
    name: 'NASA Deep Space Network',
    sourceId: 'dsn',
    url: 'https://eyes.nasa.gov/apps/dsn-now/dsn.html',
    gives: 'Which craft the big dishes are talking to.',
    fresh: 'Checked every 15 seconds.',
  },
]

/** All the plain text of a section, for the copy checks. */
export function sectionText(s: Section): string {
  const parts: string[] = [s.title]
  for (const b of s.blocks) {
    if (b.kind === 'p') parts.push(b.text)
    else if (b.kind === 'list') parts.push(...b.items)
    else if (b.kind === 'marks') for (const m of b.items) parts.push(m.name, m.text)
  }
  return parts.join(' ')
}
