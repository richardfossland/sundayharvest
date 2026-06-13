import { describe, it, expect } from 'vitest'
import { encodeQR, EcLevel } from './qr'

// ── Structural invariants ────────────────────────────────────────────────────
function isVersionSize(n: number) {
  // size = version*4 + 17, versions 1..10 → 21..57.
  return n >= 21 && n <= 57 && (n - 17) % 4 === 0
}

function checkFinder(m: boolean[][], r: number, c: number) {
  // 7x7 finder: dark border ring + dark 3x3 centre, light ring between.
  for (let dr = 0; dr < 7; dr++) {
    for (let dc = 0; dc < 7; dc++) {
      const expected =
        dr === 0 || dr === 6 || dc === 0 || dc === 6 ||
        (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4)
      expect(m[r + dr][c + dc]).toBe(expected)
    }
  }
}

// ── Self-contained byte-mode reader (reverses the encoder for verification) ──
// We don't reverse RS/interleave; instead we re-derive which mask the encoder
// chose, undo it, then re-read the data region in the same zig-zag order the
// encoder wrote it. For a single-block version that is exactly the data
// codeword stream, so the byte-mode header + payload decode cleanly.

const MASK_FNS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
]

function readFormatMask(m: boolean[][]): { ec: number; mask: number } {
  // Read the 15 format bits along the top row by the top-left finder.
  const bits: number[] = []
  for (let i = 0; i <= 5; i++) bits.push(m[8][i] ? 1 : 0)
  bits.push(m[8][7] ? 1 : 0)
  bits.push(m[8][8] ? 1 : 0)
  bits.push(m[7][8] ? 1 : 0)
  for (let i = 9; i < 15; i++) bits.push(m[14 - i][8] ? 1 : 0)
  let val = 0
  for (const b of bits) val = (val << 1) | b
  val ^= 0b101010000010010
  const data = val >> 10
  return { ec: data >> 3, mask: data & 0b111 }
}

// Alignment-pattern centres per version (mirrors the encoder's ALIGN_POS).
const ALIGN_POS: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
}

// Mark reserved (function-pattern) cells so the data reader skips them.
function reservedMask(size: number): boolean[][] {
  const res = Array.from({ length: size }, () => new Array(size).fill(false))
  const set = (r: number, c: number) => {
    if (r >= 0 && c >= 0 && r < size && c < size) res[r][c] = true
  }
  const finder = (r: number, c: number) => {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) set(r + dr, c + dc)
  }
  finder(0, 0)
  finder(0, size - 7)
  finder(size - 7, 0)
  // Alignment patterns (5x5), skipping the finder-overlapping corners.
  const version = (size - 17) / 4
  const pos = ALIGN_POS[version] ?? []
  for (const ar of pos) {
    for (const ac of pos) {
      if ((ar <= 7 && ac <= 7) || (ar <= 7 && ac >= size - 8) || (ar >= size - 8 && ac <= 7)) continue
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(ar + dr, ac + dc)
    }
  }
  for (let i = 0; i < size; i++) {
    set(6, i)
    set(i, 6)
  }
  // Format areas.
  for (let i = 0; i <= 8; i++) {
    set(8, i)
    set(i, 8)
  }
  for (let i = 0; i < 8; i++) {
    set(8, size - 1 - i)
    set(size - 1 - i, 8)
  }
  set(size - 8, 8)
  return res
}

function decodeBytePayload(m: boolean[][]): string {
  const size = m.length
  const { mask } = readFormatMask(m)
  const maskFn = MASK_FNS[mask]
  const res = reservedMask(size)
  const bits: number[] = []
  let upward = true
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i
      for (let k = 0; k < 2; k++) {
        const c = col - k
        if (res[row][c]) continue
        const bit = (m[row][c] ? 1 : 0) ^ (maskFn(row, c) ? 1 : 0)
        bits.push(bit)
      }
    }
    upward = !upward
  }
  // Parse byte mode (mode 0100, 8-bit char count for versions 1–9).
  let p = 0
  const take = (n: number) => {
    let v = 0
    for (let i = 0; i < n; i++) v = (v << 1) | bits[p++]
    return v
  }
  const mode = take(4)
  expect(mode).toBe(0b0100)
  const len = take(8)
  const out: number[] = []
  for (let i = 0; i < len; i++) out.push(take(8))
  return new TextDecoder().decode(new Uint8Array(out))
}

describe('encodeQR', () => {
  it('produces a square matrix at a valid QR version size', () => {
    const m = encodeQR('https://harvest.sundaysuite.app/?code=WXYZ')
    expect(m.length).toBeGreaterThan(0)
    expect(isVersionSize(m.length)).toBe(true)
    for (const row of m) expect(row.length).toBe(m.length)
  })

  it('places the three finder patterns correctly', () => {
    const m = encodeQR('https://harvest.sundaysuite.app/?code=ABCD')
    const n = m.length
    checkFinder(m, 0, 0)
    checkFinder(m, 0, n - 7)
    checkFinder(m, n - 7, 0)
  })

  it('lays a correct timing pattern (alternating from the finders)', () => {
    const m = encodeQR('test')
    const n = m.length
    for (let i = 8; i < n - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0)
      expect(m[i][6]).toBe(i % 2 === 0)
    }
  })

  it('round-trips the payload through a decode of the data region (single-block versions)', () => {
    // Short payloads stay in single-block versions, so the zig-zag data stream
    // is the codeword stream — decoding recovers the exact bytes we encoded.
    for (const value of ['HELLO', 'code=WXYZ', 'https://harvest.sundaysuite.app/?code=MKQR']) {
      const m = encodeQR(value, 'L')
      expect(decodeBytePayload(m)).toBe(value)
    }
  })

  it('is deterministic for a given input + EC level', () => {
    const a = encodeQR('https://harvest.sundaysuite.app/?code=ABCD', 'M')
    const b = encodeQR('https://harvest.sundaysuite.app/?code=ABCD', 'M')
    expect(a).toEqual(b)
  })

  it('grows the version with higher error correction', () => {
    const value = 'https://harvest.sundaysuite.app/?code=ABCD'
    const levels: EcLevel[] = ['L', 'M', 'Q', 'H']
    const sizes = levels.map((ec) => encodeQR(value, ec).length)
    // Monotonic non-decreasing as EC strengthens.
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1])
  })

  it('throws on payloads too large for versions 1–10', () => {
    expect(() => encodeQR('x'.repeat(2000))).toThrow()
  })
})
