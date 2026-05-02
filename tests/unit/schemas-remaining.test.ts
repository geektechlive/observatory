import { describe, it, expect } from 'vitest'
import { RawEpicArraySchema, EpicResponseSchema } from '@/schemas/epic'
import { IssTleSchema } from '@/schemas/iss-tle'
import { LaunchesResponseSchema } from '@/schemas/launches'
import { SolarWindSchema } from '@/schemas/solarWind'

describe('RawEpicArraySchema', () => {
  it('parses an array of raw epic images', () => {
    const input = [
      {
        identifier: 'epic_1b_20250101',
        caption: 'Test caption',
        image: 'epic_1b_20250101',
        date: '2025-01-01 12:00:00',
        centroid_coordinates: { lat: 12.5, lon: -45.0 },
      },
    ]
    const result = RawEpicArraySchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('parses empty array', () => {
    expect(RawEpicArraySchema.safeParse([]).success).toBe(true)
  })

  it('rejects item missing identifier', () => {
    const input = [
      { caption: 'x', image: 'y', date: 'd', centroid_coordinates: { lat: 0, lon: 0 } },
    ]
    expect(RawEpicArraySchema.safeParse(input).success).toBe(false)
  })
})

describe('EpicResponseSchema', () => {
  it('parses valid transformed epic response', () => {
    const input = {
      image: 'epic_1b_20250101',
      date: '2025-01-01',
      caption: 'Test',
      centroidLat: 12.5,
      centroidLon: -45.0,
      year: '2025',
      month: '01',
      day: '01',
    }
    const result = EpicResponseSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.year).toBe('2025')
  })

  it('rejects missing centroidLat', () => {
    const input = {
      image: 'x',
      date: 'd',
      caption: 'c',
      centroidLon: 0,
      year: '2025',
      month: '01',
      day: '01',
    }
    expect(EpicResponseSchema.safeParse(input).success).toBe(false)
  })
})

describe('IssTleSchema', () => {
  it('parses valid TLE object', () => {
    const input = {
      name: 'ISS (ZARYA)',
      line1: '1 25544U 98067A   25001.00000000  .00001000  00000-0  10000-4 0  9993',
      line2: '2 25544  51.6410  50.0000 0001000  50.0000 310.0000 15.50000000  1000',
    }
    const result = IssTleSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects missing name', () => {
    const input = { line1: '1 25544U', line2: '2 25544' }
    expect(IssTleSchema.safeParse(input).success).toBe(false)
  })

  it('rejects missing line2', () => {
    const input = { name: 'ISS', line1: '1 25544U' }
    expect(IssTleSchema.safeParse(input).success).toBe(false)
  })
})

describe('LaunchesResponseSchema', () => {
  it('parses response with empty result array', () => {
    const input = { valid_auth: true, count: 0, result: [] }
    const result = LaunchesResponseSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('parses response with launch containing optional nulls', () => {
    const input = {
      valid_auth: true,
      count: 1,
      result: [
        {
          id: 1,
          name: 'Falcon 9',
          sort_date: '2025-06-01T00:00:00Z',
          t0: null,
          win_open: null,
          date_str: null,
          provider: null,
          vehicle: null,
          pad: null,
          launch_description: null,
        },
      ],
    }
    const result = LaunchesResponseSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('parses response with fully populated launch', () => {
    const input = {
      valid_auth: true,
      count: 1,
      result: [
        {
          id: 1,
          name: 'Falcon 9',
          sort_date: '2025-06-01T00:00:00Z',
          provider: { id: 1, name: 'SpaceX', slug: 'spacex' },
          vehicle: { id: 1, name: 'Falcon 9' },
          pad: {
            id: 1,
            name: 'SLC-40',
            location: { id: 1, name: 'CCSFS', state: 'FL', country: 'USA' },
          },
          launch_description: 'A Starlink mission',
        },
      ],
    }
    const result = LaunchesResponseSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects missing count field', () => {
    const input = { valid_auth: true, result: [] }
    expect(LaunchesResponseSchema.safeParse(input).success).toBe(false)
  })
})

describe('SolarWindSchema', () => {
  it('parses with all null values', () => {
    const input = {
      kpReadings: [],
      currentKp: null,
      windSpeed: null,
      windDensity: null,
      imfBz: null,
      updatedAt: '2025-01-01T00:00:00Z',
    }
    const result = SolarWindSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('parses with populated numeric values', () => {
    const input = {
      kpReadings: [{ time: '2025-01-01T00:00:00Z', kp: 3.5 }],
      currentKp: 3.5,
      windSpeed: 450.0,
      windDensity: 8.2,
      imfBz: -5.1,
      updatedAt: '2025-01-01T01:00:00Z',
    }
    const result = SolarWindSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.currentKp).toBe(3.5)
  })

  it('rejects missing updatedAt', () => {
    const input = {
      kpReadings: [],
      currentKp: null,
      windSpeed: null,
      windDensity: null,
      imfBz: null,
    }
    expect(SolarWindSchema.safeParse(input).success).toBe(false)
  })
})
