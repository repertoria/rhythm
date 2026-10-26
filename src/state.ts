import m from 'mithril'
import * as audio from './audio.ts'
import { grade, WINDOW, type Grade } from './grade.ts'
import {
  countIn, decodePattern, encodePattern, makeMeasure, parseNotes, timeline, uid, type Measure, type Pattern, type Timeline,
} from './rhythm.ts'

const KEY = 'rhythm-trainer:v1'

export interface Session {
  kind: 'listen' | 'play' | 'result'
  pattern: Pattern
  tl: Timeline
  /** audio-clock time of second 0 */
  t0: number
  /** seconds since t0, as heard */
  now: number
  /** seconds; the pattern starts after this */
  lead: number
  taps: number[]
  result: Grade | null
}

export const state = {
  patterns: [] as Pattern[],
  /** metronome while playing / listening */
  click: true,
  listenClick: false,
  open: null as string | null,
  editing: null as string | null,
  session: null as Session | null,
}

// ---- Persistence ---------------------------------------------------------------

const seed = (name: string, bpm: number, bars: [string, number?, number?, number?][]): Pattern => ({
  id: uid(),
  name,
  bpm,
  measures: bars.map(([notes, repeat = 1, num = 4, den = 4]) => makeMeasure({ notes: parseNotes(notes), repeat, num, den })),
})

const seeds = (): Pattern[] => [
  seed('Quarters & eighths', 90, [['q q e e q'], ['e e q e e q'], ['q e e q q'], ['h q q']]),
  seed('Syncopation', 90, [['e q e q q'], ['e q e e q e'], ['re e re e re e re e'], ['q q h']]),
  seed('Dotted', 80, [['q. e q. e', 2], ['q. e q q'], ['h. q']]),
  seed('Triplets', 72, [['t t t q t t t q'], ['t t t t t t q q'], ['q t t t h']]),
  seed('Six-eight', 60, [['q e q e', 1, 6, 8], ['q. q.', 1, 6, 8], ['e e e q e', 1, 6, 8], ['q. rq.', 1, 6, 8]]),
]

export function load() {
  state.patterns = seeds()
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (raw?.patterns) {
      state.patterns = raw.patterns
      state.click = raw.click ?? true
      state.listenClick = raw.listenClick ?? false
    }
  } catch { /* keep the seeds */ }
  importFromUrl()
}

/** Opens the pattern in a share link, adding it unless an identical one is already saved. */
function importFromUrl() {
  const shared = decodePattern(new URLSearchParams(location.search))
  history.replaceState(null, '', location.pathname + location.hash)
  if (!shared) return
  const key = encodePattern(shared).toString()
  let p = state.patterns.find((o) => encodePattern(o).toString() === key)
  if (!p) {
    p = shared
    state.patterns.unshift(p)
    save()
  }
  state.open = p.id
}

/** "/" and ":" are legal in a query string, so leave them readable: ?m=2/4:q+e+e */
export const shareUrl = (p: Pattern) =>
  `${location.origin}${location.pathname}?${encodePattern(p).toString().replace(/%2F/g, '/').replace(/%3A/g, ':')}`

export function save() {
  localStorage.setItem(KEY, JSON.stringify({ patterns: state.patterns, click: state.click, listenClick: state.listenClick }))
}

// ---- Navigation & editing ------------------------------------------------------------

export const openPattern = () => state.patterns.find((p) => p.id === state.open) ?? null

export function show(id: string | null) {
  stop()
  state.open = id
  state.editing = null
}

export function newPattern() {
  const p: Pattern = { id: uid(), name: 'New pattern', bpm: 90, measures: [makeMeasure()] }
  state.patterns.unshift(p)
  save()
  show(p.id)
  state.editing = p.measures[0].id
}

export function duplicatePattern(p: Pattern) {
  const copy: Pattern = JSON.parse(JSON.stringify(p))
  copy.id = uid()
  copy.name = `${p.name} copy`
  for (const ms of copy.measures) ms.id = uid()
  state.patterns.splice(state.patterns.indexOf(p) + 1, 0, copy)
  save()
  show(copy.id)
}

export function deletePattern(p: Pattern) {
  state.patterns.splice(state.patterns.indexOf(p), 1)
  save()
  show(null)
}

export function duplicateMeasure(p: Pattern, ms: Measure): Measure {
  const copy: Measure = { ...ms, id: uid(), notes: ms.notes.map((n) => ({ ...n })) }
  p.measures.splice(p.measures.indexOf(ms) + 1, 0, copy)
  save()
  return copy
}

export function addMeasure(p: Pattern, after?: Measure) {
  const last = after ?? p.measures[p.measures.length - 1]
  const ms = makeMeasure(last ? { num: last.num, den: last.den } : {})
  p.measures.splice(after ? p.measures.indexOf(after) + 1 : p.measures.length, 0, ms)
  save()
  state.editing = ms.id
}

// ---- Listen / play -----------------------------------------------------------------

let raf = 0

function run(s: Session, cues: audio.Cue[]) {
  s.t0 = audio.play(cues)
  state.session = s
  cancelAnimationFrame(raf)
  const frame = () => {
    if (state.session !== s) return
    s.now = audio.heardAt() - s.t0
    if (s.now > s.tl.end + WINDOW) {
      if (s.kind === 'play') finish(s)
      else stop()
    } else raf = requestAnimationFrame(frame)
    m.redraw()
  }
  raf = requestAnimationFrame(frame)
}

export function listen(p: Pattern) {
  const tl = timeline(p)
  const beats = state.listenClick ? tl.beats : []
  const cues: audio.Cue[] = [
    ...beats.map((b): audio.Cue => ({ time: b.time, sound: b.accent ? 'accent' : 'beat', gain: 0.3 })),
    ...tl.onsets.map((o): audio.Cue => ({ time: o.time, sound: 'note' })),
  ]
  run({ kind: 'listen', pattern: p, tl, t0: 0, now: -1, lead: 0, taps: [], result: null }, cues)
}

export function practice(p: Pattern) {
  const ci = countIn(p)
  const tl = timeline(p, ci.length)
  const beats = state.click ? [...ci.beats, ...tl.beats] : ci.beats
  const cues = beats.map((b): audio.Cue => ({ time: b.time, sound: b.accent ? 'accent' : 'beat', gain: 0.6 }))
  state.editing = null
  run({ kind: 'play', pattern: p, tl, t0: 0, now: -1, lead: ci.length, taps: [], result: null }, cues)
}

/** `timeStamp` is the input event's, so taps are timed by when they happened, not when JS got to them. */
export function tap(timeStamp: number) {
  const s = state.session
  if (s?.kind !== 'play') return
  s.taps.push(audio.heardAt(timeStamp) - s.t0)
}

function finish(s: Session) {
  audio.stop()
  s.kind = 'result'
  s.result = grade(s.tl.onsets.map((o) => o.time), s.taps)
}

export function stop() {
  audio.stop()
  cancelAnimationFrame(raf)
  state.session = null
}
