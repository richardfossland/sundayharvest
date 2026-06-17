// ── AI debrief — PURE response parser + sanitizer ────────────────────────────
// Coerces a raw Anthropic Messages-API response into the strict DebriefContent
// shape, or returns null if it can't be trusted. The model only SUGGESTS:
// nothing here touches app state, auth, or the DB — it just shapes text for the
// projector. PURE + unit-tested with canned fixtures.

import { DebriefContent } from './types'

const MAX_ANDAKT = 1200
const MAX_QUESTION = 400
const MAX_QUESTIONS = 3
const MIN_QUESTIONS = 2

// Shape of the (subset of the) Messages-API response we read.
interface RawMessagesResponse {
  content?: { type?: string; text?: string }[]
  stop_reason?: string
}

/** Concatenate all text blocks from a Messages-API response. */
export function extractText(raw: unknown): string {
  const r = raw as RawMessagesResponse
  if (!r || !Array.isArray(r.content)) return ''
  return r.content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('')
    .trim()
}

// Strip a leading/trailing ```json … ``` fence if the model added one anyway.
function stripFence(s: string): string {
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fence ? fence[1].trim() : s.trim()
}

// Pull the first balanced top-level JSON object out of arbitrary text.
function firstJsonObject(s: string): string | null {
  const start = s.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

function clean(s: string, max: number): string {
  // Collapse whitespace runs, trim, and hard-cap length so a runaway
  // generation can never blow up the projector layout.
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max).trim() : t
}

/**
 * Parse + validate a raw Messages-API response into DebriefContent.
 * Returns null when the output is missing, malformed, or fails the shape
 * checks — the caller then falls back to the static debrief.
 */
export function parseDebriefResponse(raw: unknown): DebriefContent | null {
  const text = stripFence(extractText(raw))
  if (!text) return null

  const jsonText = firstJsonObject(text)
  if (!jsonText) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>

  if (typeof obj.andakt !== 'string') return null
  const andakt = clean(obj.andakt, MAX_ANDAKT)
  if (!andakt) return null

  if (!Array.isArray(obj.questions)) return null
  const questions = obj.questions
    .filter((q): q is string => typeof q === 'string')
    .map((q) => clean(q, MAX_QUESTION))
    .filter((q) => q.length > 0)
    .slice(0, MAX_QUESTIONS)

  if (questions.length < MIN_QUESTIONS) return null

  return { andakt, questions }
}
