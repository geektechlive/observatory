/**
 * ESA DISCOSweb (#101): physical facts about spacecraft and satellites (mass, size,
 * shape, operator) from ESA's Database and Information System Characterising Objects in
 * Space, read by the refresh job with the owner's token and stored in KV.
 *
 * Plain TypeScript with no imports, so scripts/discos.mjs can import it under Node's
 * type stripping (like spacetrack.ts). Keep it that way.
 *
 * The API is JSON:API: `data[]` of objects with `attributes`, operators linked through
 * `relationships.operators` and listed in `included[]` with `include=operators`.
 */

export const DISCOS_API = 'https://discosweb.esoc.esa.int/api'
export const DISCOS_CITATION = 'ESA DISCOS (DISCOSweb)'
/** DISCOSweb's page size limit. */
export const DISCOS_PAGE = 100
/** Mass and size barely change: an object is asked again after a week. */
export const DISCOS_MAX_AGE_MS = 7 * 86_400_000

export interface CraftCospar {
  cospar: string
  /** Lower-case words one of which the returned name must contain (the DES=433 lesson). */
  expect: readonly string[]
}

/**
 * The orrery's spacecraft (craft.ts, by NAIF id) by COSPAR id. Each returned name is
 * checked against `expect`, so a wrong id shows up as missing rather than as another
 * craft's mass.
 */
export const CRAFT_COSPAR: Readonly<Record<string, CraftCospar>> = {
  '-31': { cospar: '1977-084A', expect: ['voyager 1', 'voyager-1'] },
  '-32': { cospar: '1977-076A', expect: ['voyager 2', 'voyager-2'] },
  '-98': { cospar: '2006-001A', expect: ['new horizons'] },
  '-96': { cospar: '2018-065A', expect: ['parker'] },
  '-61': { cospar: '2011-040A', expect: ['juno'] },
  '-159': { cospar: '2024-182A', expect: ['europa', 'clipper'] },
  '-255': { cospar: '2023-157A', expect: ['psyche'] },
  '-49': { cospar: '2021-093A', expect: ['lucy'] },
  '-144': { cospar: '2020-010A', expect: ['solar orbiter', 'solo'] },
  '-121': { cospar: '2018-080A', expect: ['bepi', 'mpo', 'mmo', 'mio'] },
  '-170': { cospar: '2021-130A', expect: ['jwst', 'webb'] },
  '-78': { cospar: '2015-007A', expect: ['dscovr', 'triana'] },
  '-92': { cospar: '1997-045A', expect: ['ace', 'advanced composition'] },
  '-21': { cospar: '1995-065A', expect: ['soho'] },
  '-8': { cospar: '1994-071A', expect: ['wind'] },
}

/** Whether a returned name contains one of the expected words, ignoring case. */
export function nameMatches(name: string, expected: readonly string[]): boolean {
  const n = name.toLowerCase()
  return expected.some((e) => n.includes(e))
}

export interface DiscosObject {
  satno: string | null
  cosparId: string | null
  name: string
  objectClass: string | null
  massKg: number | null
  shape: string | null
  widthM: number | null
  heightM: number | null
  depthM: number | null
  diameterM: number | null
  spanM: number | null
  operators: string[]
  firstEpoch: string | null
}

/** One page of objects, by NORAD numbers or by COSPAR ids, with their operators. */
export function discosObjectsUrl(by: {
  satnos?: readonly string[]
  cospars?: readonly string[]
}): string {
  const satnos = by.satnos ?? []
  const cospars = by.cospars ?? []
  if (satnos.length + cospars.length > DISCOS_PAGE || satnos.length * cospars.length > 0) {
    throw new Error('one page asks by one key, at most 100 objects')
  }
  const filter =
    satnos.length > 0
      ? `in(satno,(${satnos.join(',')}))`
      : `in(cosparId,(${cospars.map((c) => `'${c}'`).join(',')}))`
  const q = new URLSearchParams({ filter, include: 'operators', 'page[size]': String(DISCOS_PAGE) })
  return `${DISCOS_API}/objects?${q.toString()}`
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null

/** A JSON:API answer as objects, operators resolved to names. */
export function parseDiscosObjects(json: unknown): DiscosObject[] {
  const doc = json as { data?: unknown; included?: unknown } | null
  if (!doc || !Array.isArray(doc.data)) throw new Error('DISCOS: answer has no data list')
  const orgs = new Map<string, string>()
  for (const inc of Array.isArray(doc.included) ? (doc.included as unknown[]) : []) {
    const i = inc as { id?: unknown; attributes?: { name?: unknown } }
    const name = str(i.attributes?.name)
    if (typeof i.id === 'string' && name) orgs.set(i.id, name)
  }
  return (doc.data as unknown[]).map((d) => {
    const item = d as {
      attributes?: Record<string, unknown>
      relationships?: { operators?: { data?: unknown } }
    }
    const a = item.attributes ?? {}
    const links = item.relationships?.operators?.data
    const operators = (Array.isArray(links) ? (links as { id?: unknown }[]) : [])
      .map((l) => (typeof l.id === 'string' ? orgs.get(l.id) : undefined))
      .filter((n): n is string => n !== undefined)
    const satno = a['satno']
    return {
      satno: typeof satno === 'number' || typeof satno === 'string' ? String(satno) : null,
      cosparId: str(a['cosparId']),
      name: str(a['name']) ?? '',
      objectClass: str(a['objectClass']),
      massKg: num(a['mass']),
      shape: str(a['shape']),
      widthM: num(a['width']),
      heightM: num(a['height']),
      depthM: num(a['depth']),
      diameterM: num(a['diameter']),
      spanM: num(a['span']),
      operators,
      firstEpoch: str(a['firstEpoch']),
    }
  })
}

/** Whether an object fetched at `fetchedAt` should be asked again. */
export function discosStale(fetchedAt: string | undefined, nowMs: number): boolean {
  const at = fetchedAt === undefined ? Number.NaN : Date.parse(fetchedAt)
  return !Number.isFinite(at) || nowMs - at > DISCOS_MAX_AGE_MS
}
