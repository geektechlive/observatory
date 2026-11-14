/**
 * A link target built from upstream data, or undefined when it isn't an https URL (#249):
 * the text then shows without a link. React 19 and the CSP already stop `javascript:`; this
 * also keeps a spoofed or broken feed from making an http or other-scheme link.
 */
export function httpsHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && url.startsWith('https://') ? parsed.href : undefined
  } catch {
    return undefined
  }
}
