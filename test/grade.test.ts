import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EXTRA_PENALTY, credit, grade } from '../src/grade.ts'

const exp = [0, 0.5, 1, 1.5]

test('perfect taps score 100', () => {
  const g = grade(exp, exp.map((t) => t + 0.01))
  assert.equal(g.score, 100)
  assert.equal(g.hits, 4)
  assert.ok(Math.abs(g.offset! - 0.01) < 1e-9)
})

test('credit falls off linearly', () => {
  assert.equal(credit(0.03), 1)
  assert.equal(credit(-0.2), 0)
  assert.ok(credit(0.09) > 0.4 && credit(0.09) < 0.6)
})

test('missed notes earn nothing', () => {
  const g = grade(exp, [0, 0.5])
  assert.equal(g.score, 50)
  assert.deepEqual(g.errors.slice(2), [null, null])
})

test('mashing is penalised', () => {
  const taps = Array.from({ length: 40 }, (_, i) => i * 0.04)
  assert.ok(grade(exp, taps).score < 10)
})

test('extra taps cost points', () => {
  const g = grade(exp, [...exp, 0.25])
  assert.equal(g.extras.length, 1)
  assert.equal(g.score, Math.round(100 * (4 - EXTRA_PENALTY) / 4))
})

test('one early tap does not shift later pairings', () => {
  const g = grade(exp, [0, 0.38, 0.5, 1, 1.5])
  assert.deepEqual(g.errors, [0, 0, 0, 0])
  assert.deepEqual(g.extras, [0.38])
})

test('taps during the count-in are ignored', () => {
  assert.equal(grade(exp.map((t) => t + 2), [0, 0.5, 1, 1.5, ...exp.map((t) => t + 2)]).score, 100)
})
