// Parser for NASA Deep Space Network "DSN Now" XML. Stations and dishes are
// flat siblings under <dsn>; each <dish> belongs to the most recent <station>.

export interface DsnSignal {
  dir: 'up' | 'down'
  band: string
  spacecraft: string
  dataRate: number
}

export interface DsnContact {
  spacecraft: string
  /** Round-trip light time, seconds (−1 when unknown/idle). */
  rtlt: number
  bands: string[]
  hasUp: boolean
  hasDown: boolean
}

export interface DsnDish {
  name: string
  activity: string
  contacts: DsnContact[]
}

export interface DsnStation {
  name: string
  friendlyName: string
  dishes: DsnDish[]
}

export interface DsnData {
  stations: DsnStation[]
}

const SPEED_OF_LIGHT_KMS = 299_792.458

/** One-way distance in km from a round-trip light time (seconds). */
export function rtltToDistanceKm(rtlt: number): number | null {
  if (!isFinite(rtlt) || rtlt <= 0) return null
  return (rtlt * SPEED_OF_LIGHT_KMS) / 2
}

function num(v: string | null): number {
  const n = v != null ? parseFloat(v) : NaN
  return isFinite(n) ? n : 0
}

export function parseDsn(xml: string): DsnData {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const root = doc.querySelector('dsn')
  const stations: DsnStation[] = []
  if (!root) return { stations }

  for (const el of Array.from(root.children)) {
    const tag = el.tagName.toLowerCase()
    if (tag === 'station') {
      stations.push({
        name: el.getAttribute('name') ?? '',
        friendlyName: el.getAttribute('friendlyName') ?? el.getAttribute('name') ?? '',
        dishes: [],
      })
      continue
    }
    if (tag !== 'dish') continue
    const station = stations[stations.length - 1]
    if (!station) continue

    // Round-trip light time per spacecraft, from <target> rows.
    const rtltByName = new Map<string, number>()
    for (const t of Array.from(el.querySelectorAll('target'))) {
      const name = t.getAttribute('name')
      if (name) rtltByName.set(name, num(t.getAttribute('rtlt')))
    }

    // Active signals → contacts grouped by spacecraft.
    const byCraft = new Map<string, DsnContact>()
    for (const sig of Array.from(el.querySelectorAll('upSignal, downSignal'))) {
      if (sig.getAttribute('active') !== 'true') continue
      const craft = sig.getAttribute('spacecraft')
      if (!craft || craft === 'DSN' || craft === '') continue
      const dir: 'up' | 'down' = sig.tagName.toLowerCase() === 'upsignal' ? 'up' : 'down'
      const band = sig.getAttribute('band') ?? ''
      const contact =
        byCraft.get(craft) ??
        ({
          spacecraft: craft,
          rtlt: rtltByName.get(craft) ?? -1,
          bands: [],
          hasUp: false,
          hasDown: false,
        } as DsnContact)
      if (band && !contact.bands.includes(band)) contact.bands.push(band)
      if (dir === 'up') contact.hasUp = true
      else contact.hasDown = true
      byCraft.set(craft, contact)
    }

    const contacts = [...byCraft.values()]
    if (contacts.length === 0) continue // skip idle dishes

    station.dishes.push({
      name: el.getAttribute('name') ?? '',
      activity: el.getAttribute('activity') ?? '',
      contacts,
    })
  }

  return { stations }
}
