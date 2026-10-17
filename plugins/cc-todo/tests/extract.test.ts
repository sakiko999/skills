import { expect, test } from 'claude-code/testing'

import { extractNotes } from '../hooks/extract'

test('captures only line-start markers', () => {
  const found = extractNotes([
    '普通段落提到 TODO: 这不算',
    'TODO: 发布前修掉登录泄漏',
    '- [ ] 补测试',
    '**IMPORTANT:** 不要改公开 API',
    '!!todo 更新文档',
    '待办：写迁移脚本',
  ].join('\n'))

  expect(found).toEqual([
    { kind: 'todo', text: '发布前修掉登录泄漏' },
    { kind: 'todo', text: '补测试' },
    { kind: 'important', text: '不要改公开 API' },
    { kind: 'todo', text: '更新文档' },
    { kind: 'todo', text: '写迁移脚本' },
  ])
})

test('deduplicates within one message', () => {
  expect(extractNotes('TODO: same\nTODO: same')).toHaveLength(1)
})

test('ignores markers inside fenced code blocks', () => {
  const found = extractNotes([
    '```js',
    '// TODO: this is code',
    'TODO: this is a code sample',
    '- [ ] not a real task',
    '```',
    'TODO: the real one',
  ].join('\n'))

  expect(found).toEqual([{ kind: 'todo', text: 'the real one' }])
})
