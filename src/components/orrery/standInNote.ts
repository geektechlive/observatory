import type { ModelDescriptor } from '@/lib/orrery/modelDescriptor'

/** The note a stand-in model carries, or null for a model of the very object. */
export function standInNote(descriptor: ModelDescriptor, title: string): string | null {
  if (descriptor.kind === 'standin') {
    return `A simplified model built for this site. The real ${title} is not exactly this shape.`
  }
  if (descriptor.scope === 'family') {
    return `A stand-in shared by this kind of satellite. It is not the exact shape of ${title}.`
  }
  return null
}
