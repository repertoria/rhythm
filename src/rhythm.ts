// Rhythm model. Pure logic, no DOM — runnable under `node --test`.
//
// Durations are integer ticks, 48 per whole note, so sixteenths (3) and
// triplet eighths (4) are both whole numbers and bar arithmetic stays exact.

export const WHOLE = 48
export const QUARTER = 12

export interface Note {
  dur: number
  rest: boolean
}

export interface Measure {
  id: string
  num: number
  den: number
  /** Total plays of this measure, 1 = no repeat. */
  repeat: number
  notes: Note[]
}

export interface Pattern {
  id: string
  name: string
  /** Quarter notes per minute. */
  bpm: number
  measures: Measure[]
}

export interface NoteValue {
  dur: number
  base: 1 | 2 | 4 | 8 | 16
  dotted?: boolean
  triplet?: boolean
}

export const VALUES: NoteValue[] = [
  { dur: 48, base: 1 },
  { dur: 36, base: 2, dotted: true },
  { dur: 24, base: 2 },
  { dur: 18, base: 4, dotted: true },
  { dur: 12, base: 4 },
  { dur: 9, base: 8, dotted: true },
  { dur: 6, base: 8 },
  { dur: 4, base: 8, triplet: true },
  { dur: 3, base: 16 },
]

export const valueOf = (dur: number): NoteValue => VALUES.find((v) => v.dur === dur) ?? VALUES[4]

export const DENOMINATORS = [2, 4, 8, 16]
export const MIN_BPM = 20
export const MAX_BPM = 400

export const uid = () => Math.random().toString(36).slice(2, 10)
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// ---- Measures ----------------------------------------------------------------

export const capacity = (m: Pick<Measure, 'num' | 'den'>) => (m.num * WHOLE) / m.den
export const used = (m: Measure) => m.notes.reduce((s, n) => s + n.dur, 0)
export const remaining = (m: Measure) => capacity(m) - used(m)
export const isFull = (m: Measure) => remaining(m) === 0

/** Triplets are entered as a group of three, so a bar can always be filled exactly. */
export const groupSize = (v: NoteValue) => (v.triplet ? 3 : 1)
export const fits = (m: Measure, v: NoteValue) => v.dur * groupSize(v) <= remaining(m)

export function addNote(m: Measure, v: NoteValue, rest: boolean): boolean {
  if (!fits(m, v)) return false
  for (let i = 0; i < groupSize(v); i++) m.notes.push({ dur: v.dur, rest })
  return true
}

export function removeLast(m: Measure) {
  const last = m.notes[m.notes.length - 1]
  if (last) m.notes.splice(-groupSize(valueOf(last.dur)))
}

export function setMeter(m: Measure, num: number, den: number) {
  m.num = num
  m.den = den
  while (used(m) > capacity(m)) removeLast(m)
}

export function makeMeasure(over: Partial<Measure> = {}): Measure {
  return { id: uid(), num: 4, den: 4, repeat: 1, notes: [], ...over }
}

// ---- Shorthand ---------------------------------------------------------------
// "q q e e h", "q. e", "t t t"; rests are prefixed with "r". Used for seeds,
// tests and share links.

const TOKENS: Record<string, number> = { w: 48, 'h.': 36, h: 24, 'q.': 18, q: 12, 'e.': 9, e: 6, t: 4, s: 3 }
const TOKEN_OF = Object.fromEntries(Object.entries(TOKENS).map(([k, v]) => [v, k]))

export function parseNotes(src: string): Note[] {
  return src.split(/\s+/).filter(Boolean).map((tok) => {
    const rest = tok.startsWith('r')
    const dur = TOKENS[rest ? tok.slice(1) : tok]
    if (!dur) throw new Error(`bad note "${tok}"`)
    return { dur, rest }
  })
}

export const formatNotes = (notes: Note[]) => notes.map((n) => (n.rest ? 'r' : '') + TOKEN_OF[n.dur]).join(' ')

// ---- Patterns ----------------------------------------------------------------

export const playable = (p: Pattern) =>
  p.measures.length > 0 && p.measures.every(isFull) && p.measures.some((m) => m.notes.some((n) => !n.rest))

export const totalBars = (p: Pattern) => p.measures.reduce((s, m) => s + m.repeat, 0)

export const secPerTick = (bpm: number) => 60 / bpm / QUARTER

export interface Bar {
  measure: number
  pass: number
  /** seconds */
  start: number
  dur: number
}

export interface Onset {
  time: number
  /** index into Timeline.bars */
  bar: number
  /** index into the measure's notes */
  note: number
}

export interface Beat {
  time: number
  accent: boolean
}

export interface Timeline {
  bars: Bar[]
  onsets: Onset[]
  beats: Beat[]
  /** seconds from 0 to the end of the last bar */
  end: number
}

/** Every bar, note onset and metronome beat, with repeats unrolled, starting at `offset` seconds. */
export function timeline(p: Pattern, offset = 0): Timeline {
  const spt = secPerTick(p.bpm)
  const tl: Timeline = { bars: [], onsets: [], beats: [], end: offset }
  let t = offset
  p.measures.forEach((m, mi) => {
    for (let pass = 0; pass < m.repeat; pass++) {
      const bar = tl.bars.length
      let pos = 0
      m.notes.forEach((n, ni) => {
        if (!n.rest) tl.onsets.push({ time: t + pos * spt, bar, note: ni })
        pos += n.dur
      })
      for (let b = 0; b < m.num; b++) tl.beats.push({ time: t + (b * WHOLE * spt) / m.den, accent: b === 0 })
      const dur = capacity(m) * spt
      tl.bars.push({ measure: mi, pass, start: t, dur })
      t += dur
    }
  })
  tl.end = t
  return tl
}

/** Count-in clicks in the first measure's meter: one bar, or two for very short bars. */
export function countIn(p: Pattern): { beats: Beat[]; length: number } {
  const m = p.measures[0]
  const bars = m.num < 3 ? 2 : 1
  const beat = (WHOLE / m.den) * secPerTick(p.bpm)
  const beats: Beat[] = []
  for (let i = 0; i < bars * m.num; i++) beats.push({ time: i * beat, accent: i % m.num === 0 })
  return { beats, length: beats.length * beat }
}

// ---- Share links -----------------------------------------------------------------
// ?name=Demo&bpm=90&m=2/4:q e e&m=6/8x2:q. q.  (one "m" per measure, "xN" for repeats)

export function encodePattern(p: Pattern): URLSearchParams {
  const q = new URLSearchParams({ name: p.name, bpm: String(p.bpm) })
  for (const ms of p.measures) q.append('m', `${ms.num}/${ms.den}${ms.repeat > 1 ? `x${ms.repeat}` : ''}:${formatNotes(ms.notes)}`)
  return q
}

/** The pattern a share link describes, or null if it isn't a valid one. */
export function decodePattern(q: URLSearchParams): Pattern | null {
  const specs = q.getAll('m')
  const bpm = Number(q.get('bpm') ?? 90)
  if (!specs.length || !Number.isInteger(bpm) || bpm < MIN_BPM || bpm > MAX_BPM) return null
  const measures: Measure[] = []
  for (const spec of specs) {
    const match = /^(\d+)\/(\d+)(?:x(\d+))?:(.*)$/.exec(spec.trim())
    if (!match) return null
    const [num, den, repeat] = [Number(match[1]), Number(match[2]), Number(match[3] ?? 1)]
    if (num < 1 || num > 16 || !DENOMINATORS.includes(den) || repeat < 1 || repeat > 16) return null
    let notes: Note[]
    try {
      notes = parseNotes(match[4])
    } catch {
      return null
    }
    const ms = makeMeasure({ num, den, repeat, notes })
    if (remaining(ms) < 0) return null
    measures.push(ms)
  }
  return { id: uid(), name: (q.get('name') ?? '').trim().slice(0, 60) || 'Shared pattern', bpm, measures }
}
