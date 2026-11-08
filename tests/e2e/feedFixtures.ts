/**
 * Trimmed copies of production feed answers (public NOAA, USGS and NASA data, taken
 * 2026-11-08) for the layout-shift test (#169). A real answer fills the console panels
 * to their real heights, which is what the layout has to have room for.
 */

export const SOLAR_WIND = {
  kpReadings: [
    {
      time: '2026-11-07T15:00:00',
      kp: 3,
    },
    {
      time: '2026-11-07T18:00:00',
      kp: 5.33,
    },
    {
      time: '2026-11-07T21:00:00',
      kp: 4,
    },
    {
      time: '2026-11-08T00:00:00',
      kp: 5,
    },
    {
      time: '2026-11-08T03:00:00',
      kp: 3.33,
    },
    {
      time: '2026-11-08T06:00:00',
      kp: 3,
    },
    {
      time: '2026-11-08T09:00:00',
      kp: 3.33,
    },
    {
      time: '2026-11-08T12:00:00',
      kp: 2.67,
    },
  ],
  currentKp: 2.67,
  windSpeed: 735.7,
  windDensity: 1.59,
  imfBz: 1.36,
  windSpeedSeries: [
    729.2, 726.5, 730.2, 733.9, 738.5, 740.7, 731.5, 745.5, 735.7, 736.3, 747.6, 738.9, 747.6,
    748.1, 740.4, 747.8, 741.5, 746.8, 753.7, 761.5, 751.7, 764.6, 784.3, 763.2, 757.3, 751.5,
    746.7, 752.8, 752.9, 754.6, 761.1, 754.6, 753.7, 749, 761.6, 748.4, 740.7, 760.6, 758.2, 770,
    790.7, 750.8, 746.6, 743.7, 737.8, 740.1, 740, 735.7,
  ],
  windDensitySeries: [
    1.97, 1.81, 1.69, 1.97, 2.18, 2.11, 1.98, 2.27, 2.05, 2.13, 2.25, 1.72, 1.95, 1.99, 2.1, 2.02,
    1.7, 1.62, 1.98, 2.29, 1.69, 1.57, 2.64, 1.88, 1.91, 1.94, 2, 1.68, 1.87, 1.96, 2.15, 1.8, 1.78,
    1.81, 2.01, 1.4, 1.47, 2.1, 1.8, 1.68, 2.57, 1.8, 1.63, 1.57, 1.48, 1.59, 1.62, 1.59,
  ],
  imfBzSeries: [
    1.58, 1.93, 1.9, 1.94, 2.57, 2.96, 2.3, 2.55, 1.95, 1.56, 1.68, 1.77, 2.24, 2.65, 1.16, 0.21,
    1.3, 0.47, 0.8, -0.79, 2.73, 2.78, 0.08, -0.96, 0.24, 1.1, 3.19, 2.7, 3.32, 3.53, 3.29, 3.51,
    3.58, 3.23, 3.42, 3.54, 3.15, 3.19, 3.32, 2.4, 4.07, 3.86, 3.62, 2.23, 2.47, 1.92, 1.58, 1.36,
  ],
  updatedAt: '2026-11-08T15:37:40.119Z',
}

export const AFTERSHOCKS = {
  forecasts: [
    {
      id: 'us6000u18k',
      mag: 7.7,
      place: '10 km WSW of Pitaloza Arriba, Panama',
      time: 1791568565537,
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us6000u18k',
      day: {
        m5: 0.0655,
        m6: 0.0071,
      },
      week: {
        m5: 0.3413,
        m6: 0.0429,
      },
    },
    {
      id: 'aka2026ukynnb',
      mag: 5.6,
      place: '43 km NNW of Lake Minchumina, Alaska',
      time: 1792062421800,
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/aka2026ukynnb',
      day: {
        m5: 0.00007253,
        m6: 0.000007253,
      },
      week: {
        m5: 0.0004475,
        m6: 0.00004477,
      },
    },
    {
      id: 'us7000ttke',
      mag: 5.4,
      place: '192 km WSW of Merizo Village, Guam',
      time: 1793142856849,
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000ttke',
      day: {
        m5: 0.001416,
        m6: 0.0001419,
      },
      week: {
        m5: 0.008121,
        m6: 0.0008224,
      },
    },
  ],
  updatedAt: '2026-11-08T15:25:46.824Z',
}

export const NWS_ALERTS = {
  features: [
    {
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-92.3, 41.89],
            [-92, 41.8],
            [-92.1, 41.7],
            [-92.3, 41.89],
          ],
        ],
      },
      event: 'Flood Warning',
      severity: 'Severe',
      headline:
        'Flood Warning issued November 8 at 9:22AM CST until November 9 at 7:00PM CST by NWS Quad Cities IA IL',
    },
    {
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-92.3, 41.89],
            [-92, 41.8],
            [-92.1, 41.7],
            [-92.3, 41.89],
          ],
        ],
      },
      event: 'Flood Warning',
      severity: 'Severe',
      headline:
        'Flood Warning issued November 8 at 7:31AM MST until November 9 at 11:00AM MST by NWS Phoenix AZ',
    },
  ],
  updatedAt: '2026-11-08T15:37:41.597Z',
}

export const CO2 = {
  ppm: 428.25,
  date: '2026-11-07',
  yearAgo: 426.52,
  updatedAt: '2026-11-08T15:25:46.187Z',
}

export const ISS_TLE = {
  name: 'ISS (ZARYA)',
  line1: '1 25544U 98067A   26312.17541007  .00012511  00000+0  23266-3 0  9990',
  line2: '2 25544  51.6320 307.5621 0007219   1.6306 358.4705 15.49256954594075',
}
