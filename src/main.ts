import m from 'mithril'
import './style.css'
import { load, state } from './state.ts'
import { PatternScreen } from './views/pattern.ts'
import { PracticeScreen, onKey } from './views/practice.ts'

load()

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return
  onKey(e)
  m.redraw()
})

m.mount(document.getElementById('app')!, {
  view: () => m('.app', state.session && state.session.kind !== 'listen' ? m(PracticeScreen) : m(PatternScreen)),
})
