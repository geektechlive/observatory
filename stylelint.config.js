import { readFileSync } from 'node:fs'

// ROCI v2 rules 4 and 6 (#40), switched on per directory as each surface is reskinned.
const designLint = JSON.parse(readFileSync(new URL('./design-lint.json', import.meta.url), 'utf8'))
const enforcedCss = designLint.enforced.map((glob) => `${glob}/*.css`)

export default {
  extends: ['stylelint-config-standard'],
  rules: {
    // CSS Modules use camelCase class names by convention — allow both patterns
    'selector-class-pattern': [
      '^([a-z][a-zA-Z0-9]*)$|^([a-z][a-z0-9]*)(-[a-z0-9]+)*$',
      { message: (name) => `Class "${name}" should be camelCase or kebab-case` },
    ],
    // We use rgba() for glass material tokens — prefer legacy comma syntax for readability
    'color-function-alias-notation': null,
    'color-function-notation': null,
    // -webkit-backdrop-filter required for Safari support
    'property-no-vendor-prefix': null,
    // Intentional alpha values on color vars
    'alpha-value-notation': null,
    // Project uses decimal oklch notation throughout (e.g. 0.16 not 16%, 60 not 60deg)
    'lightness-notation': null,
    'hue-degree-notation': null,
    // CSS custom properties don't need empty lines
    'custom-property-empty-line-before': null,
    // @import syntax handled by bundler
    'import-notation': null,
  },
  overrides: [
    {
      files: enforcedCss,
      ignoreFiles: designLint.exempt,
      rules: {
        'color-no-hex': [true, { message: 'Colour literal: use a token (ROCI v2 rule 4)' }],
        'color-named': ['never', { message: 'Named colour: use a token (ROCI v2 rule 4)' }],
        'function-disallowed-list': [
          ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch'],
          { message: 'Colour function: use a token or color-mix() over tokens (ROCI v2 rule 4)' },
        ],
        'declaration-property-value-disallowed-list': [
          { 'font-size': [/^(?:[0-9]|10)(?:\.\d+)?px$/, /^0\.[0-5]\d*rem$/, /^0\.6[0-7]?\d?rem$/] },
          { message: 'Below the 11px type floor (ROCI v2 rule 6)' },
        ],
      },
    },
  ],
}
