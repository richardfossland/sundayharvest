import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Unit tests for the PURE AI-debrief helpers (prompt builder, response parser,
// request validator) + the host-SSO authz/owner logic. No network, no key, no
// DB — runs in the local gate.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` is a build-time marker (throws if a server module reaches
      // the client bundle). There's no bundler boundary under vitest, so alias
      // it to a harmless no-op so server modules can be unit-tested directly.
      'server-only': fileURLToPath(new URL('./test/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
