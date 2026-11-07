const COMPASS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
]

/** The nearest of the 16 compass points to an azimuth (degrees from north, through east). */
export const compassPoint = (azDeg: number) =>
  COMPASS[Math.round((((azDeg % 360) + 360) % 360) / 22.5) % 16] ?? 'N'
