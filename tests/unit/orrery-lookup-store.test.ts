import { afterEach, describe, expect, it } from 'vitest'

import { useLookupStore } from '@/components/orrery/lookupStore'
import type { LookupObject } from '@/schemas/jplLookup'

const apophis: LookupObject = {
  id: 'sb:20099942',
  spkid: '20099942',
  name: '99942 Apophis (2004 MN4)',
  designation: '99942',
  prefix: null,
  kind: 'asteroid',
  orbitClass: { code: 'ATE', name: 'Aten' },
  neo: true,
  pha: true,
}

afterEach(() => {
  useLookupStore.getState().clear()
})

describe('lookupStore (#145)', () => {
  it('starts empty', () => {
    expect(useLookupStore.getState().shown).toBeNull()
  })

  it('"Show in orrery" holds the object and asks the page to focus it once drawn', () => {
    useLookupStore.getState().show(apophis)
    expect(useLookupStore.getState().shown).toEqual({
      spkid: '20099942',
      object: apophis,
      focusOnLoad: true,
    })
    useLookupStore.getState().focused()
    expect(useLookupStore.getState().shown?.focusOnLoad).toBe(false)
  })

  it('a shared link asks by SPK-ID alone; the link selects it itself', () => {
    useLookupStore.getState().request('20099942')
    expect(useLookupStore.getState().shown).toEqual({
      spkid: '20099942',
      object: null,
      focusOnLoad: false,
    })
  })

  it('asking again for the object already shown changes nothing', () => {
    useLookupStore.getState().show(apophis)
    useLookupStore.getState().focused()
    const before = useLookupStore.getState().shown
    useLookupStore.getState().request('20099942')
    expect(useLookupStore.getState().shown).toBe(before)
  })

  it('clear removes it', () => {
    useLookupStore.getState().show(apophis)
    useLookupStore.getState().clear()
    expect(useLookupStore.getState().shown).toBeNull()
  })
})
