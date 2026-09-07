const EPIC_IMAGE_PATTERN = /^epic_(?:1b|RGB)_(\d{4})(\d{2})(\d{2})\d{6}$/

/**
 * Builds a direct NASA EPIC archive URL for an image item, bypassing any proxy.
 * The date path (YYYY/MM/DD) is derived from the 14-digit timestamp embedded in
 * the `image` name itself, not from the `date` field, so it always matches
 * NASA's archive layout even if `date` is formatted differently.
 *
 * Returns null if `image` does not match the expected EPIC naming pattern
 * (e.g. path traversal attempts, truncated or empty names).
 */
export function epicImageUrl(
  item: { image: string; date: string },
  format: 'jpg' | 'png' = 'jpg',
): string | null {
  const match = EPIC_IMAGE_PATTERN.exec(item.image)
  if (!match) return null
  const [, year, month, day] = match
  return `https://epic.gsfc.nasa.gov/archive/natural/${year}/${month}/${day}/${format}/${item.image}.${format}`
}
