// ── AI debrief facilitator — shared types ────────────────────────────────────
// After the final reveal the host can ask Claude for fresh, age-appropriate
// discussion questions + a short andakt grounded in Matt 13:24-30. The model
// only SUGGESTS: the server validates/sanitizes its output against the strict
// shape below before it reaches the projector. Keyless → the static EndScreen
// debrief stays as fallback (no regression).

import { RoleId } from '@/types/game'

// Anthropic model id. If the repo ever introduces a shared Anthropic constant,
// align this with it; today this is the single source of truth.
export const ANTHROPIC_MODEL = 'claude-opus-4-8'
export const ANTHROPIC_VERSION = '2023-06-01'
export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'

// Strict output shape. Anything Claude returns is coerced into THIS or rejected.
export interface DebriefContent {
  andakt: string // short reflection paragraph(s), Norwegian
  questions: string[] // 2-3 discussion questions, Norwegian
}

// Anonymized, theme-stripped snapshot of one finished game. NO names, NO ids,
// NO per-player secrets — only aggregate outcome facts safe to send off-box.
export interface DebriefGameState {
  outcome: 'faithful_win' | 'betrayer_win'
  fruitWorks: number // works that bore fruit (faithful progress)
  chokedWorks: number // works that withered (betrayer progress)
  playerCount: number
  judasWon: boolean // betrayer win where Judas correctly identified the Prophet
  saulusConverted: boolean // a Saulus-role player switched to faithful mid-game
  rolesInPlay: RoleId[] // which role archetypes were dealt (no seat/name mapping)
}

// Request payload accepted by POST /api/debrief.
export interface DebriefRequest {
  game: DebriefGameState
  // "more" → ask for a fresh set distinct from any already shown.
  variant?: 'initial' | 'more'
}

// Response envelope from POST /api/debrief. `available:false` means no key was
// configured (or upstream failed) — the client keeps the static fallback.
export type DebriefResponse =
  | { available: true; content: DebriefContent }
  | { available: false; reason: 'no_key' | 'upstream_error' | 'invalid' }

// Minimal Messages-API request body (only the fields we send).
export interface AnthropicMessagesRequest {
  model: string
  max_tokens: number
  temperature: number
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
}
