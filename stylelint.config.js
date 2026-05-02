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
}
