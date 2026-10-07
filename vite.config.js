import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

import { EMULATOR_HOST, EMULATOR_PORTS } from './src/firebase/firebaseConfig.js'

/** The production policy, read from public/_headers so development and Cloudflare share one source. */
function productionCsp() {
  let headers
  try {
    headers = readFileSync(fileURLToPath(new URL('./public/_headers', import.meta.url)), 'utf8')
  } catch (error) {
    // The file is the security policy of the deployed site: a tree without it is
    // broken, and a dev server that quietly ran without a CSP would hide that.
    throw new Error('[turnagain] public/_headers is missing or unreadable: ' + error.message, {
      cause: error,
    })
  }
  const line = headers
    .split(/\r?\n/u)
    .find((entry) => entry.trim().startsWith('Content-Security-Policy:'))
  return line ? line.trim().slice('Content-Security-Policy:'.length).trim() : ''
}

/**
 * Loopback origins the running mode actually connects to. Development mode runs callables on the
 * local Functions emulator while Auth and Firestore stay live, so the allowance
 * follows the loaded VITE_* variables, not the mode name. Ports match firebase.json and
 * EMULATOR_PORTS in src/firebase/firebaseConfig.js.
 */
function emulatorOrigins(mode) {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const origins = []
  if (env.VITE_FUNCTIONS_TARGET === 'emulator') {
    origins.push('http://127.0.0.1:5001')
  }
  if (env.VITE_USE_EMULATORS === '1') {
    origins.push('http://127.0.0.1:9099', 'http://127.0.0.1:8080')
  }
  return origins
}

/**
 * Dev-only CSP: the production policy plus exactly what the Vite dev server
 * needs (injected <style> elements, the HMR websocket) and the loopback emulator origins the
 * mode's env selects. `upgrade-insecure-requests` is dropped because everything is plain http
 * locally. Production keeps `style-src 'self'`; this plugin never runs in a build.
 */
function devCsp(mode) {
  return {
    name: 'turnagain:dev-csp',
    apply: 'serve',
    configureServer(server) {
      const production = productionCsp()
      if (!production) {
        server.config.logger.warn(
          '[turnagain] public/_headers has no Content-Security-Policy line; the dev server sends no CSP.',
        )
        return
      }
      const emulators = emulatorOrigins(mode)
        .map((origin) => ` ${origin}`)
        .join('')
      const csp = production
        .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
        .replace(
          "connect-src 'self'",
          `connect-src 'self' ws://localhost:* ws://127.0.0.1:*${emulators}`,
        )
        .replace('; upgrade-insecure-requests', '')
      // The replacements match directive text, so a rename in _headers would silently leave out
      // the inline styles or the HMR websocket that development depends on. Compare the rewritten
      // directives themselves, not fragments the production line could already contain.
      if (
        !csp.includes("style-src 'self' 'unsafe-inline'") ||
        !csp.includes("connect-src 'self' ws://localhost:*")
      ) {
        server.config.logger.warn(
          "[turnagain] the dev CSP lacks 'unsafe-inline' or ws://localhost:*; check the style-src and connect-src directives in public/_headers.",
        )
      }
      server.middlewares.use((request, response, next) => {
        response.setHeader('Content-Security-Policy', csp)
        next()
      })
    },
  }
}

// The emulator walks preview the build:emulator bundle under the
// production policy, so only connect-src widens, and only to the Auth, Firestore and Functions
// emulators that bundle talks to (the booking email line calls sendBookingEmail on the Functions
// emulator). The mode name selects this because the preview serves a bundle already built for that
// mode, unlike devCsp, which follows the loaded VITE_* variables.
const PREVIEW_EMULATOR_ORIGINS = [
  EMULATOR_PORTS.auth,
  EMULATOR_PORTS.firestore,
  EMULATOR_PORTS.functions,
]
  .map((port) => `http://${EMULATOR_HOST}:${port}`)
  .join(' ')

/**
 * Preview CSP: `npm run build && npm run preview` serves the production policy
 * of public/_headers with only `upgrade-insecure-requests` removed (preview is plain http), so
 * the map's pins, popups, origin circle and route polyline are exercised under `style-src 'self'`
 * before the site is deployed. The dev plugin above is untouched. In
 * `--mode emulator` the Auth, Firestore and Functions emulator origins are added to `connect-src`
 * and nothing else.
 */
export function previewCsp() {
  return {
    name: 'turnagain:preview-csp',
    configurePreviewServer(server) {
      const production = productionCsp()
      // This server exists to prove the map under the production policy; a preview without that
      // policy would report no violations while enforcing nothing, so neither gap stays silent.
      if (!production) {
        server.config.logger.warn(
          '[turnagain] public/_headers has no Content-Security-Policy line; the preview server sends no CSP, so the preview walk proves nothing about it.',
        )
        return
      }
      const withoutUpgrade = production.replace('; upgrade-insecure-requests', '')
      const csp =
        server.config.mode === 'emulator'
          ? withoutUpgrade.replace(
              /connect-src [^;]*/u,
              (directive) => `${directive} ${PREVIEW_EMULATOR_ORIGINS}`,
            )
          : withoutUpgrade
      if (csp.includes('upgrade-insecure-requests')) {
        server.config.logger.warn(
          '[turnagain] the preview CSP still holds upgrade-insecure-requests; check its position in public/_headers, or the plain-http preview upgrades its own requests.',
        )
      }
      server.middlewares.use((request, response, next) => {
        response.setHeader('Content-Security-Policy', csp)
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => ({
  // The devtools overlay is a dev-server feature; Vitest merges this config with mode 'test'.
  plugins: [
    vue(),
    ...(command === 'serve' && mode !== 'test' ? [vueDevTools()] : []),
    devCsp(mode),
    previewCsp(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Pure modules shared with the Cloud Functions package.
      '@shared': fileURLToPath(new URL('./functions/shared', import.meta.url)),
    },
  },
}))
