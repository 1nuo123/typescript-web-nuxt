// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    ignores: [
      '**/coverage/**',
      '**/.nuxt/**',
      '**/.output/**',
      '**/playwright-report/**',
    ],
  },
  {
    rules: {
      'vue/html-self-closing': 'off',
    },
  },
)
