import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Note } from '../types'
import { applyNotes, idFor, MAX_NOTES, parseNotes } from './claude-md'
import { extractNotes, type Draft } from './extract'

const notes = atom({ plugin: 'cc-todo', key: 'notes' } as const, [] as Note[])

const PANE = 'cc-todo'
const LABEL: Record<Note['kind'], string> = {
  todo: '[ ]',
  important: '[!]',
  note: '[.]',
}

const CAPTURE = `## 项目记录 (cc-todo)

当出现需要后续跟进的事项时，在回复中单独一行写 \`!!todo <一句话>\`；当出现必须记住的约束、决定或风险时，单独一行写 \`!!important <一句话>\`。这些行会被自动写入项目根目录的 CLAUDE.md，并显示在输入框上方。不要重复标注已经记录的内容，也不要把整段回复复制进去。`

const claudeMd = async ($: EngineInterface) =>
  `${(await $.session.root()).replace(/[\\/]+$/, '')}/CLAUDE.md`

async function load($: EngineInterface): Promise<Note[]> {
  const path = await claudeMd($)
  if (!(await $.fs.exists(path))) return []
  return parseNotes(await $.fs.read(path))
}

// Writes from this process are serialized; another session writing the same
// project at the same instant can still win the last write. CLAUDE.md stays
// authoritative, so a restart or a second session still reads the notes.
let queue: Promise<unknown> = Promise.resolve()

function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.catch(() => undefined)
  return run
}

/** Read-merge-write against CLAUDE.md, then refresh the in-memory view. */
async function mutate(
  $: EngineInterface,
  change: (list: Note[]) => Note[],
): Promise<Note[]> {
  return serial(async () => {
    const path = await claudeMd($)
    const current = (await $.fs.exists(path)) ? await $.fs.read(path) : ''
    const next = change(parseNotes(current)).slice(-MAX_NOTES)
    const text = applyNotes(current, next)

    if (text !== current) await $.fs.write(path, text)
    await update($, notes, () => next)
    return next
  })
}

async function record($: EngineInterface, found: Draft[]): Promise<number> {
  if (found.length === 0) return 0

  let added = 0
  await mutate($, list => {
    const seen = new Set(list.map(note => note.text.toLowerCase()))
    const fresh: Note[] = []

    for (const draft of found) {
      const key = draft.text.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      fresh.push({ id: idFor(draft), kind: draft.kind, text: draft.text })
    }

    added = fresh.length
    return fresh.length === 0 ? list : [...list, ...fresh]
  })

  return added
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // CLAUDE.md is the source of truth, shared by every session in the project.
    let saved: Note[] = []
    try {
      saved = await load($)
    } catch {
      // An unreadable CLAUDE.md starts empty; recording retries on the next note.
    }
    await update($, notes, () => saved)

    await $.command.register({
      name: 'todo',
      description: '查看、添加或清理项目 CLAUDE.md 中自动记录的 TODO / 重要信息',
      argumentHint: '[open | close | clear | done <n> | add <text> | important <text>]',
    })

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command === undefined && e.isMeta !== true) {
      try {
        await record($, extractNotes(e.text))
      } catch {
        // Recording is a side effect; a file write must never block the prompt.
      }
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)

    if (e.agentId === undefined) {
      try {
        await record($, extractNotes(ran.text))
      } catch {
        // A failed write leaves CLAUDE.md as it was; the turn still completes.
      }
    }

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
      await mutate($, () => [])
      return { text: '已清空项目 CLAUDE.md 中的记录。' }
    }

    const done = /^(?:done|rm|完成)\s+(\d+)$/.exec(args)
    if (done !== null) {
      const index = Number(done[1])
      const removed: { note?: Note } = {}

      await mutate($, current => {
        removed.note = current[index - 1]
        return removed.note === undefined
          ? current
          : current.filter((_, i) => i !== index - 1)
      })

      return removed.note === undefined
        ? { text: `没有第 ${index} 条记录。` }
        : { text: `已从 CLAUDE.md 移除 #${index}: ${removed.note.text}` }
    }

    const add = /^(add|important)\s+(.+)$/i.exec(args)
    if (add !== null) {
      const text = add[2]!.trim()
      const kind = add[1]!.toLowerCase() === 'important' ? 'important' : 'todo'
      const added = await record($, [{ kind, text }])
      return { text: added > 0 ? `已记录：${text}` : `已存在：${text}` }
    }

    if (list.length === 0) {
      return { text: 'CLAUDE.md 里还没有记录。用 `/todo add <内容>` 手动添加。' }
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
              onPress={async () => {
                await mutate($, current =>
                  current.filter(item => item.id !== note.id),
                )
              }}
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
