// No-op stand-in for the `server-only` marker package in the vitest (plain Node)
// environment. In a real Next.js build `server-only` throws if a server module
// is pulled into the client bundle; under test there is no bundler boundary, so
// importing it must be a harmless no-op. Aliased in vitest.config.ts.
export {}
