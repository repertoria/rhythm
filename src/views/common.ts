import m from 'mithril'
import { capacity, clamp, remaining, valueOf, type Measure, type NoteValue } from '../rhythm.ts'

// ---- Glyphs --------------------------------------------------------------------

const NAMES: Record<number, string> = { 1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth', 16: 'sixteenth' }

export const valueName = (v: NoteValue, rest = false) =>
  `${v.dotted ? 'dotted ' : ''}${v.triplet ? 'triplet ' : ''}${NAMES[v.base]} ${rest ? 'rest' : 'note'}`

const flag = (dy: number) => m('path', { d: `M12.2 ${3 + dy}c.4 4.5 6.6 5.6 4.6 12.2c.4-4-2.2-5.8-4.6-6.4z` })

function noteShape(base: number) {
  const hollow = base <= 2
  return [
    m('ellipse', {
      cx: 7, cy: 25, rx: 5.4, ry: 3.9, transform: 'rotate(-22 7 25)',
      fill: hollow ? 'none' : 'currentColor', stroke: 'currentColor', 'stroke-width': hollow ? 1.8 : 0,
    }),
    base > 1 && m('rect', { x: 11.4, y: 3, width: 1.6, height: 22 }),
    base >= 8 && flag(0),
    base >= 16 && flag(5.5),
  ]
}

function restShape(base: number) {
  const stroke = { fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }
  switch (base) {
    case 1: return [m('rect', { x: 2, y: 11, width: 16, height: 1.4 }), m('rect', { x: 5, y: 12, width: 10, height: 5 })]
    case 2: return [m('rect', { x: 2, y: 18, width: 16, height: 1.4 }), m('rect', { x: 5, y: 13, width: 10, height: 5 })]
    case 4: return m('path', { d: 'M8 4l6 7-5 5 6 6c-4-1-6 1-3 6', ...stroke })
    default: return [
      m('circle', { cx: 7, cy: 11, r: 2.6 }),
      base >= 16 && m('circle', { cx: 5, cy: 18, r: 2.6 }),
      m('path', { d: `M7 13.4c3 .6 6-.4 8-3.4L${base >= 16 ? 8 : 10} 28`, ...stroke, 'stroke-width': 1.6 }),
    ]
  }
}

/** A note or rest glyph, drawn as SVG so it renders the same everywhere. */
export function glyph(v: NoteValue, rest = false) {
  return m('svg.glyph', { viewBox: '0 0 22 32', fill: 'currentColor', role: 'img', 'aria-label': valueName(v, rest) }, [
    rest ? restShape(v.base) : noteShape(v.base),
    v.dotted && m('circle', { cx: 19, cy: rest ? 15 : 25, r: 1.9 }),
    v.triplet && m('text', { x: 18, y: 8, 'font-size': 9, 'font-weight': 700, 'text-anchor': 'middle' }, '3'),
  ])
}

export const timeSig = (ms: Pick<Measure, 'num' | 'den'>) => m('span.ts', [m('span', ms.num), m('span', ms.den)])

// ---- Measure strip -----------------------------------------------------------------

export interface Mark {
  /** 0–1 across the bar */
  pos: number
  cls: string
}

export interface StripOpts {
  /** 0–1 across the bar */
  playhead?: number | null
  cellClass?: (i: number) => string
  marks?: Mark[]
  onTap?: (i: number) => void
  large?: boolean
}

/** A bar drawn to scale: each note's width is its duration, with a line on every beat. */
export function strip(ms: Measure, o: StripOpts = {}) {
  const rem = remaining(ms)
  return m('.strip', { class: o.large ? 'large' : '', style: { '--beats': ms.num } }, [
    m('.cells', [
      ms.notes.map((n, i) =>
        m(o.onTap ? 'button.cell' : '.cell', {
          type: o.onTap ? 'button' : undefined,
          class: `${n.rest ? 'rest' : 'note'} ${o.cellClass?.(i) ?? ''}`,
          style: { flexGrow: n.dur },
          onclick: o.onTap && (() => o.onTap!(i)),
        }, m('.in', glyph(valueOf(n.dur), n.rest))),
      ),
      rem > 0 && m('.cell.empty', { style: { flexGrow: rem } }, m('.in')),
    ]),
    m('.grid'),
    o.marks?.map((mk) => m('.mark', { class: mk.cls, style: { left: `${clamp(mk.pos, 0, 1) * 100}%` } })),
    o.playhead != null && m('.playhead', { style: { left: `${clamp(o.playhead, 0, 1) * 100}%` } }),
  ])
}

/** Position (0–1) of a note's start within its bar. */
export function notePos(ms: Measure, i: number) {
  let t = 0
  for (let k = 0; k < i; k++) t += ms.notes[k].dur
  return t / capacity(ms)
}

// ---- Controls ------------------------------------------------------------------------

export function stepper(value: number, set: (v: number) => void, min: number, max: number, label: string, cls = '') {
  const put = (v: number) => set(clamp(Math.round(v), min, max))
  return m('.stepper' + cls, [
    m('button', { type: 'button', 'aria-label': `Fewer ${label}`, disabled: value <= min, onclick: () => put(value - 1) }, '−'),
    m('input', {
      type: 'number', inputmode: 'numeric', min, max, value, 'aria-label': label,
      onchange: (e: Event) => {
        const v = Number((e.target as HTMLInputElement).value)
        if (Number.isFinite(v)) put(v)
        ;(e.target as HTMLInputElement).value = String(value)
      },
    }),
    m('button', { type: 'button', 'aria-label': `More ${label}`, disabled: value >= max, onclick: () => put(value + 1) }, '+'),
  ])
}

export function segmented<T>(value: T, options: { value: T; label: m.Children; title?: string }[], set: (v: T) => void) {
  return m('.seg', options.map((o) =>
    m('button', { type: 'button', title: o.title, class: o.value === value ? 'on' : '', 'aria-pressed': String(o.value === value), onclick: () => set(o.value) }, o.label),
  ))
}

const svg = (d: string) => () => m('svg.icon', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, m('path', { d }))

export const icon = {
  back: svg('M15.4 4.6 8 12l7.4 7.4-1.4 1.4L5.2 12 14 3.2z'),
  plus: svg('M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z'),
  play: svg('M7 4.5v15l12.5-7.5z'),
  stop: svg('M6 6h12v12H6z'),
  ear: svg('M12 2a7 7 0 0 0-7 7h2a5 5 0 0 1 10 0c0 2-1 3-2.3 4.2C13.4 14.4 12 15.7 12 18a2 2 0 0 1-4 0H6a4 4 0 0 0 8 0c0-1.4.9-2.2 2.1-3.3C17.5 13.4 19 12 19 9a7 7 0 0 0-7-7zm0 4a3 3 0 0 0-3 3h2a1 1 0 0 1 2 0c0 .6-.3 1-.9 1.5A3.5 3.5 0 0 0 10.6 13h2c0-.6.3-1 .9-1.5S15 10.2 15 9a3 3 0 0 0-3-3z'),
  copy: svg('M8 3h11a2 2 0 0 1 2 2v11h-2V5H8zM5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm0 2v10h10V9z'),
  grip: svg('M9 5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm-6 5.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM9 16a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z'),
  backspace: svg('M8.6 5H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8.6L2 12zm.9 2-4.9 5 4.9 5H20V7zm2.1 2.4 1.4-1.4 2.5 2.6L18 8l1.4 1.4-2.6 2.6 2.6 2.6L18 16l-2.5-2.6L13 16l-1.4-1.4 2.6-2.6z'),
}
