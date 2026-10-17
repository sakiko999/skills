import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Note } from '../types'
import { extractNotes, type Draft } from './extract'

const notes = atom({ plugin: 'cc-todo', key: 'notes' } as const, [] as Note[])

const MAX = 200
const PANE = 'cc-todo'
const LABEL: Record<Note['kind'], string> = {
  todo: '[ ]',
  important: '[!]',
  note: '[.]',
}

const CAPTURE = `## 会话记录 (cc-todo)

当出现需要后续跟进的事项时，在回复中单独一行写 \`!!todo <一句话>\`；当出现必须记住的约束、决定或风险时，单独一行写 \`!!important <一句话>\`。这些行会被自动记录并显示在输入框上方。不要重复标注已经记录的内容，也不要把整段回复复制进去。`

const makeId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

async function record($: EngineInterface, found: Draft[]): Promise<void> {
  if (found.length === 0) return

  await update($, notes, list => {
    const seen = new Set(list.map(note => note.text.toLowerCase()))
    const fresh: Note[] = []

    for (const draft of found) {
      const key = draft.text.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      fresh.push({ id: makeId(), kind: draft.kind, text: draft.text })
    }

    return fresh.length === 0 ? list : [...list, ...fresh].slice(-MAX)
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'todo',
      description: '查看、添加或清理本会话自动记录的 TODO / 重要信息',
      argumentHint: '[open | close | clear | done <n> | add <text> | important <text>]',
    })

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command === undefined && e.isMeta !== true) {
      await record($, extractNotes(e.text))
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined) await record($, extractNotes(ran.text))

    return ran
  })

  on('prompt.compose', async ($, e, next) => {
    const ran = await next(e)

    return {
      sections: [
        ...ran.sections,
        { id: 'cc-todo:capture', text: CAPTURE, scope: 'session' as const },
      ],
    }
  })

  on('command.run', { command: 'todo' }, async ($, e) => {
    const list = await read($, notes)
    const args = e.args.trim()

    if (args === 'open') {
      const opened = await $.ui.open({ id: PANE, title: 'cc-todo' })
      return {
        text: opened.isPlaced
          ? '已打开 cc-todo 面板。'
          : `面板已创建，但当前界面放不下：${opened.reason}`,
      }
    }

    if (args === 'close') {
      await $.ui.close({ id: PANE })
      return { text: '已关闭 cc-todo 面板。' }
    }

    if (args === 'clear') {
      await update($, notes, () => [])
      return { text: '已清空本会话的记录。' }
    }

    const done = /^(?:done|rm|完成)\s+(\d+)$/.exec(args)
    if (done !== null) {
      const index = Number(done[1])
      const note = list[index - 1]
      if (note === undefined) return { text: `没有第 ${index} 条记录。` }

      await update($, notes, current => current.filter((_, i) => i !== index - 1))
      return { text: `已移除 #${index}: ${note.text}` }
    }

    const add = /^(add|important)\s+(.+)$/i.exec(args)
    if (add !== null) {
      const text = add[2]!.trim()
      const kind = add[1]!.toLowerCase() === 'important' ? 'important' : 'todo'
      await record($, [{ kind, text }])
      return { text: `已记录：${text}` }
    }

    if (list.length === 0) {
      return { text: '本会话还没有记录。用 `/todo add <内容>` 手动添加。' }
    }

    return {
      text: list
        .map((note, i) => `${i + 1}. ${LABEL[note.kind]} ${note.text}`)
        .join('\n'),
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const list = await read($, notes)
    const { Box, Text, Button } = $.ui.resolve(e)
    const width = Math.max(12, e.props.bodyColumns - 6)
    const cut = (text: string) =>
      text.length > width ? `${text.slice(0, width - 1)}…` : text

    return (
      <Box flexDirection="column">
        <Text dimColor>
          {list.length} 条 · 方向键滚动，点 × 删除
        </Text>
        {list.length === 0 && <Text dimColor>暂无记录</Text>}
        {list.map((note, i) => (
          <Box key={note.id}>
            <Text wrap="truncate">
              {i + 1}. {LABEL[note.kind]} {cut(note.text)}
            </Text>
            <Button
              label=" ×"
              plain
              onPress={() =>
                update($, notes, current =>
                  current.filter(item => item.id !== note.id),
                )
              }
            />
          </Box>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, notes)
    if (list.length === 0 || e.props.hasSurvey) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const room = Math.max(1, e.props.maxRows - 1)
    const shown = list.slice(-room)
    const total = list.length > room ? `，共 ${list.length} 条` : ''

    return (
      <Box flexDirection="column">
        <Text dimColor>cc-todo{total} · /todo 查看</Text>
        {shown.map(note => (
          <Text key={note.id} wrap="truncate">
            {LABEL[note.kind]} {note.text}
          </Text>
        ))}
      </Box>
    )
  })
}
