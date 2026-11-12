/**
 * The ticker's items in the order they first arrived (#175). Items already on the strip
 * keep their places and new ones join the end, so a feed that answers late never pushes
 * the items already scrolling along: that moved them by a screen width, a layout shift.
 * Items that are gone drop out.
 */
export function keepArrivalOrder<T extends { id: string }>(
  previousIds: readonly string[],
  items: readonly T[],
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  const kept = previousIds.flatMap((id) => byId.get(id) ?? [])
  return [...kept, ...items.filter((item) => !previousIds.includes(item.id))]
}
