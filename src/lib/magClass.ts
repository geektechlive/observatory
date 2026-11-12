const MAG_WORDS: Readonly<Record<string, string>> = {
  A: 'Alpha',
  B: 'Beta',
  G: 'Gamma',
  D: 'Delta',
}

/**
 * SWPC's magnetic class code in the words its Solar Region Summary prints: "BG" is
 * Beta-Gamma (#210). An unknown code is shown as SWPC sent it.
 */
export function magClassWords(code: string | null): string {
  if (!code) return '—'
  const words = code
    .toUpperCase()
    .split('') // SWPC's codes are ASCII letters.
    .map((c) => MAG_WORDS[c])
  return words.every((w) => w !== undefined) ? words.join('-') : code
}
