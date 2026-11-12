import { describe, expect, it } from 'vitest'

import { keepArrivalOrder } from '@/components/ticker/arrivalOrder'

const item = (id: string) => ({ id })
const ids = (list: { id: string }[]) => list.map((i) => i.id)

describe('keepArrivalOrder (#175)', () => {
  it('takes the first items in the order given', () => {
    expect(ids(keepArrivalOrder([], [item('a'), item('b')]))).toEqual(['a', 'b'])
  })

  it('puts a late feed after the items already on the strip, not in front', () => {
    const late = [item('reentry-1'), item('reentry-2'), item('eonet-a'), item('eonet-b')]
    expect(ids(keepArrivalOrder(['eonet-a', 'eonet-b'], late))).toEqual([
      'eonet-a',
      'eonet-b',
      'reentry-1',
      'reentry-2',
    ])
  })

  it('drops items that are gone and keeps the rest in place', () => {
    expect(ids(keepArrivalOrder(['a', 'b', 'c'], [item('c'), item('a'), item('d')]))).toEqual([
      'a',
      'c',
      'd',
    ])
  })
})
