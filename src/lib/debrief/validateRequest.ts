// ── AI debrief — PURE request validator ──────────────────────────────────────
// Coerces an untrusted POST body into a safe DebriefGameState before it reaches
// the prompt builder. Defends against the client sending names/ids/garbage:
// only the whitelisted aggregate fields survive. PURE + unit-tested.

import { RoleId } from '@/types/game'
import { BETRAYER_ROLES } from '@/lib/config'
import { MIN_PLAYERS, MAX_PLAYERS } from '@/lib/config'
import { DebriefGameState, DebriefRequest } from './types'

const VALID_ROLES: RoleId[] = [
  'disciple',
  'prophet',
  'shepherd',
  'barnabas',
  ...BETRAYER_ROLES,
]

function clampInt(v: unknown, lo: number, hi: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 0
  return Math.min(hi, Math.max(lo, n))
}

/**
 * Validate + sanitize an untrusted request body. Returns null when the body
 * isn't a usable game state (route then answers available:false / 400).
 */
export function validateDebriefRequest(body: unknown): DebriefRequest | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>

  const g = b.game
  if (!g || typeof g !== 'object') return null
  const gg = g as Record<string, unknown>

  const outcome =
    gg.outcome === 'faithful_win' || gg.outcome === 'betrayer_win'
      ? gg.outcome
      : null
  if (!outcome) return null

  const playerCount = clampInt(gg.playerCount, MIN_PLAYERS, MAX_PLAYERS)
  const fruitWorks = clampInt(gg.fruitWorks, 0, 5)
  const chokedWorks = clampInt(gg.chokedWorks, 0, 5)

  const rolesInPlay = Array.isArray(gg.rolesInPlay)
    ? Array.from(
        new Set(
          (gg.rolesInPlay as unknown[]).filter((r): r is RoleId =>
            VALID_ROLES.includes(r as RoleId)
          )
        )
      )
    : []

  const game: DebriefGameState = {
    outcome,
    playerCount,
    fruitWorks,
    chokedWorks,
    judasWon: gg.judasWon === true,
    saulusConverted: gg.saulusConverted === true,
    rolesInPlay,
  }

  const variant = b.variant === 'more' ? 'more' : 'initial'
  return { game, variant }
}
