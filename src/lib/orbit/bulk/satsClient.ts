/**
 * Main-thread side of the satellite worker (#98). The fetched group bodies and the frame
 * buffers move between threads by transfer, never by copy. A frame the renderer has
 * finished with goes back through `release`, and the next `propagate` hands it to the
 * worker to write in place: two frames in flight at most, no allocation per pass.
 */
import type { SatFrame } from './satField'
import type { SatReply, SatRequest } from './satHandler'

export type SatLoaded = Extract<SatReply, { type: 'loaded' }>
export type SatUnloaded = Extract<SatReply, { type: 'unloaded' }>
export type SatFrameReply = Extract<SatReply, { type: 'frame' }>
type Loaded = SatLoaded
type Frame = SatFrameReply

export interface SatWorker {
  /** Load (or replace) a group from its /api/orrery-sats body; the buffer is transferred. */
  load(body: ArrayBuffer): Promise<Loaded>
  unload(group: Extract<SatRequest, { type: 'unload' }>['group']): Promise<SatUnloaded>
  propagate(date: Date): Promise<Frame>
  /** Hand back a frame's buffers once drawn, to be reused by the next pass. */
  release(frame: SatFrame): void
  terminate(): void
}

export function createSatWorker(): SatWorker {
  const worker = new Worker(new URL('./sats.worker.ts', import.meta.url), { type: 'module' })
  let next = 0
  let spare: SatFrame | null = null
  const pending = new Map<number, { resolve: (r: SatReply) => void; reject: (e: Error) => void }>()

  worker.onmessage = (event: MessageEvent<SatReply>) => {
    const reply = event.data
    const waiter = pending.get(reply.id)
    if (!waiter) return
    pending.delete(reply.id)
    if (reply.type === 'error') waiter.reject(new Error(reply.message))
    else waiter.resolve(reply)
  }

  function send<T extends SatReply>(req: SatRequest, transfer: Transferable[] = []): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      pending.set(req.id, {
        resolve: (r) => {
          resolve(r as T)
        },
        reject,
      })
      worker.postMessage(req, transfer)
    })
  }

  return {
    load(body) {
      return send<Loaded>({ type: 'load', id: ++next, body }, [body])
    },
    unload(group) {
      return send<SatUnloaded>({ type: 'unload', id: ++next, group })
    },
    propagate(date) {
      const reuse = spare ?? undefined
      spare = null
      const transfer = reuse ? [reuse.positions.buffer, reuse.status.buffer] : []
      return send<Frame>(
        { type: 'propagate', id: ++next, dateMs: date.getTime(), ...(reuse ? { reuse } : {}) },
        transfer,
      )
    },
    release(frame) {
      spare = frame
    },
    terminate() {
      worker.terminate()
    },
  }
}
