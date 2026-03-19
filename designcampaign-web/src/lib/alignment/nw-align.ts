/**
 * Needleman-Wunsch global alignment with affine gap penalties (BLOSUM62).
 * Produces a star (centre-star) multiple alignment — O(N) pairwise calls,
 * suitable for 5–500 sequences of length ≤300 (antibody VH/VL).
 */

// ── Scoring parameters ────────────────────────────────────────────────────────

const GAP_OPEN   = -10
const GAP_EXTEND = -0.5

// BLOSUM62 half-matrix. Keys are always sorted: smaller ASCII char first.
const B62: Record<string, number> = {
  AA:  4, AR: -1, AN: -2, AD: -2, AC:  0, AQ: -1, AE: -1, AG:  0, AH: -2,
  AI: -1, AL: -1, AK: -1, AM: -1, AF: -2, AP: -1, AS:  1, AT:  0, AW: -3,
  AY: -2, AV:  0,
  RR:  5, RN:  0, RD: -2, RC: -3, RQ:  1, RE:  0, RG: -2, RH:  0, RI: -3,
  RL: -2, RK:  2, RM: -1, RF: -3, RP: -2, RS: -1, RT: -1, RW: -3, RY: -2,
  RV: -3,
  NN:  6, ND:  1, NC: -3, NQ:  0, NE:  0, NG:  0, NH:  1, NI: -3, NL: -3,
  NK:  0, NM: -2, NF: -3, NP: -2, NS:  1, NT:  0, NW: -4, NY: -2, NV: -3,
  DD:  6, DC: -3, DQ:  0, DE:  2, DG: -1, DH: -1, DI: -3, DL: -4, DK: -1,
  DM: -3, DF: -3, DP: -1, DS:  0, DT: -1, DW: -4, DY: -3, DV: -3,
  CC:  9, CQ: -3, CE: -4, CG: -3, CH: -3, CI: -1, CL: -1, CK: -3, CM: -1,
  CF: -2, CP: -3, CS: -1, CT: -1, CW: -2, CY: -2, CV: -1,
  QQ:  5, QE:  2, QG: -2, QH:  0, QI: -3, QL: -2, QK:  1, QM:  0, QF: -3,
  QP: -1, QS:  0, QT: -1, QW: -2, QY: -1, QV: -2,
  EE:  5, EG: -2, EH:  0, EI: -3, EL: -3, EK:  1, EM: -2, EF: -3, EP: -1,
  ES:  0, ET: -1, EW: -3, EY: -2, EV: -2,
  GG:  6, GH: -2, GI: -4, GL: -4, GK: -2, GM: -3, GF: -3, GP: -2, GS:  0,
  GT: -2, GW: -2, GY: -3, GV: -3,
  HH:  8, HI: -3, HL: -3, HK: -1, HM: -2, HF: -1, HP: -2, HS: -1, HT: -2,
  HW: -2, HY:  2, HV: -3,
  II:  4, IL:  2, IK: -1, IM:  1, IF:  0, IP: -3, IS: -2, IT: -1, IW: -3,
  IY: -1, IV:  3,
  LL:  4, LK: -2, LM:  2, LF:  0, LP: -3, LS: -2, LT: -1, LW: -2, LY: -1,
  LV:  1,
  KK:  5, KM: -1, KF: -3, KP: -1, KS:  0, KT: -1, KW: -3, KY: -2, KV: -2,
  MM:  5, MF:  0, MP: -2, MS: -1, MT: -1, MW: -1, MY: -1, MV:  1,
  FF:  6, FP: -4, FS: -2, FT: -2, FW:  1, FY:  3, FV: -1,
  PP:  7, PS: -1, PT: -1, PW: -4, PY: -3, PV: -2,
  SS:  4, ST:  1, SW: -3, SY: -2, SV: -2,
  TT:  5, TW: -2, TY: -2, TV:  0,
  WW: 11, WY:  2, WV: -3,
  YY:  7, YV: -1,
  VV:  4,
}

function sub(a: string, b: string): number {
  const key = a <= b ? a + b : b + a
  return B62[key] ?? -1
}

// ── Pairwise Needleman-Wunsch (affine gaps) ───────────────────────────────────

export interface PairAlignment {
  aligned_a: string
  aligned_b: string
  score: number
}

export function nwAlign(seqA: string, seqB: string): PairAlignment {
  const m = seqA.length
  const n = seqB.length
  const NEG = -1e9

  // Three DP tables: match/mismatch | gap in A (insertion in B) | gap in B (deletion in B)
  const M  = Array.from({ length: m + 1 }, () => new Float32Array(n + 1).fill(NEG))
  const GA = Array.from({ length: m + 1 }, () => new Float32Array(n + 1).fill(NEG))
  const GB = Array.from({ length: m + 1 }, () => new Float32Array(n + 1).fill(NEG))

  M[0][0] = 0
  for (let i = 1; i <= m; i++) { GB[i][0] = GAP_OPEN + (i - 1) * GAP_EXTEND; M[i][0] = GB[i][0] }
  for (let j = 1; j <= n; j++) { GA[0][j] = GAP_OPEN + (j - 1) * GAP_EXTEND; M[0][j] = GA[0][j] }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      GA[i][j] = Math.max(M[i][j - 1] + GAP_OPEN, GA[i][j - 1] + GAP_EXTEND)
      GB[i][j] = Math.max(M[i - 1][j] + GAP_OPEN, GB[i - 1][j] + GAP_EXTEND)
      M[i][j]  = Math.max(
        M[i - 1][j - 1] + sub(seqA[i - 1], seqB[j - 1]),
        GA[i][j],
        GB[i][j],
      )
    }
  }

  // Traceback
  let i = m, j = n, a = '', b = ''
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const matchScore = M[i - 1][j - 1] + sub(seqA[i - 1], seqB[j - 1])
      if (Math.abs(M[i][j] - matchScore) < 0.001) {
        a = seqA[i - 1] + a; b = seqB[j - 1] + b; i--; j--; continue
      }
    }
    if (j > 0 && Math.abs(M[i][j] - GA[i][j]) < 0.001) {
      a = '-' + a; b = seqB[j - 1] + b; j--; continue
    }
    a = seqA[i - 1] + a; b = '-' + b; i--
  }

  return { aligned_a: a, aligned_b: b, score: M[m][n] }
}

// ── Star multiple alignment ───────────────────────────────────────────────────

/**
 * Align `seqs` against the longest sequence (centre star).
 * Returns aligned sequences all of equal length, gaps encoded as '-'.
 */
export function starAlign(seqs: string[]): string[] {
  if (seqs.length === 0) return []
  if (seqs.length === 1) return [...seqs]

  // Centre = longest sequence (typically the most complete)
  const cIdx = seqs.reduce((best, s, i) => s.length > seqs[best].length ? i : best, 0)
  const centre = seqs[cIdx]
  const N = centre.length

  // Pairwise alignments: centre (a) vs each seq (b)
  const pw = seqs.map((s, i) => {
    if (i === cIdx) return { ra: centre, sa: s }
    const { aligned_a, aligned_b } = nwAlign(centre, s)
    return { ra: aligned_a, sa: aligned_b }
  })

  // ins[k] = max insertions (gaps in centre) BEFORE centre position k
  // ins[N] = max insertions after the last centre position
  const ins = new Array<number>(N + 1).fill(0)
  for (const { ra } of pw) {
    let refPos = 0
    let run = 0
    for (const ch of ra) {
      if (ch === '-') { run++ } else {
        ins[refPos] = Math.max(ins[refPos], run)
        run = 0; refPos++
      }
    }
    ins[N] = Math.max(ins[N], run)
  }

  // Build final aligned sequences
  return seqs.map((_, idx) => {
    const { ra, sa } = pw[idx]
    let result = ''
    let pairPos = 0
    const pLen = ra.length

    for (let k = 0; k <= N; k++) {
      // Consume insertions (gaps in ra) at this boundary
      let thisIns = 0
      while (pairPos < pLen && ra[pairPos] === '-') {
        result += sa[pairPos]; pairPos++; thisIns++
      }
      // Pad to the maximum insertions seen at this boundary
      for (let g = thisIns; g < ins[k]; g++) result += '-'

      // Consume the centre-position residue (if not past the end)
      if (k < N) {
        result += pairPos < pLen ? sa[pairPos] : '-'
        pairPos++
      }
    }

    return result
  })
}
