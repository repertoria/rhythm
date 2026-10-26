import m from 'mithril'
import {
  MAX_BPM, MIN_BPM, VALUES, DENOMINATORS, addNote, fits, isFull, playable, removeLast, setMeter, totalBars,
  type Measure, type Pattern,
} from '../rhythm.ts'
import {
  addMeasure, deletePattern, duplicateMeasure, duplicatePattern, shareUrl, listen, newPattern, openPattern, practice, save, show, state, stop,
} from '../state.ts'
import { glyph, icon, segmented, stepper, strip, timeSig, valueName } from './common.ts'

const QUARTER = VALUES[4]

// ---- Library ---------------------------------------------------------------------

function meters(p: Pattern) {
  return [...new Set(p.measures.map((ms) => `${ms.num}/${ms.den}`))].join(' ')
}

export function libraryView() {
  return m('.screen', [
    m('header.bar', [m('h1', 'Rhythm Trainer')]),
    m('.list', state.patterns.map((p) =>
      m('button.item', { key: p.id, type: 'button', onclick: () => show(p.id) }, [
        m('b', p.name),
        m('span.meta', [meters(p), ' · ', `${totalBars(p)} bars`, ' · ', glyph(QUARTER), ` ${p.bpm}`]),
      ]),
    )),
    m('button.add', { type: 'button', onclick: newPattern }, [icon.plus(), 'Pattern']),
  ])
}

// ---- Pattern ----------------------------------------------------------------------

let confirmDelete = false
let copied = false

/** The system share sheet where there is one (phones), otherwise copy to the clipboard. */
async function share(p: Pattern) {
  const url = shareUrl(p)
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title: p.name, url })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  try {
    await navigator.clipboard.writeText(url)
  } catch {
    prompt('Link', url)
    return
  }
  copied = true
  m.redraw()
  setTimeout(() => { copied = false; m.redraw() }, 1500)
}

// ---- Drag to reorder ----
// Window listeners rather than pointer capture: the card's DOM node moves while
// dragging, and moving a node drops its capture.

let dragging: string | null = null

function startDrag(p: Pattern, ms: Measure, e: PointerEvent) {
  e.preventDefault()
  dragging = ms.id
  const move = (ev: PointerEvent) => {
    const others = [...document.querySelectorAll<HTMLElement>('.card')].filter((el) => el.dataset.id !== ms.id)
    const to = others.filter((el) => {
      const r = el.getBoundingClientRect()
      return r.top + r.height / 2 < ev.clientY
    }).length
    const from = p.measures.indexOf(ms)
    if (to !== from) {
      p.measures.splice(from, 1)
      p.measures.splice(to, 0, ms)
      m.redraw()
    }
    if (ev.clientY < 60) scrollBy(0, -12)
    else if (ev.clientY > innerHeight - 100) scrollBy(0, 12)
  }
  const end = () => {
    dragging = null
    removeEventListener('pointermove', move)
    removeEventListener('pointerup', end)
    removeEventListener('pointercancel', end)
    save()
    m.redraw()
  }
  addEventListener('pointermove', move)
  addEventListener('pointerup', end)
  addEventListener('pointercancel', end)
}

function measureCard(p: Pattern, ms: Measure, i: number) {
  const s = state.session?.pattern === p ? state.session : null
  const bar = s?.tl.bars.find((b) => s.now >= b.start && s.now < b.start + b.dur)
  const active = bar?.measure === i
  const edit = () => (state.editing = ms.id)
  return m('.card', {
    key: ms.id, 'data-id': ms.id,
    class: `${active ? 'active' : ''} ${isFull(ms) ? '' : 'incomplete'} ${dragging === ms.id ? 'dragging' : ''}`,
  }, [
    m('.card-top', [
      m('button.card-open', { type: 'button', 'aria-label': `Edit measure ${i + 1}`, onclick: edit }, [
        m('span.idx', i + 1),
        timeSig(ms),
        ms.repeat > 1 && m('span.rep', active ? `${bar!.pass + 1}/${ms.repeat}` : `×${ms.repeat}`),
      ]),
      m('button.icon-btn.small', { type: 'button', title: 'Duplicate', 'aria-label': `Duplicate measure ${i + 1}`, onclick: () => duplicateMeasure(p, ms) }, icon.copy()),
      m('button.icon-btn.small.handle', {
        type: 'button', title: 'Drag to move', 'aria-label': `Move measure ${i + 1}`,
        onpointerdown: (e: PointerEvent) => startDrag(p, ms, e),
        onkeydown: (e: KeyboardEvent) => {
          const to = i + (e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0)
          if (to === i || to < 0 || to >= p.measures.length) return
          e.preventDefault()
          p.measures.splice(to, 0, ...p.measures.splice(i, 1))
          save()
          requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-id="${ms.id}"] .handle`)?.focus())
        },
      }, icon.grip()),
    ]),
    m('button.card-body', { type: 'button', tabindex: -1, onclick: edit }, strip(ms, { playhead: active ? (s!.now - bar!.start) / bar!.dur : null })),
  ])
}

function patternView(p: Pattern) {
  const listening = state.session?.kind === 'listen'
  const ok = playable(p)
  return m('.screen', [
    m('header.bar', [
      m('button.icon-btn', { type: 'button', 'aria-label': 'All patterns', onclick: () => show(null) }, icon.back()),
      m('input.title', {
        value: p.name, maxlength: 60, 'aria-label': 'Pattern name',
        oninput: (e: Event) => { p.name = (e.target as HTMLInputElement).value; save() },
      }),
    ]),
    m('.row.tempo', [
      m('span.tq', [glyph(QUARTER), '=']),
      stepper(p.bpm, (v) => { p.bpm = v; save() }, MIN_BPM, MAX_BPM, 'BPM'),
    ]),
    m('.row.clicks', [
      m('span.label', 'Click'),
      m('button.chip', {
        type: 'button', class: state.listenClick ? 'on' : '', 'aria-pressed': String(state.listenClick), title: 'Metronome while listening',
        onclick: () => { state.listenClick = !state.listenClick; save() },
      }, 'Listen'),
      m('button.chip', {
        type: 'button', class: state.click ? 'on' : '', 'aria-pressed': String(state.click), title: 'Metronome while playing',
        onclick: () => { state.click = !state.click; save() },
      }, 'Play'),
    ]),
    m('.cards', p.measures.map((ms, i) => measureCard(p, ms, i))),
    m('button.add', { type: 'button', onclick: () => addMeasure(p) }, [icon.plus(), 'Measure']),
    m('.row.end', [
      m('button.btn.small', { type: 'button', onclick: () => share(p) }, copied ? 'Copied' : 'Share'),
      m('button.btn.small', { type: 'button', onclick: () => duplicatePattern(p) }, 'Duplicate'),
      m('button.btn.small.danger', {
        type: 'button', onblur: () => (confirmDelete = false),
        onclick: () => (confirmDelete ? deletePattern(p) : (confirmDelete = true)),
      }, confirmDelete ? 'Confirm delete' : 'Delete'),
    ]),
    m('.transport', [
      m('button.btn.big', { type: 'button', disabled: !ok, onclick: () => (listening ? stop() : listen(p)) },
        [listening ? icon.stop() : icon.ear(), listening ? 'Stop' : 'Listen']),
      m('button.btn.big.primary', { type: 'button', disabled: !ok, onclick: () => practice(p) }, [icon.play(), 'Play']),
    ]),
  ])
}

// ---- Measure editor ---------------------------------------------------------------

let restMode = false

function editorView(p: Pattern, i: number) {
  const ms = p.measures[i]
  const changed = () => save()
  const move = (to: number) => {
    p.measures.splice(to, 0, ...p.measures.splice(i, 1))
    changed()
  }
  return m('.screen', [
    m('header.bar', [
      m('button.icon-btn', { type: 'button', 'aria-label': 'Back', onclick: () => (state.editing = null) }, icon.back()),
      m('h1', `Measure ${i + 1}`, m('small', ` / ${p.measures.length}`)),
    ]),

    m('.panel', [
      strip(ms, { large: true, onTap: (k) => { ms.notes[k].rest = !ms.notes[k].rest; changed() } }),
      m('.row', [
        segmented(restMode, [{ value: false, label: 'Note' }, { value: true, label: 'Rest' }], (v) => (restMode = v)),
        m('.spacer'),
        m('button.icon-btn', { type: 'button', 'aria-label': 'Delete last', disabled: !ms.notes.length, onclick: () => { removeLast(ms); changed() } }, icon.backspace()),
        m('button.btn.small', { type: 'button', disabled: !ms.notes.length, onclick: () => { ms.notes = []; changed() } }, 'Clear'),
      ]),
      m('.palette', VALUES.map((v) =>
        m('button.val', {
          type: 'button', disabled: !fits(ms, v), title: valueName(v, restMode),
          onclick: () => { addNote(ms, v, restMode); changed() },
        }, glyph(v, restMode)),
      )),
    ]),

    m('.panel', [
      m('.field', [
        m('span.label', 'Time'),
        m('.meter', [
          stepper(ms.num, (v) => { setMeter(ms, v, ms.den); changed() }, 1, 16, 'beats', '.compact'),
          m('span.slash', '/'),
          segmented(ms.den, DENOMINATORS.map((d) => ({ value: d, label: String(d) })), (d) => { setMeter(ms, ms.num, d); changed() }),
        ]),
      ]),
      m('.field', [
        m('span.label', 'Repeat'),
        stepper(ms.repeat, (v) => { ms.repeat = v; changed() }, 1, 16, 'repeats', '.compact'),
      ]),
    ]),

    m('.row.wrap', [
      m('button.btn.small', { type: 'button', disabled: i === 0, onclick: () => move(i - 1) }, '↑'),
      m('button.btn.small', { type: 'button', disabled: i === p.measures.length - 1, onclick: () => move(i + 1) }, '↓'),
      m('button.btn.small', {
        type: 'button',
        onclick: () => (state.editing = duplicateMeasure(p, ms).id),
      }, 'Duplicate'),
      m('button.btn.small', { type: 'button', onclick: () => addMeasure(p, ms) }, [icon.plus(), 'Measure']),
      m('button.btn.small.danger', {
        type: 'button', disabled: p.measures.length === 1,
        onclick: () => { p.measures.splice(i, 1); changed(); state.editing = null },
      }, 'Delete'),
    ]),
  ])
}

export const PatternScreen: m.Component = {
  view() {
    const p = openPattern()
    if (!p) return libraryView()
    const i = p.measures.findIndex((ms) => ms.id === state.editing)
    return i >= 0 ? editorView(p, i) : patternView(p)
  },
}
