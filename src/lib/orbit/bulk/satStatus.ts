/**
 * Each satellite's status byte in a worker frame (#98). Its own module with no imports,
 * so the main thread can read the bytes without importing satField.ts, which brings
 * satellite.js and zod with it (they belong in the worker).
 */
export const SAT_OK = 0
/** SGP4 gave no position (decayed, or bad elements). */
export const SAT_FAILED = 1
/** More than three days from the object's element epoch, where the spec refuses to draw it. */
export const SAT_OUT_OF_WINDOW = 2
