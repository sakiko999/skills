export type NoteKind = 'todo' | 'important' | 'note'

export type Draft = { kind: NoteKind; text: string }

/** One note is one line; cap it so 200 notes stay far below the store limit. */
const MAX_TEXT = 500

/** Line-start markers only; broaden if recall proves too low. */
const PATTERNS: { kind: NoteKind; re: RegExp }[] = [
  { kind: 'todo', re: /^\s*(?:[-*+]|\d+[.)])\s+\[\s\]\s+(.+?)\s*$/ },
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
  // A fence closes only on the same character and at least its length, so a
  // ``` line inside a ~~~ block does not end it.
  let fence: { char: string; length: number } | null = null

  for (const line of text.split(/\r?\n/)) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
    if (marker !== undefined) {
      if (fence === null) {
        fence = { char: marker[0]!, length: marker.length }
      } else if (marker[0] === fence.char && marker.length >= fence.length) {
        fence = null
      }
      continue
    }
    if (fence !== null) continue

    for (const pattern of PATTERNS) {
      const match = pattern.re.exec(line)
      if (match === null) continue

      const body = (match[1] ?? '').replace(/\s*(?:\*\*|__)\s*$/, '').trim()
      const clipped = body.length > MAX_TEXT ? `${body.slice(0, MAX_TEXT - 1)}…` : body
      const key = clipped.toLowerCase()
      if (clipped !== '' && !seen.has(key)) {
        seen.add(key)
        out.push({ kind: pattern.kind, text: clipped })
      }
      break
    }
  }

  return out
}
