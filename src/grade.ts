// Scoring taps against expected onsets. Pure logic, no DOM.
//
// Each expected note earns up to 1 point: full credit within PERFECT seconds,
// falling linearly to 0 at WINDOW. Unmatched notes earn 0, and every extra tap
// costs EXTRA_PENALTY. Taps are paired with notes by the alignment that
// maximises the total, so one early tap can't shift every later pairing.
// Score = 100 × points / notes, clamped to 0–100.

export const PERFECT = 0.035
export const WINDOW = 0.15
export const EXTRA_PENALTY = 0.5

export const credit = (err: number) => {
  const a = Math.abs(err)
  if (a <= PERFECT) return 1
  if (a >= WINDOW) return 0
  return 1 - (a - PERFECT) / (WINDOW - PERFECT)
}

export interface Grade {
  score: number
  /** Per expected onset: signed error in seconds (+ = late), or null if missed. */
  errors: (number | null)[]
  /** Times of taps that matched no note. */
  extras: number[]
  hits: number
  /** Mean signed error of the matched taps, in seconds. */
  offset: number | null
}

const MISS = 0, EXTRA = 1, MATCH = 2

export function grade(expected: number[], allTaps: number[]): Grade {
  const n = expected.length
  // Taps well outside the performance (count-in, after the end) don't count.
  const lo = (expected[0] ?? 0) - WINDOW
  const hi = (expected[n - 1] ?? 0) + WINDOW
  const taps = allTaps.filter((t) => t >= lo && t <= hi).sort((a, b) => a - b)
  const m = taps.length
  const w = m + 1
  const best = new Float64Array((n + 1) * w)
  const move = new Uint8Array((n + 1) * w)

  for (let j = 1; j <= m; j++) {
    best[j] = best[j - 1] - EXTRA_PENALTY
    move[j] = EXTRA
  }
  for (let i = 1; i <= n; i++) {
    best[i * w] = best[(i - 1) * w]
    move[i * w] = MISS
    for (let j = 1; j <= m; j++) {
      let v = best[(i - 1) * w + j]
      let k = MISS
      const extra = best[i * w + j - 1] - EXTRA_PENALTY
      if (extra > v) { v = extra; k = EXTRA }
      const err = taps[j - 1] - expected[i - 1]
      if (Math.abs(err) < WINDOW) {
        const match = best[(i - 1) * w + j - 1] + credit(err)
        if (match >= v) { v = match; k = MATCH }
      }
      best[i * w + j] = v
      move[i * w + j] = k
    }
  }

  const errors: (number | null)[] = Array(n).fill(null)
  const extras: number[] = []
  let points = 0
  for (let i = n, j = m; i > 0 || j > 0;) {
    const k = i === 0 ? EXTRA : move[i * w + j]
    if (k === MATCH) {
      errors[i - 1] = taps[j - 1] - expected[i - 1]
      points += credit(errors[i - 1]!)
      i--
      j--
    } else if (k === EXTRA) {
      extras.push(taps[j - 1])
      j--
    } else i--
  }
  extras.reverse()

  const matched = errors.filter((e): e is number => e !== null)
  const raw = n ? (points - EXTRA_PENALTY * extras.length) / n : 0
  return {
    score: Math.round(Math.min(1, Math.max(0, raw)) * 100),
    errors,
    extras,
    hits: matched.length,
    offset: matched.length ? matched.reduce((s, e) => s + e, 0) / matched.length : null,
  }
}
