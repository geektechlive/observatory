import type { GeoJSONSourceSpecification, RasterSourceSpecification } from 'maplibre-gl'

// NASA GIBS raster layers for the Earth map (#211). Tiles come straight from GIBS in the
// browser: no Function, no proxy. Identifiers, tile matrix sets, formats and dates are from
// GIBS's WMTS capabilities for EPSG:3857, read 2026-11-12:
// https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml
// Details and evidence: docs/reference/globe-and-design.md.

const WMTS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best'
const TILE_SIZE = 256

/**
 * GIBS asks for this acknowledgment in clients that use its services
 * (nasa-gibs.github.io/gibs-api-docs/, read 2026-11-12). Its text must stay verbatim.
 * MapLibre lists every distinct source credit, so it is not repeated on each tile source:
 * `gibsCreditSource()` carries it once, shown while any GIBS layer is on.
 */
export const GIBS_CREDIT =
  'We acknowledge the use of imagery provided by services from <a href="https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api" target="_blank" rel="noreferrer">NASA\'s Global Imagery Browse Services (GIBS)</a>, part of NASA\'s Earth Science Data and Information System (ESDIS).'

interface GibsLayer {
  identifier: string
  matrixSet: string
  maxzoom: number
}

/** Annual composites exist for 2012 and 2016 only; 2016 is the newest. */
export const NIGHT_LIGHTS: GibsLayer & { date: string; year: string } = {
  identifier: 'VIIRS_Black_Marble',
  matrixSet: 'GoogleMapsCompatible_Level8',
  maxzoom: 8,
  date: '2016-01-01',
  year: '2016',
}

/** Daily image built from IMERG Early 30-minute data (the 30-minute layer is too gappy). */
export const PRECIPITATION: GibsLayer = {
  identifier: 'IMERG_Precipitation_Rate',
  matrixSet: 'GoogleMapsCompatible_Level6',
  maxzoom: 6,
}

const DAY_MS = 24 * 3600 * 1000
// At 05:35Z on 12 Nov 2026 the newest IMERG day was 10 Nov (11 Nov answered 404). Two days
// back is safe by then; before noon UTC step back one more day for margin.
const IMERG_LAG_DAYS = 2
const IMERG_SAFE_HOUR_UTC = 12
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function utcDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

/** The newest IMERG day GIBS will have published at `now`, as YYYY-MM-DD (UTC). */
export function imergDate(now: Date): string {
  const lag = IMERG_LAG_DAYS + (now.getUTCHours() < IMERG_SAFE_HOUR_UTC ? 1 : 0)
  return utcDay(now.getTime() - lag * DAY_MS)
}

/** "2026-11-10" → "10 Nov 2026", with no locale in the way. */
function readableDay(isoDay: string): string {
  const [y, m, d] = isoDay.split('-')
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ''} ${y ?? ''}`
}

function tileUrl(layer: GibsLayer, date: string): string {
  return `${WMTS}/${layer.identifier}/default/${date}/${layer.matrixSet}/{z}/{y}/{x}.png`
}

/** An empty source whose only job is to show GIBS's acknowledgment once. */
export function gibsCreditSource(): GeoJSONSourceSpecification {
  return {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    attribution: GIBS_CREDIT,
  }
}

/** MODIS Terra true colour, the map's original GIBS layer (`date` is YYYY-MM-DD, UTC). */
export function modisSource(date: string): RasterSourceSpecification {
  return {
    type: 'raster',
    tiles: [
      `${WMTS}/MODIS_Terra_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
    ],
    tileSize: TILE_SIZE,
    maxzoom: 9,
    attribution: 'Imagery: NASA MODIS Terra true colour',
  }
}

export function nightLightsSource(): RasterSourceSpecification {
  return {
    type: 'raster',
    tiles: [tileUrl(NIGHT_LIGHTS, NIGHT_LIGHTS.date)],
    tileSize: TILE_SIZE,
    maxzoom: NIGHT_LIGHTS.maxzoom,
    attribution: `Night lights: NASA Black Marble ${NIGHT_LIGHTS.year}`,
  }
}

export function precipitationSource(now: Date = new Date()): RasterSourceSpecification {
  const date = imergDate(now)
  return {
    type: 'raster',
    tiles: [tileUrl(PRECIPITATION, date)],
    tileSize: TILE_SIZE,
    maxzoom: PRECIPITATION.maxzoom,
    attribution: `Precipitation: NASA GPM IMERG daily rate, ${readableDay(date)} (UTC)`,
  }
}
