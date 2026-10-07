import { defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './vite.config.js'

// Vitest inherits the Vite aliases; unit tests run in node, component specs
// opt into jsdom per file with `// @vitest-environment jsdom`.
export default mergeConfig(
  viteConfig({ command: 'serve', mode: 'test' }),
  defineConfig({
    test: {
      include: ['tests/unit/**/*.test.js'],
      environment: 'node',
    },
  }),
)
