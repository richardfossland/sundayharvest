import { describe, it, expect } from 'vitest'
import { buildDebriefRequest, DEBRIEF_SYSTEM_PROMPT } from './buildPrompt'
import { parseDebriefResponse, extractText } from './parseResponse'
import { validateDebriefRequest } from './validateRequest'
import { getLlmClient } from './llm'
import { ANTHROPIC_MODEL } from './types'
import type { DebriefGameState } from './types'

const FAITHFUL_WIN: DebriefGameState = {
  outcome: 'faithful_win',
  fruitWorks: 3,
  chokedWorks: 1,
  playerCount: 7,
  judasWon: false,
  saulusConverted: true,
  rolesInPlay: ['prophet', 'disciple', 'judas', 'saulus', 'serpent'],
}

const JUDAS_WIN: DebriefGameState = {
  outcome: 'betrayer_win',
  fruitWorks: 3,
  chokedWorks: 1,
  playerCount: 8,
  judasWon: true,
  saulusConverted: false,
  rolesInPlay: ['prophet', 'judas', 'minion'],
}

// Canned Messages-API response (the only kind the parser ever sees).
function cannedResponse(text: string) {
  return { content: [{ type: 'text', text }], stop_reason: 'end_turn' }
}

describe('buildDebriefRequest (pure)', () => {
  it('targets the repo Anthropic model and a single user turn', () => {
    const req = buildDebriefRequest(FAITHFUL_WIN)
    expect(req.model).toBe(ANTHROPIC_MODEL)
    expect(req.messages).toHaveLength(1)
    expect(req.messages[0].role).toBe('user')
    expect(req.max_tokens).toBeGreaterThan(0)
  })

  it('is deterministic for the same input', () => {
    expect(buildDebriefRequest(FAITHFUL_WIN)).toEqual(buildDebriefRequest(FAITHFUL_WIN))
  })

  it('grounds the system prompt in Matt 13 and demands JSON', () => {
    expect(DEBRIEF_SYSTEM_PROMPT).toContain('Matteus 13')
    expect(DEBRIEF_SYSTEM_PROMPT.toLowerCase()).toContain('json')
  })

  it('embeds the anonymized outcome but never names/ids', () => {
    const req = buildDebriefRequest(FAITHFUL_WIN)
    const userText = req.messages[0].content
    expect(userText).toContain('Flokken')
    expect(userText).toContain('3') // fruit works
    expect(userText).toMatch(/omvendte seg/) // saulusConverted
    // Aggregate only — no place a name/uuid could leak in.
    expect(userText).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/) // uuid-ish
  })

  it('mentions Judas only when judasWon', () => {
    expect(buildDebriefRequest(JUDAS_WIN).messages[0].content).toMatch(/Judas/)
    expect(buildDebriefRequest(FAITHFUL_WIN).messages[0].content).not.toMatch(/Judas pekte|Judas til slutt/)
  })

  it('uses higher temperature + a "new questions" ask for variant=more', () => {
    const initial = buildDebriefRequest(FAITHFUL_WIN, 'initial')
    const more = buildDebriefRequest(FAITHFUL_WIN, 'more')
    expect(more.temperature).toBeGreaterThan(initial.temperature)
    expect(more.messages[0].content).toMatch(/FLERE|NYE/)
  })
})

describe('parseDebriefResponse (pure)', () => {
  it('parses a clean JSON response into the strict shape', () => {
    const out = parseDebriefResponse(
      cannedResponse(
        '{"andakt": "Vi kan ikke se hjertene.", "questions": ["Hva kostet det å snu?", "Hvem stolte du på?"]}'
      )
    )
    expect(out).not.toBeNull()
    expect(out!.andakt).toBe('Vi kan ikke se hjertene.')
    expect(out!.questions).toHaveLength(2)
  })

  it('tolerates a ```json fence and surrounding prose', () => {
    const out = parseDebriefResponse(
      cannedResponse(
        'Her er forslaget:\n```json\n{"andakt":"A","questions":["Q1","Q2","Q3"]}\n```'
      )
    )
    expect(out).not.toBeNull()
    expect(out!.questions).toHaveLength(3)
  })

  it('caps questions at 3 and drops empties', () => {
    const out = parseDebriefResponse(
      cannedResponse('{"andakt":"A","questions":["Q1","Q2","Q3","Q4","   "]}')
    )
    expect(out!.questions).toEqual(['Q1', 'Q2', 'Q3'])
  })

  it('rejects too few questions', () => {
    expect(
      parseDebriefResponse(cannedResponse('{"andakt":"A","questions":["only one"]}'))
    ).toBeNull()
  })

  it('rejects a missing/blank andakt', () => {
    expect(
      parseDebriefResponse(cannedResponse('{"andakt":"   ","questions":["Q1","Q2"]}'))
    ).toBeNull()
    expect(
      parseDebriefResponse(cannedResponse('{"questions":["Q1","Q2"]}'))
    ).toBeNull()
  })

  it('rejects non-JSON, empty, and wrong-typed payloads', () => {
    expect(parseDebriefResponse(cannedResponse('beklager, jeg kan ikke'))).toBeNull()
    expect(parseDebriefResponse(cannedResponse(''))).toBeNull()
    expect(parseDebriefResponse(cannedResponse('{"andakt":5,"questions":["Q1","Q2"]}'))).toBeNull()
    expect(parseDebriefResponse(null)).toBeNull()
    expect(parseDebriefResponse({ content: 'nope' })).toBeNull()
  })

  it('collapses whitespace and hard-caps length', () => {
    const long = 'x'.repeat(5000)
    const out = parseDebriefResponse(
      cannedResponse(`{"andakt":"  a\\n\\n  b  ","questions":["${long}","Q2"]}`)
    )
    expect(out!.andakt).toBe('a b')
    expect(out!.questions[0].length).toBeLessThanOrEqual(400)
  })

  it('extractText concatenates only text blocks', () => {
    expect(
      extractText({ content: [{ type: 'text', text: 'a' }, { type: 'thinking', text: 'x' }, { type: 'text', text: 'b' }] })
    ).toBe('ab')
  })
})

describe('validateDebriefRequest (pure)', () => {
  it('passes a well-formed body through, stripping unknown fields', () => {
    const out = validateDebriefRequest({
      game: {
        outcome: 'faithful_win',
        fruitWorks: 3,
        chokedWorks: 2,
        playerCount: 7,
        judasWon: false,
        saulusConverted: true,
        rolesInPlay: ['prophet', 'judas'],
        names: ['Ola', 'Kari'], // must NOT survive
      },
      variant: 'more',
    })
    expect(out).not.toBeNull()
    expect(out!.variant).toBe('more')
    expect(out!.game).not.toHaveProperty('names')
    expect(out!.game.rolesInPlay).toEqual(['prophet', 'judas'])
  })

  it('clamps out-of-range counts and drops bogus roles', () => {
    const out = validateDebriefRequest({
      game: {
        outcome: 'betrayer_win',
        fruitWorks: 99,
        chokedWorks: -3,
        playerCount: 999,
        rolesInPlay: ['prophet', 'not_a_role', 42],
      },
    })
    expect(out!.game.fruitWorks).toBe(5)
    expect(out!.game.chokedWorks).toBe(0)
    expect(out!.game.playerCount).toBe(10)
    expect(out!.game.rolesInPlay).toEqual(['prophet'])
    expect(out!.variant).toBe('initial')
  })

  it('rejects missing/invalid outcome and non-objects', () => {
    expect(validateDebriefRequest({ game: { outcome: 'nope' } })).toBeNull()
    expect(validateDebriefRequest({ game: {} })).toBeNull()
    expect(validateDebriefRequest({})).toBeNull()
    expect(validateDebriefRequest(null)).toBeNull()
    expect(validateDebriefRequest('x')).toBeNull()
  })
})

describe('getLlmClient (seam)', () => {
  it('returns null without a key (keyless fallback)', () => {
    expect(getLlmClient(undefined)).toBeNull()
    expect(getLlmClient({})).toBeNull()
    expect(getLlmClient({ ANTHROPIC_API_KEY: '   ' })).toBeNull()
  })

  it('returns a client when a key is present', () => {
    expect(getLlmClient({ ANTHROPIC_API_KEY: 'sk-test' })).not.toBeNull()
  })
})
