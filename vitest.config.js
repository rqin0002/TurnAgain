import { defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './vite.config.js'

// Vitest inherits the Vite aliases (spec 3.4); unit tests run in node, component specs
// opt into jsdom per file with `// @vitest-environment jsdom` (spec 13.1).
export default mergeConfig(
  viteConfig({ command: 'serve', mode: 'test' }),
  defineConfig({
    test: {
      include: ['tests/unit/**/*.test.js'],
      environment: 'node',
    },
  }),
)
