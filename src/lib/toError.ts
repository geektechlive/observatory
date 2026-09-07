/**
 * Normalizes an unknown throw value into a real `Error`.
 *
 * Needed because not everything thrown in this app is an `Error`: zod 4 splits
 * `ZodError` off the core `$ZodError` base, so `new ZodError([]) instanceof Error`
 * is `false`. The naive `e instanceof Error ? e : new Error(String(e))` pattern
 * turns a schema failure into a useless "[object Object]" message.
 */
export function toError(e: unknown): Error {
  if (e instanceof Error) return e
  if (typeof e === 'string') return new Error(e)

  if (e !== null && typeof e === 'object') {
    const candidate = e as { message?: unknown; name?: unknown }
    if (typeof candidate.message === 'string' && candidate.message.length > 0) {
      const err = new Error(candidate.message, { cause: e })
      if (typeof candidate.name === 'string' && candidate.name.length > 0) err.name = candidate.name
      return err
    }
    try {
      return new Error(JSON.stringify(e), { cause: e })
    } catch {
      return new Error(Object.prototype.toString.call(e), { cause: e })
    }
  }

  return new Error(String(e))
}
