/// <reference lib="webworker" />
/**
 * The orrery's satellite worker (#98): loads the stored CelesTrak groups and runs one
 * SGP4 pass over all of them per frame, off the main thread. The logic is in
 * satHandler.ts; this only wires it to the worker's messages.
 */
import { createSatHandler, type SatRequest } from './satHandler'

const scope = self as unknown as DedicatedWorkerGlobalScope
const handle = createSatHandler()

scope.onmessage = (event: MessageEvent<SatRequest>) => {
  void handle(event.data).then(({ reply, transfer }) => {
    scope.postMessage(reply, transfer)
  })
}
