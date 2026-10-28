import type { AftershocksResponse } from '@/schemas/aftershocks'
import { AftershocksSchema } from '@/schemas/aftershocks'

import { getJsonMeta, type SourceEnvelope } from './client'

export function fetchAftershocksEnvelope(): Promise<SourceEnvelope<AftershocksResponse>> {
  return getJsonMeta('/api/aftershocks', AftershocksSchema)
}
