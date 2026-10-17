export type NoteKind = 'todo' | 'important' | 'note'

export type Draft = { kind: NoteKind; text: string }

/** Line-start markers only; broaden if recall proves too low. */
const PATTERNS: { kind: NoteKind; re: RegExp }[] = [
  { kind: 'todo', re: /^\s*[-*]\s*\[\s\]\s+(.+?)\s*$/ },
  { kind: 'todo', re: /^\s*!!todo\s*[:：]?\s*(.+?)\s*$/i },
  { kind: 'important', re: /^\s*!!important\s*[:：]?\s*(.+?)\s*$/i },
  { kind: 'note', re: /^\s*!!note\s*[:：]?\s*(.+?)\s*$/i },
  {
    kind: 'todo',
    re: /^\s*(?:[-*]\s+)?(?:\*\*|__)?(?:TODO|FIXME|待办)\s*(?:\*\*|__)?\s*[:：]\s*(?:\*\*|__)?\s*(.+?)\s*$/i,
  },
  {
    kind: 'important',
    re: /^\s*(?:[-*]\s+)?(?:\*\*|__)?(?:IMPORTANT|WARNING|重要|注意)\s*(?:\*\*|__)?\s*[:：]\s*(?:\*\*|__)?\s*(.+?)\s*$/i,
  },
  {
    kind: 'note',
    re: /^\s*(?:[-*]\s+)?(?:\*\*|__)?(?:NOTE|记得|记住)\s*(?:\*\*|__)?\s*[:：]\s*(?:\*\*|__)?\s*(.+?)\s*$/i,
  },
]

/** Pulls TODO / IMPORTANT / NOTE lines out of one message; deduplicates within it. */
export function extractNotes(text: string): Draft[] {
  const seen = new Set<string>()
  const out: Draft[] = []
  let inFence = false

  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    for (const pattern of PATTERNS) {
      const match = pattern.re.exec(line)
      if (match === null) continue

      const body = (match[1] ?? '').replace(/\s*(?:\*\*|__)\s*$/, '').trim()
      const key = body.toLowerCase()
      if (body !== '' && !seen.has(key)) {
        seen.add(key)
        out.push({ kind: pattern.kind, text: body })
      }
      break
    }
  }

  return out
}
