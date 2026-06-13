// ── Tiny dependency-free QR Code encoder (Model 2, byte mode) ────────────────
// SundayHarvest only ever encodes short join URLs (a few dozen ASCII chars), so
// we implement a compact, self-contained encoder rather than pulling in a heavy
// dependency. It picks the smallest version (1–10) that fits at the requested
// error-correction level and returns a square matrix of booleans (true = dark
// module) which the <QRCode> component renders as an SVG.
//
// Reference: ISO/IEC 18004. Tested in qr.test.ts against the spec's worked
// "HELLO WORLD"/byte examples and structural invariants.

export type EcLevel = 'L' | 'M' | 'Q' | 'H'

// ── Galois field GF(256) tables for Reed–Solomon (generator 0x11d) ──────────
const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
;(() => {
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
})()

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return EXP[LOG[a] + LOG[b]]
}

function rsGeneratorPoly(degree: number): number[] {
  let poly = [1]
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]
      next[j + 1] ^= gfMul(poly[j], EXP[i])
    }
    poly = next
  }
  return poly
}

function rsEncode(data: number[], ecLen: number): number[] {
  const gen = rsGeneratorPoly(ecLen)
  const res = new Array(ecLen).fill(0)
  for (const d of data) {
    const factor = d ^ res[0]
    res.shift()
    res.push(0)
    for (let j = 0; j < ecLen; j++) res[j] ^= gfMul(gen[j + 1], factor)
  }
  return res
}

// ── Capacity tables (versions 1–10), byte-mode data codewords + EC structure ─
// [ecCodewordsPerBlock, numBlocksGroup1, dataCwGroup1, numBlocksGroup2, dataCwGroup2]
type Block = [number, number, number, number, number]
const EC_BLOCKS: Record<EcLevel, Record<number, Block>> = {
  L: {
    1: [7, 1, 19, 0, 0], 2: [10, 1, 34, 0, 0], 3: [15, 1, 55, 0, 0],
    4: [20, 1, 80, 0, 0], 5: [26, 1, 108, 0, 0], 6: [18, 2, 68, 0, 0],
    7: [20, 2, 78, 0, 0], 8: [24, 2, 97, 0, 0], 9: [30, 2, 116, 0, 0],
    10: [18, 2, 68, 2, 69],
  },
  M: {
    1: [10, 1, 16, 0, 0], 2: [16, 1, 28, 0, 0], 3: [26, 1, 44, 0, 0],
    4: [18, 2, 32, 0, 0], 5: [24, 2, 43, 0, 0], 6: [16, 4, 27, 0, 0],
    7: [18, 4, 31, 0, 0], 8: [22, 2, 38, 2, 39], 9: [22, 3, 36, 2, 37],
    10: [26, 4, 43, 1, 44],
  },
  Q: {
    1: [13, 1, 13, 0, 0], 2: [22, 1, 22, 0, 0], 3: [18, 2, 17, 0, 0],
    4: [26, 2, 24, 0, 0], 5: [18, 2, 15, 2, 16], 6: [24, 4, 19, 0, 0],
    7: [18, 2, 14, 4, 15], 8: [22, 4, 18, 2, 19], 9: [20, 4, 16, 4, 17],
    10: [24, 6, 19, 2, 20],
  },
  H: {
    1: [17, 1, 9, 0, 0], 2: [28, 1, 16, 0, 0], 3: [22, 2, 13, 0, 0],
    4: [16, 4, 9, 0, 0], 5: [22, 2, 11, 2, 12], 6: [28, 4, 15, 0, 0],
    7: [26, 4, 13, 1, 14], 8: [26, 4, 14, 2, 15], 9: [24, 4, 12, 4, 13],
    10: [28, 6, 15, 2, 16],
  },
}

function totalDataCodewords(version: number, ec: EcLevel): number {
  const [, n1, d1, n2, d2] = EC_BLOCKS[ec][version]
  return n1 * d1 + n2 * d2
}

// Alignment-pattern centre coordinates per version (none for v1).
const ALIGN_POS: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
}

const sizeForVersion = (v: number) => v * 4 + 17

// ── Bit stream helper ───────────────────────────────────────────────────────
class BitBuffer {
  bits: number[] = []
  put(value: number, length: number) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1)
  }
  get length() {
    return this.bits.length
  }
}

function charCountBits(version: number): number {
  // Byte mode: 8 bits for versions 1–9, 16 bits for 10–26.
  return version <= 9 ? 8 : 16
}

function utf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text))
}

function chooseVersion(byteLen: number, ec: EcLevel): number {
  for (let v = 1; v <= 10; v++) {
    const cap = totalDataCodewords(v, ec)
    const headerBits = 4 + charCountBits(v)
    const needed = Math.ceil((headerBits + byteLen * 8) / 8)
    if (needed <= cap) return v
  }
  throw new Error('QR payload too large for versions 1–10')
}

// ── Format information (EC level + mask), 15 bits with BCH ──────────────────
const FORMAT_EC_BITS: Record<EcLevel, number> = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 }
function formatBits(ec: EcLevel, mask: number): number[] {
  const data = (FORMAT_EC_BITS[ec] << 3) | mask
  let rem = data << 10
  const g = 0b10100110111
  for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= g << (i - 10)
  const bits = ((data << 10) | rem) ^ 0b101010000010010
  const out: number[] = []
  for (let i = 14; i >= 0; i--) out.push((bits >> i) & 1)
  return out
}

// ── Matrix construction ─────────────────────────────────────────────────────
type Cell = { dark: boolean; reserved: boolean }

function emptyMatrix(size: number): Cell[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ dark: false, reserved: false })),
  )
}

function placeFinder(m: Cell[][], r: number, c: number) {
  for (let dr = -1; dr <= 7; dr++) {
    for (let dc = -1; dc <= 7; dc++) {
      const rr = r + dr
      const cc = c + dc
      if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue
      const inFinder =
        dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 &&
        (dr === 0 || dr === 6 || dc === 0 || dc === 6 ||
          (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4))
      m[rr][cc] = { dark: inFinder, reserved: true }
    }
  }
}

function placeAlignment(m: Cell[][], version: number) {
  const pos = ALIGN_POS[version]
  for (const r of pos) {
    for (const c of pos) {
      // Skip the three corners overlapping finder patterns.
      if ((r <= 7 && c <= 7) || (r <= 7 && c >= m.length - 8) || (r >= m.length - 8 && c <= 7)) continue
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1
          m[r + dr][c + dc] = { dark, reserved: true }
        }
      }
    }
  }
}

function placeTiming(m: Cell[][]) {
  for (let i = 8; i < m.length - 8; i++) {
    const dark = i % 2 === 0
    if (!m[6][i].reserved) m[6][i] = { dark, reserved: true }
    if (!m[i][6].reserved) m[i][6] = { dark, reserved: true }
  }
}

function reserveFormat(m: Cell[][]) {
  const n = m.length
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      m[8][i].reserved = true
      m[i][8].reserved = true
    }
  }
  for (let i = 0; i < 8; i++) {
    m[8][n - 1 - i].reserved = true
    m[n - 1 - i][8].reserved = true
  }
  // Dark module (always set, always reserved).
  m[n - 8][8] = { dark: true, reserved: true }
}

function placeFormat(m: Cell[][], bits: number[]) {
  const n = m.length
  // Around top-left finder.
  for (let i = 0; i <= 5; i++) m[8][i].dark = bits[i] === 1
  m[8][7].dark = bits[6] === 1
  m[8][8].dark = bits[7] === 1
  m[7][8].dark = bits[8] === 1
  for (let i = 9; i < 15; i++) m[14 - i][8].dark = bits[i] === 1
  // Around the other two finders.
  for (let i = 0; i < 8; i++) m[n - 1 - i][8].dark = bits[i] === 1
  for (let i = 8; i < 15; i++) m[8][n - 15 + i].dark = bits[i] === 1
}

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

function placeData(m: Cell[][], data: number[]) {
  const n = m.length
  let bitIdx = 0
  let upward = true
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col-- // skip vertical timing column
    for (let i = 0; i < n; i++) {
      const row = upward ? n - 1 - i : i
      for (let k = 0; k < 2; k++) {
        const c = col - k
        if (m[row][c].reserved) continue
        const byte = data[bitIdx >> 3] ?? 0
        const bit = (byte >> (7 - (bitIdx & 7))) & 1
        m[row][c].dark = bit === 1
        bitIdx++
      }
    }
    upward = !upward
  }
}

function applyMask(m: Cell[][], maskFn: (r: number, c: number) => boolean): Cell[][] {
  const out = m.map((row) => row.map((cell) => ({ ...cell })))
  for (let r = 0; r < out.length; r++) {
    for (let c = 0; c < out.length; c++) {
      if (!out[r][c].reserved && maskFn(r, c)) out[r][c].dark = !out[r][c].dark
    }
  }
  return out
}

// ── Penalty scoring to pick the best mask (ISO 18004 §8.8.2) ────────────────
function penalty(m: Cell[][]): number {
  const n = m.length
  const d = (r: number, c: number) => m[r][c].dark
  let score = 0
  // Rule 1: runs of 5+ same-colour in row/column.
  for (let r = 0; r < n; r++) {
    let runC = 1, runR = 1
    for (let c = 1; c < n; c++) {
      runC = d(r, c) === d(r, c - 1) ? runC + 1 : 1
      if (runC === 5) score += 3
      else if (runC > 5) score += 1
      runR = d(c, r) === d(c - 1, r) ? runR + 1 : 1
      if (runR === 5) score += 3
      else if (runR > 5) score += 1
    }
  }
  // Rule 2: 2x2 blocks of same colour.
  for (let r = 0; r < n - 1; r++)
    for (let c = 0; c < n - 1; c++)
      if (d(r, c) === d(r, c + 1) && d(r, c) === d(r + 1, c) && d(r, c) === d(r + 1, c + 1)) score += 3
  // Rule 3: finder-like 1:1:3:1:1 patterns.
  const pat1 = [true, false, true, true, true, false, true, false, false, false, false]
  const pat2 = [false, false, false, false, true, false, true, true, true, false, true]
  const matches = (arr: boolean[], pat: boolean[], start: number) =>
    pat.every((p, i) => arr[start + i] === p)
  for (let r = 0; r < n; r++) {
    for (let c = 0; c <= n - 11; c++) {
      const rowArr = Array.from({ length: 11 }, (_, k) => d(r, c + k))
      if (matches(rowArr, pat1, 0) || matches(rowArr, pat2, 0)) score += 40
      const colArr = Array.from({ length: 11 }, (_, k) => d(c + k, r))
      if (matches(colArr, pat1, 0) || matches(colArr, pat2, 0)) score += 40
    }
  }
  // Rule 4: dark-module ratio deviation from 50%.
  let dark = 0
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (d(r, c)) dark++
  const ratio = (dark * 100) / (n * n)
  score += Math.floor(Math.abs(ratio - 50) / 5) * 10
  return score
}

function buildCodewords(text: string, version: number, ec: EcLevel): number[] {
  const bytes = utf8Bytes(text)
  const bb = new BitBuffer()
  bb.put(0b0100, 4) // byte mode
  bb.put(bytes.length, charCountBits(version))
  for (const b of bytes) bb.put(b, 8)

  const capBits = totalDataCodewords(version, ec) * 8
  const terminator = Math.min(4, capBits - bb.length)
  bb.put(0, terminator)
  while (bb.length % 8 !== 0) bb.bits.push(0)

  const dataCw: number[] = []
  for (let i = 0; i < bb.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bb.bits[i + j]
    dataCw.push(byte)
  }
  const pad = [0xec, 0x11]
  let pi = 0
  while (dataCw.length < totalDataCodewords(version, ec)) dataCw.push(pad[pi++ % 2])

  // Split into blocks, compute EC per block, then interleave.
  const [ecLen, n1, d1, n2, d2] = EC_BLOCKS[ec][version]
  const blocks: { data: number[]; ec: number[] }[] = []
  let offset = 0
  for (let i = 0; i < n1; i++) {
    const data = dataCw.slice(offset, offset + d1)
    offset += d1
    blocks.push({ data, ec: rsEncode(data, ecLen) })
  }
  for (let i = 0; i < n2; i++) {
    const data = dataCw.slice(offset, offset + d2)
    offset += d2
    blocks.push({ data, ec: rsEncode(data, ecLen) })
  }

  const result: number[] = []
  const maxData = Math.max(d1, d2)
  for (let i = 0; i < maxData; i++)
    for (const b of blocks) if (i < b.data.length) result.push(b.data[i])
  for (let i = 0; i < ecLen; i++) for (const b of blocks) result.push(b.ec[i])
  return result
}

/**
 * Encode `text` as a QR matrix. Returns a square array of booleans
 * (true = dark module). Chooses the smallest fitting version (1–10) at the
 * given error-correction level and the best mask by penalty score.
 */
export function encodeQR(text: string, ec: EcLevel = 'M'): boolean[][] {
  const byteLen = utf8Bytes(text).length
  const version = chooseVersion(byteLen, ec)
  const codewords = buildCodewords(text, version, ec)
  const size = sizeForVersion(version)

  const base = emptyMatrix(size)
  placeFinder(base, 0, 0)
  placeFinder(base, 0, size - 7)
  placeFinder(base, size - 7, 0)
  placeAlignment(base, version)
  placeTiming(base)
  reserveFormat(base)
  placeData(base, codewords)

  let best: Cell[][] | null = null
  let bestMask = 0
  let bestScore = Infinity
  for (let mask = 0; mask < 8; mask++) {
    const masked = applyMask(base, MASK_FNS[mask])
    placeFormat(masked, formatBits(ec, mask))
    const score = penalty(masked)
    if (score < bestScore) {
      bestScore = score
      best = masked
      bestMask = mask
    }
  }
  if (!best) throw new Error('QR mask selection failed')
  void bestMask
  return best.map((row) => row.map((cell) => cell.dark))
}
