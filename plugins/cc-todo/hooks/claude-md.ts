import type { Note, NoteKind } from '../types'

/** Cap the managed block so the project's CLAUDE.md never crowds out real instructions. */
export const MAX_NOTES = 200

const START = '<!-- cc-todo:start -->'
const END = '<!-- cc-todo:end -->'
const HEADING = '## TODO / 重要信息（cc-todo 自动维护）'

const LABEL: Record<NoteKind, string> = { todo: '[ ]', important: '[!]', note: '[.]' }
const KIND: Record<string, NoteKind> = { ' ': 'todo', '!': 'important', '.': 'note' }
const LINE = /^-\s+\[( |!|\.)\]\s+(.+?)\s*$/

export const idFor = (note: Pick<Note, 'kind' | 'text'>) =>
  `${note.kind}:${note.text}`

/** Reads the managed block; everything outside it is ignored. */
export function parseNotes(markdown: string): Note[] {
  const start = markdown.indexOf(START)
  if (start < 0) return []

  const end = markdown.indexOf(END, start)
  const body = markdown.slice(
    start + START.length,
    end < 0 ? markdown.length : end,
  )

  const out: Note[] = []
  const seen = new Set<string>()

  for (const line of body.split(/\r?\n/)) {
    const match = LINE.exec(line)
    if (match === null) continue

    const text = match[2]!
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const kind = KIND[match[1]!]!
    out.push({ id: idFor({ kind, text }), kind, text })
  }

  return out.slice(-MAX_NOTES)
}

function renderBlock(notes: Note[], eol: string): string {
  return [
    START,
    HEADING,
    '',
    ...notes.map(note => `- ${LABEL[note.kind]} ${note.text}`),
    END,
  ].join(eol)
}

/**
 * Rewrites only the managed block, leaving the rest of CLAUDE.md untouched.
 * An empty list removes the block; a block missing its end marker is healed.
 */
export function applyNotes(markdown: string, notes: Note[]): string {
  const eol = markdown.includes('\r\n') ? '\r\n' : '\n'
  const start = markdown.indexOf(START)
  const end = start < 0 ? -1 : markdown.indexOf(END, start)

  if (start >= 0) {
    const before = markdown.slice(0, start)
    const after = end < 0 ? '' : markdown.slice(end + END.length)

    if (notes.length > 0) return before + renderBlock(notes, eol) + after

    const left = before.replace(/\s+$/, '')
    const right = after.replace(/^\s+/, '')
    if (left === '') return right
    if (right === '') return `${left}${eol}`
    return `${left}${eol}${eol}${right}`
  }

  if (notes.length === 0) return markdown

  const base = markdown.replace(/\s+$/, '')
  return base === ''
    ? `${renderBlock(notes, eol)}${eol}`
    : `${base}${eol}${eol}${renderBlock(notes, eol)}${eol}`
}
