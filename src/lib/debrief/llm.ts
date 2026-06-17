// ── AI debrief — LLM seam (server-only) ──────────────────────────────────────
// getLlmClient(env) returns null when no ANTHROPIC_API_KEY is configured, so
// every caller degrades to the static debrief without crashing. The key lives
// ONLY in the Worker env (Cloudflare secret) / server env — never in a client
// bundle. This module must never be imported from a 'use client' file.

import {
  AnthropicMessagesRequest,
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_VERSION,
} from './types'

export interface DebriefEnv {
  ANTHROPIC_API_KEY?: string
}

export interface LlmClient {
  // Sends a Messages request; returns the raw parsed JSON response (untrusted),
  // or null on any network/HTTP failure. Callers sanitize with parseResponse.
  send(req: AnthropicMessagesRequest): Promise<unknown | null>
}

/**
 * Build an LLM client from the server env, or null when no key is present.
 * Mirrors the "getLlmClient(env) → null without key" seam pattern.
 */
export function getLlmClient(env: DebriefEnv | undefined): LlmClient | null {
  const key = env?.ANTHROPIC_API_KEY?.trim()
  if (!key) return null

  return {
    async send(req) {
      try {
        const res = await fetch(ANTHROPIC_MESSAGES_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': key,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          body: JSON.stringify(req),
        })
        if (!res.ok) return null
        return await res.json()
      } catch {
        return null
      }
    },
  }
}
