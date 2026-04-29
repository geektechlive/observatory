import { describe, it, expect } from 'vitest'
import { NeoResponseSchema } from '@/schemas/neo'
import { SentryResponseSchema } from '@/schemas/sentry'
import { DonkiResponseSchema } from '@/schemas/donki'
import { ApodSchema } from '@/schemas/apod'
import { FireballResponseSchema } from '@/schemas/fireball'
import { EonetResponseSchema } from '@/schemas/eonet'

describe('NeoResponseSchema', () => {
  it('parses valid NeoWs response', () => {
    const input = {
      element_count: 1,
      near_earth_objects: {
        '2024-05-01': [
          {
            id: '123',
            name: 'Test Asteroid',
            absolute_magnitude_h: 22.5,
            is_potentially_hazardous_asteroid: false,
            estimated_diameter: {
              kilometers: { estimated_diameter_min: 0.01, estimated_diameter_max: 0.02 },
            },
            close_approach_data: [
              {
                close_approach_date: '2024-05-01',
                miss_distance: { kilometers: '500000', lunar: '1.3', astronomical: '0.003' },
                relative_velocity: { kilometers_per_second: '7.5' },
              },
            ],
          },
        ],
      },
    }
    const result = NeoResponseSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.element_count).toBe(1)
  })

  it('rejects missing required fields', () => {
    const result = NeoResponseSchema.safeParse({ element_count: 1 })
    expect(result.success).toBe(false)
  })
})

describe('SentryResponseSchema', () => {
  it('parses valid Sentry response', () => {
    const input = {
      count: '2',
      data: [{ des: '99942', fullname: 'Apophis', ps_cum: '-3.42', ip: '0.0001', n_imp: '1' }],
    }
    const result = SentryResponseSchema.safeParse(input)
    expect(result.success).toBe(true)
  })
})

describe('DonkiResponseSchema', () => {
  it('parses empty arrays for all event types', () => {
    const input = { flares: [], cmes: [], geomagneticStorms: [], seps: [] }
    const result = DonkiResponseSchema.safeParse(input)
    expect(result.success).toBe(true)
  })
})

describe('ApodSchema', () => {
  it('parses valid APOD image response', () => {
    const input = {
      date: '2024-05-01',
      title: 'Test Image',
      explanation: 'A test explanation.',
      url: 'https://apod.nasa.gov/apod/image/test.jpg',
      media_type: 'image',
      service_version: 'v1',
    }
    const result = ApodSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects invalid media_type', () => {
    const input = {
      date: '2024-05-01',
      title: 'Test',
      explanation: 'Test.',
      url: 'https://apod.nasa.gov/test.jpg',
      media_type: 'audio',
      service_version: 'v1',
    }
    const result = ApodSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe('FireballResponseSchema', () => {
  it('parses valid fireball response with nullable fields', () => {
    const input = {
      count: '1',
      data: [
        {
          date: '2024-05-01 12:00:00',
          energy: '1.5',
          impactE: null,
          lat: '35.0',
          latDir: 'N',
          lon: '120.0',
          lonDir: 'W',
          alt: '50',
          vel: '12.5',
        },
      ],
    }
    const result = FireballResponseSchema.safeParse(input)
    expect(result.success).toBe(true)
  })
})

describe('EonetResponseSchema', () => {
  it('parses valid EONET response', () => {
    const input = {
      title: 'EONET Events',
      description: 'Natural events',
      link: 'https://eonet.gsfc.nasa.gov/api/v3/events',
      events: [
        {
          id: 'EONET_1234',
          title: 'Test Wildfire',
          link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_1234',
          categories: [{ id: 'wildfires', title: 'Wildfires' }],
          sources: [{ id: 'NASA', url: 'https://nasa.gov' }],
          geometry: [{ type: 'Point', date: '2024-05-01T00:00:00Z', coordinates: [-120.5, 35.2] }],
        },
      ],
    }
    const result = EonetResponseSchema.safeParse(input)
    expect(result.success).toBe(true)
  })
})
