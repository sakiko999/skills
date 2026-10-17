export type NoteKind = 'todo' | 'important' | 'note'

export type Note = {
  id: string
  kind: NoteKind
  text: string
}

declare module 'claude-code' {
  interface PluginState {
    'cc-todo': { notes: Note[] }
  }
}
