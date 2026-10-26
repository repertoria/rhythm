import m from 'mithril'
import { credit } from '../grade.ts'
import { VALUES, type Bar, type Timeline } from '../rhythm.ts'
import { listen, practice, state, stop, tap, type Session } from '../state.ts'
import { glyph, icon, strip, type Mark } from './common.ts'

const barAt = (tl: Timeline, t: number) => {
  const i = tl.bars.findIndex((b) => t < b.start + b.dur)
  return i < 0 ? tl.bars.length - 1 : i
}

/** Taps as marks across a bar; taps just before the first bar land on its left edge. */
function tapMarks(s: Session, bar: number, extras = new Set<number>()): Mark[] {
  return s.taps
    .filter((t) => barAt(s.tl, t) === bar)
    .map((t) => {
      const b = s.tl.bars[bar]
      return { pos: (t - b.start) / b.dur, cls: extras.has(t) ? 'extra' : 'tap' }
    })
}

function header(s: Session) {
  return m('header.bar', [
    m('button.icon-btn', { type: 'button', 'aria-label': 'Close', onclick: stop }, icon.back()),
    m('h1', s.pattern.name),
    m('span.tq', [glyph(VALUES[4]), ` ${s.pattern.bpm}`]),
  ])
}

// ---- Playing -------------------------------------------------------------------------

let flash = 0

function playView(s: Session) {
  const first = s.pattern.measures[0]
  const countBeats = (first.num < 3 ? 2 : 1) * first.num
  const counting = s.now < s.lead
  const beat = Math.floor((Math.max(0, s.now) / s.lead) * countBeats)
  const i = barAt(s.tl, s.now)
  const bar: Bar = s.tl.bars[i]
  const next = s.tl.bars[i + 1]
  const ms = s.pattern.measures[bar.measure]
  return m('.screen.play', [
    header(s),
    m('.progress', `${i + 1} / ${s.tl.bars.length}`),
    strip(ms, { large: true, playhead: counting ? null : (s.now - bar.start) / bar.dur, marks: tapMarks(s, i) }),
    m('.next', next && strip(s.pattern.measures[next.measure])),
    m('button.pad', {
      type: 'button', class: `f${flash % 2}`,
      onpointerdown: (e: PointerEvent) => {
        e.preventDefault()
        tap(e.timeStamp)
        flash++
      },
    }, counting ? m('span.count', (beat % first.num) + 1) : m('span', 'Tap')),
  ])
}

/** Keyboard taps: any plain key while playing; Escape stops. */
export function onKey(e: KeyboardEvent) {
  const s = state.session
  if (!s || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
  if (e.key === 'Escape') return stop()
  if (s.kind === 'play' && e.key !== 'Tab') {
    e.preventDefault()
    tap(e.timeStamp)
    flash++
  }
}

// ---- Result -------------------------------------------------------------------------

const quality = (err: number | null) => {
  if (err === null) return 'miss'
  const c = credit(err)
  return c >= 1 ? 'good' : c >= 0.5 ? 'ok' : 'poor'
}

function resultView(s: Session) {
  const g = s.result!
  const cls = new Map<string, string>()
  s.tl.onsets.forEach((o, k) => cls.set(`${o.bar}:${o.note}`, quality(g.errors[k])))
  const extras = new Set(g.extras)
  const n = s.tl.onsets.length
  const ms = g.offset === null ? null : Math.round(g.offset * 1000)
  return m('.screen.result', [
    header(s),
    m('.score', [m('b', g.score), m('span', '/100')]),
    m('.stats', [
      m('div', [m('b', `${g.hits}/${n}`), m('span', 'hit')]),
      m('div', [m('b', n - g.hits), m('span', 'missed')]),
      m('div', [m('b', g.extras.length), m('span', 'extra')]),
      m('div', [m('b', ms === null ? '–' : `${ms > 0 ? '+' : ''}${ms} ms`), m('span', ms === null || ms === 0 ? 'timing' : ms > 0 ? 'late' : 'early')]),
    ]),
    m('.row.actions', [
      m('button.btn.big.primary', { type: 'button', onclick: () => practice(s.pattern) }, 'Try again'),
      m('button.btn.big', { type: 'button', onclick: () => listen(s.pattern) }, [icon.ear(), 'Listen']),
    ]),
    m('.bars', s.tl.bars.map((b, i) =>
      strip(s.pattern.measures[b.measure], {
        cellClass: (k) => cls.get(`${i}:${k}`) ?? '',
        marks: tapMarks(s, i, extras),
      }),
    )),
  ])
}

export const PracticeScreen: m.Component = {
  view() {
    const s = state.session!
    return s.kind === 'result' ? resultView(s) : playView(s)
  },
}
