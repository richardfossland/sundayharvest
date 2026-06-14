import { describe, it, expect } from 'vitest'
import { STATIC_DEBRIEFS, pickStaticDebrief } from './staticBank'

describe('static debrief bank', () => {
  it('has several variants with unique ids', () => {
    expect(STATIC_DEBRIEFS.length).toBeGreaterThanOrEqual(5)
    const ids = STATIC_DEBRIEFS.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every entry is well-formed', () => {
    for (const e of STATIC_DEBRIEFS) {
      expect(e.title.trim().length).toBeGreaterThan(0)
      expect(e.paragraphs.length).toBeGreaterThanOrEqual(1)
      expect(e.paragraphs.every((p) => p.trim().length > 0)).toBe(true)
      expect(e.questions.length).toBeGreaterThanOrEqual(2)
      expect(e.questions.every((q) => q.trim().length > 0)).toBe(true)
      expect(e.verse.trim().length).toBeGreaterThan(0)
    }
  })

  it('pickStaticDebrief is deterministic for the same seed', () => {
    const a = pickStaticDebrief('11111111-2222-3333-4444-555555555555')
    const b = pickStaticDebrief('11111111-2222-3333-4444-555555555555')
    expect(a.id).toBe(b.id)
  })

  it('always returns an entry from the bank', () => {
    for (const seed of ['a', 'session-xyz', '00000000-0000-0000-0000-000000000000', '']) {
      const e = pickStaticDebrief(seed)
      expect(STATIC_DEBRIEFS).toContain(e)
    }
  })
})
