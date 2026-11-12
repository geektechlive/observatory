import { vi } from 'vitest'

// A fake jpl-queue Durable Object (#100) and a runner for Pages Functions that take an
// env, shared by the tests of every Function that asks JPL through the queue.

export interface Reply {
  status?: number
  jplStatus: number
  body: unknown
  headers?: Record<string, string>
}

export function fakeQueue(replies: (url: string) => Reply) {
  const asked: string[] = []
  const stub = {
    fetch: vi.fn(async (_url: string, init: RequestInit) => {
      const { url } = JSON.parse(init.body as string) as { url: string }
      asked.push(url)
      const r = replies(url)
      return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), {
        status: r.status ?? 200,
        headers: { 'X-Jpl-Status': String(r.jplStatus), ...r.headers },
      })
    }),
  }
  const ns = {
    idFromName: vi.fn(() => 'the-one-id'),
    get: vi.fn(() => stub),
  }
  return { ns, asked }
}

type Handler = (ctx: never) => Response | Promise<Response>

export function run(
  handler: Handler,
  path: string,
  env: Record<string, unknown>,
): Promise<{ res: Response; settle: () => Promise<void> }> {
  const pending: Promise<unknown>[] = []
  const ctx = {
    request: new Request(`https://observatory.test${path}`),
    env,
    waitUntil: (p: Promise<unknown>) => pending.push(p),
  }
  return Promise.resolve(handler(ctx as never)).then((res) => ({
    res,
    settle: async () => {
      await Promise.all(pending)
    },
  }))
}
