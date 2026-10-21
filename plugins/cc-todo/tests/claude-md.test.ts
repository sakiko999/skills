import { expect, test } from 'claude-code/testing'

import { applyNotes, MAX_NOTES, parseNotes } from '../hooks/claude-md'
import type { Note } from '../types'

const note = (kind: Note['kind'], text: string): Note => ({
  id: `${kind}:${text}`,
  kind,
  text,
})

test('reads only the managed block', () => {
  const md = [
    '# Project',
    'Instructions',
    '<!-- cc-todo:start -->',
    '## TODO / 重要信息（cc-todo 自动维护）',
    '',
    '- [ ] 补测试',
    '- [!] 不要改公开 API',
    '- [.] 记得跑 migration',
    '<!-- cc-todo:end -->',
    'Tail',
  ].join('\n')

  expect(parseNotes(md)).toEqual([
    note('todo', '补测试'),
    note('important', '不要改公开 API'),
    note('note', '记得跑 migration'),
  ])
  expect(parseNotes('## TODO\n- [ ] 不在受管区块里')).toEqual([])
})

test('appends a block and keeps the rest of the file', () => {
  const out = applyNotes('# Project\n\n已有说明。\n', [note('todo', '补测试')])

  expect(out.includes('# Project\n\n已有说明。')).toBe(true)
  expect(out.endsWith('<!-- cc-todo:end -->\n')).toBe(true)
  expect(parseNotes(out)).toEqual([note('todo', '补测试')])
})

test('replaces the block in place without touching neighbours', () => {
  const md = applyNotes('# Project\n\n前文\n', [note('todo', '旧')])
  const out = applyNotes(md, [note('todo', '新'), note('important', '约束')])

  expect(out.startsWith('# Project\n\n前文\n')).toBe(true)
  expect(out.includes('旧')).toBe(false)
  expect(parseNotes(out)).toEqual([
    note('todo', '新'),
    note('important', '约束'),
  ])
})

test('removing every note removes the block', () => {
  const md = applyNotes('# Project\n\n前文\n', [note('todo', '旧')])

  expect(applyNotes(md, [])).toBe('# Project\n\n前文\n')
})

test('leaves a file with no block untouched when there is nothing to write', () => {
  expect(applyNotes('# Project\n', [])).toBe('# Project\n')
})

test('deduplicates and caps what is read back', () => {
  const many = Array.from({ length: MAX_NOTES + 5 }, (_, i) =>
    note('todo', `任务 ${i}`),
  )
  const out = parseNotes(applyNotes('', [...many, note('todo', '任务 0')]))

  expect(out).toHaveLength(MAX_NOTES)
  expect(out[MAX_NOTES - 1]).toEqual(note('todo', `任务 ${MAX_NOTES + 4}`))
})

test('keeps CRLF files CRLF', () => {
  const out = applyNotes('# Project\r\n\r\n说明\r\n', [note('todo', '补测试')])

  expect(out.includes('\r\n')).toBe(true)
  expect(out.includes('\n\n')).toBe(false)
  expect(parseNotes(out)).toEqual([note('todo', '补测试')])
})
