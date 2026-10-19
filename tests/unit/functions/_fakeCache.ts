import { vi } from 'vitest'

/** An in-memory stand-in for `caches.default`, so the real cachedJson can run in tests. */
interface Entry {
  text: string
  status: number
  headers: [string, string][]
}

export function installFakeCache(): Map<string, Entry> {
  const store = new Map<string, Entry>()
  const fake = {
    match: async (req: Request): Promise<Response | undefined> => {
      const e = store.get(req.url)
      return e
        ? new Response(e.text, { status: e.status, headers: new Headers(e.headers) })
        : undefined
    },
    put: async (req: Request, res: Response): Promise<void> => {
      store.set(req.url, { text: await res.text(), status: res.status, headers: [...res.headers] })
    },
  }
  vi.stubGlobal('caches', { default: fake })
  return store
}

export interface TestCtx {
  ctx: { request: { url: string }; waitUntil: (p: Promise<unknown>) => void }
  settle: () => Promise<void>
}

export function makeCtx(url = 'https://example.test/api/x'): TestCtx {
  const pending: Promise<unknown>[] = []
  return {
    ctx: {
      request: { url },
      waitUntil: (p) => {
        pending.push(p)
      },
    },
    settle: async () => {
      await Promise.all(pending)
    },
  }
}
