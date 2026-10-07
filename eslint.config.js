import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'

/**
 * Layer boundaries, enforced with two core rules: `no-restricted-imports` for
 * static imports and `no-restricted-syntax` for dynamic `import('...')` with a string literal.
 * A specifier built at runtime (`import(name)`) is not a literal and is not checked.
 *
 * ESLint flat config does not merge rule options: when two config objects match the same file and
 * both set `no-restricted-imports`, the later one replaces the earlier one entirely. So the file
 * classes below are DISJOINT (each file matches exactly one `boundaries/*` object; `ignores` keep
 * them apart) and every object carries the full set of restrictions for its class. Each pattern
 * names the boundary it enforces, so a violation says which rule was crossed.
 * tests/unit/lint/boundaries.test.js proves the classes fire for both import forms.
 * The classes cover src/, functions/ and seed/; tests/ and the root configs carry no boundary rules.
 */

const HEAVY_LIBRARIES = [
  'vue',
  'vue-router',
  'pinia',
  'firebase',
  'firebase/*',
  'firebase-admin',
  'firebase-admin/*',
  'firebase-functions',
  'firebase-functions/*',
  'leaflet',
  'chart.js',
  '@fullcalendar/*',
  'animejs',
  'animejs/*',
]

const RESTRICTIONS = {
  'domain-pure': [
    ...HEAVY_LIBRARIES,
    '**/data/**',
    '**/composables/**',
    '**/components/**',
    '**/lib/**',
    '@/firebase/*',
  ],
  'data-only-firebase': ['firebase', 'firebase/*'],
  // The shell renders firebaseConfigProblem: the wiring under
  // @/firebase is allowed there, the SDK is not. A group of its own so the message names it.
  'shell-no-sdk': ['/firebase', '/firebase/*'],
  // Repositories never render and components never read (the composable sits between).
  'data-no-ui': ['vue', 'vue-router', 'pinia', '**/components/**', '**/views/**', '**/stores/**'],
  'components-no-data': ['**/data/**'],
  'no-parent-escape': ['../../**'],
  'no-cross-feature-internals': [
    '@/features/*/data/**',
    '@/features/*/composables/**',
    '@/features/*/stores/**',
    '!@/features/auth/stores/authStore.js',
  ],
  'shared-never-features': ['@/features/**', '@/views/**', '**/features/**', '**/views/**'],
  'views-no-data': ['@/features/*/data/**', '**/features/*/data/**', 'firebase', 'firebase/*'],
  'firebase-wiring-only': [
    '@/features/**',
    '@/views/**',
    '@/shared/**',
    '**/features/**',
    '**/views/**',
    '**/shared/**',
  ],
  'functions-shared-pure': [
    'firebase-admin',
    'firebase-admin/*',
    'firebase-functions',
    'firebase-functions/*',
    '../lib/*',
    '../*.js',
    'node:*',
  ],
  // `**/src/**` catches every relative depth (functions/lib/x.js -> ../../src/...), `../src/**` would not.
  'functions-no-src': ['**/src/**', '@/**'],
  // The seed imports pure modules, the config object and the Web SDK; never a
  // module that reads import.meta.env (every other src/firebase file, every repository), never a
  // server SDK, never functions/ outside functions/shared. Gitignore semantics: a negation cannot
  // re-include a path whose parent directory an earlier pattern excluded, so src/ and functions/
  // are denied one directory level at a time and the allowed directories are re-included at their
  // level, in the `@/` form and in the relative form alike (`../../src/...` from seed/lib,
  // `../src/...` from seed/). `**/lib/**` is deliberately absent: the seed's own helpers live in
  // seed/lib, and functions/lib is caught by `**/functions/*`.
  'seed-pure-imports': [
    'vue',
    'vue-router',
    'pinia',
    'leaflet',
    'chart.js',
    'animejs',
    'animejs/*',
    'firebase-admin',
    'firebase-admin/*',
    'firebase-functions',
    'firebase-functions/*',
    '@/*',
    '!@/features',
    '!@/shared',
    '!@/firebase',
    '@/features/*/*',
    '!@/features/*/domain',
    '@/shared/*',
    '!@/shared/domain',
    '@/firebase/*',
    '!@/firebase/firebaseConfig.js',
    '**/src/*',
    '!**/src/features',
    '!**/src/shared',
    '!**/src/firebase',
    '**/src/features/*/*',
    '!**/src/features/*/domain',
    '**/src/shared/*',
    '!**/src/shared/domain',
    '**/src/firebase/*',
    '!**/src/firebase/firebaseConfig.js',
    '**/functions/*',
    '!**/functions/shared',
  ],
}

/**
 * The same restrictions for dynamic `import()`, as regexes over the specifier literal, because
 * `no-restricted-imports` visits only static declarations. Every RESTRICTIONS key needs an entry
 * here (a missing one throws at config load), so the two tables cannot drift apart silently.
 * The gitignore-style `**` patterns above match a path segment at any depth, hence `(^|\/)`.
 */
const HEAVY_LIBRARY_SPECIFIER =
  /^(firebase|firebase-admin|firebase-functions|vue|vue-router|pinia|leaflet|chart\.js|@fullcalendar|animejs)(\/|$)/u

const DYNAMIC_RESTRICTIONS = {
  'domain-pure': [
    HEAVY_LIBRARY_SPECIFIER,
    /(^|\/)(data|composables|components|lib)\//u,
    /^@\/firebase\//u,
  ],
  'data-only-firebase': [/^firebase(\/|$)/u],
  'shell-no-sdk': [/^firebase(\/|$)/u],
  'data-no-ui': [/^(vue|vue-router|pinia)(\/|$)/u, /(^|\/)(components|views|stores)\//u],
  'components-no-data': [/(^|\/)data\//u],
  'no-parent-escape': [/^\.\.\/\.\.\//u],
  // The authStore exception is a negative lookahead; esquery cannot negate one pattern of a group.
  'no-cross-feature-internals': [
    /^@\/features\/[^/]+\/(data|composables)\//u,
    /^@\/features\/(?!auth\/stores\/authStore\.js)[^/]+\/stores\//u,
  ],
  'shared-never-features': [/(^|\/)(features|views)\//u],
  'views-no-data': [/(^|\/)features\/[^/]+\/data\//u, /^firebase(\/|$)/u],
  'firebase-wiring-only': [/(^|\/)(features|views|shared)\//u],
  'functions-shared-pure': [
    /^(firebase-admin|firebase-functions)(\/|$)/u,
    /^\.\.\/(lib\/|[^/]+\.js$)/u,
    /^node:/u,
  ],
  'functions-no-src': [/(^|\/)src\//u, /^@\//u],
  // The negative lookaheads mirror the re-included directories of the static group above.
  'seed-pure-imports': [
    /^(vue|vue-router|pinia|leaflet|chart\.js|animejs|firebase-admin|firebase-functions)(\/|$)/u,
    /^@\/(?!features\/[^/]+\/domain\/|shared\/domain\/|firebase\/firebaseConfig\.js$)/u,
    /^(\.\.?\/)+src\/(?!features\/[^/]+\/domain\/|shared\/domain\/|firebase\/firebaseConfig\.js$)/u,
    /^(\.\.?\/)+functions\/(?!shared\/)/u,
  ],
}

const violation = (name) =>
  `boundaries/${name}: this import crosses a layer boundary (spec 3.3-3.4).`

const patterns = (...names) =>
  names.map((name) => ({ group: RESTRICTIONS[name], message: violation(name) }))

const specifierTest = (specifier) => `[value=/${specifier.source}/${specifier.flags}]`

/**
 * One selector per regex, in the listed order. Each excludes the regexes of the restrictions
 * listed before it, so a dynamic import names exactly the first restriction it crosses, as
 * `no-restricted-imports` does for its patterns; ESLint would otherwise order same-node reports
 * by selector text.
 */
const dynamicImportSelectors = (...names) =>
  names.flatMap((name, index) => {
    const earlier = names
      .slice(0, index)
      .flatMap((previous) => DYNAMIC_RESTRICTIONS[previous])
      .map(specifierTest)
    const exclusion = earlier.length > 0 ? `:not(${earlier.join(', ')})` : ''
    return DYNAMIC_RESTRICTIONS[name].map((specifier) => ({
      selector: `ImportExpression > Literal${specifierTest(specifier)}${exclusion}`,
      message: violation(name),
    }))
  })

/** One disjoint file class; the first listed restriction that matches names the violation. */
const boundaries = (name, files, ignores, names, rules = {}) => ({
  name: `boundaries/${name}`,
  files,
  ignores,
  rules: {
    'no-restricted-imports': ['error', { patterns: patterns(...names) }],
    'no-restricted-syntax': ['error', ...dynamicImportSelectors(...names)],
    ...rules,
  },
})

export default defineConfig([
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,js,mjs,jsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**', '**/.superpowers/**']),

  {
    name: 'app/browser-globals',
    files: ['src/**/*.{js,vue}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    name: 'app/node-globals',
    files: ['functions/**/*.js', 'seed/**/*.{js,mjs}', '*.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Component specs run under `// @vitest-environment jsdom` and read window and document.
    name: 'app/test-globals',
    files: ['tests/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.vitest, ...globals.browser } },
  },

  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    // A classic script, not a module: it runs in <head> before the bundle. It sits
    // after the Vue preset, whose `vue/base/setup` sets `sourceType: 'module'` for every file.
    name: 'app/theme-init-script',
    files: ['public/theme-init.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } },
  },
  {
    // The shared primitive is named `Chip.vue`; the essential rule would demand a second word.
    name: 'app/shared-component-names',
    files: ['src/shared/components/Chip.vue'],
    rules: { 'vue/multi-word-component-names': ['error', { ignores: ['Chip'] }] },
  },

  // src/features: domain, data, components, everything else
  boundaries(
    'features-domain',
    ['src/features/*/domain/**/*.js'],
    [],
    ['domain-pure', 'no-parent-escape', 'no-cross-feature-internals'],
  ),
  boundaries(
    'features-data',
    ['src/features/*/data/**/*.js'],
    [],
    ['no-parent-escape', 'no-cross-feature-internals', 'data-no-ui'],
  ),
  boundaries(
    'features-components',
    ['src/features/*/components/**/*.{js,vue}'],
    [],
    ['data-only-firebase', 'no-parent-escape', 'no-cross-feature-internals', 'components-no-data'],
  ),
  boundaries(
    'features',
    ['src/features/**/*.{js,vue}'],
    ['src/features/*/domain/**', 'src/features/*/data/**', 'src/features/*/components/**'],
    ['data-only-firebase', 'no-parent-escape', 'no-cross-feature-internals'],
  ),

  // src/shared: domain, data, everything else
  boundaries(
    'shared-domain',
    ['src/shared/domain/**/*.js'],
    [],
    ['domain-pure', 'shared-never-features'],
  ),
  boundaries(
    'shared-data',
    ['src/shared/data/**/*.js'],
    [],
    ['shared-never-features', 'data-no-ui'],
  ),
  boundaries(
    'shared',
    ['src/shared/**/*.{js,vue}'],
    ['src/shared/domain/**', 'src/shared/data/**'],
    ['data-only-firebase', 'shared-never-features'],
  ),

  // views, the shell and the wiring
  boundaries('views', ['src/views/**/*.vue'], [], ['views-no-data']),
  boundaries('shell', ['src/router/**/*.js', 'src/App.vue', 'src/main.js'], [], ['shell-no-sdk']),
  boundaries('firebase-wiring', ['src/firebase/**/*.js'], [], ['firebase-wiring-only']),

  // functions: the pure shared directory, then everything else
  boundaries(
    'functions-shared',
    ['functions/shared/**/*.js'],
    [],
    ['functions-shared-pure', 'domain-pure', 'functions-no-src'],
    { 'no-restricted-globals': ['error', 'process'] },
  ),
  boundaries(
    'functions',
    ['functions/**/*.js'],
    ['functions/shared/**', 'functions/node_modules/**'],
    ['functions-no-src'],
  ),

  // the seed: disjoint by construction, no other class matches seed/**
  boundaries('seed', ['seed/**/*.{js,mjs}'], [], ['seed-pure-imports']),

  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

  skipFormatting,
])
