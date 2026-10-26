import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  VALUES, addNote, capacity, countIn, fits, isFull, makeMeasure, parseNotes, playable, removeLast, setMeter, timeline,
  type Pattern,
} from '../src/rhythm.ts'

const v = (dur: number) => VALUES.find((x) => x.dur === dur)!

test('notes must fit the bar', () => {
  const ms = makeMeasure()
  for (let i = 0; i < 4; i++) assert.ok(addNote(ms, v(12), false))
  assert.ok(isFull(ms))
  assert.equal(fits(ms, v(12)), false)
  assert.equal(addNote(ms, v(12), false), false)
  assert.equal(ms.notes.length, 4)
})

test('triplets go in and out as a group of three', () => {
  const ms = makeMeasure({ num: 2, den: 4 })
  addNote(ms, v(12), false)
  addNote(ms, v(4), false)
  assert.equal(ms.notes.length, 4)
  assert.ok(isFull(ms))
  removeLast(ms)
  assert.equal(ms.notes.length, 1)
})

test('shrinking the meter drops notes that no longer fit', () => {
  const ms = makeMeasure({ notes: parseNotes('q q q q') })
  setMeter(ms, 3, 4)
  assert.equal(ms.notes.length, 3)
  setMeter(ms, 5, 8)
  assert.equal(capacity(ms), 30)
  assert.equal(ms.notes.length, 2)
})

test('timeline unrolls repeats and skips rests', () => {
  const p: Pattern = {
    id: 'x', name: 'x', bpm: 60,
    measures: [makeMeasure({ notes: parseNotes('h rq q'), repeat: 2 }), makeMeasure({ num: 6, den: 8, notes: parseNotes('q. q.') })],
  }
  const tl = timeline(p, 1)
  assert.deepEqual(tl.onsets.map((o) => o.time), [1, 4, 5, 8, 9, 10.5])
  assert.equal(tl.bars.length, 3)
  assert.equal(tl.end, 12)
  assert.equal(tl.beats.length, 4 + 4 + 6)
  assert.ok(playable(p))
})

test('incomplete or silent patterns are not playable', () => {
  const p: Pattern = { id: 'x', name: 'x', bpm: 60, measures: [makeMeasure({ notes: parseNotes('q q q') })] }
  assert.equal(playable(p), false)
  p.measures[0].notes = parseNotes('rw')
  assert.equal(playable(p), false)
})

test('count-in is one bar, two for short bars', () => {
  const p: Pattern = { id: 'x', name: 'x', bpm: 120, measures: [makeMeasure({ num: 2 })] }
  assert.equal(countIn(p).beats.length, 4)
  assert.equal(countIn(p).length, 2)
  p.measures[0].num = 4
  assert.equal(countIn(p).beats.length, 4)
})

test('share links round-trip', async () => {
  const { encodePattern, decodePattern, formatNotes } = await import('../src/rhythm.ts')
  const p: Pattern = {
    id: 'x', name: 'Mixed & odd?', bpm: 72,
    measures: [
      makeMeasure({ num: 2, den: 4, notes: parseNotes('q e re') }),
      makeMeasure({ num: 6, den: 8, repeat: 3, notes: parseNotes('q. e e. s') }),
      makeMeasure({ notes: parseNotes('t t rt h.') }),
    ],
  }
  const q = encodePattern(p)
  const back = decodePattern(new URLSearchParams(q.toString()))!
  assert.equal(back.name, p.name)
  assert.equal(back.bpm, 72)
  assert.deepEqual(back.measures.map((ms) => [ms.num, ms.den, ms.repeat, formatNotes(ms.notes)]),
    p.measures.map((ms) => [ms.num, ms.den, ms.repeat, formatNotes(ms.notes)]))
})

test('bad share links are rejected', async () => {
  const { decodePattern } = await import('../src/rhythm.ts')
  const d = (s: string) => decodePattern(new URLSearchParams(s))
  assert.equal(d(''), null)
  assert.equal(d('m=4/4:q q q q q'), null)
  assert.equal(d('m=4/5:q'), null)
  assert.equal(d('m=4/4:z'), null)
  assert.equal(d('bpm=9999&m=4/4:w'), null)
  assert.equal(d('m=4/4:w')!.name, 'Shared pattern')
})
