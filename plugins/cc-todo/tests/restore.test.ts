import { expect, test } from 'claude-code/testing'

import { restoreNotes } from '../hooks/register'

test('starts empty when the store has nothing for this session', () => {
  // /clear deletes the store key; the old in-memory list must not survive.
  expect(restoreNotes(undefined)).toEqual([])
  expect(restoreNotes([])).toEqual([])
})

test('drops unreadable rows', () => {
  expect(restoreNotes('garbage')).toEqual([])
  expect(restoreNotes([{ id: 1, kind: 'todo', text: 'x' }])).toEqual([])
  expect(restoreNotes([{ id: 'a', kind: 'nope', text: 'x' }])).toEqual([])
})

test('keeps valid rows', () => {
  const note = { id: 'a', kind: 'todo', text: '补测试' }

  expect(restoreNotes([note])).toEqual([note])
})
