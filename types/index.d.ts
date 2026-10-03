// The file the pane shows, the page of it on screen, the element last brought into view (null: the top),
// and the files Back returns to (latest last).
export type MdviewDoc = { path: string; page: number; target: string | null; back: string[] }

// The find bar: open or not, what was last looked for, and which hit is shown.
export type MdviewFind = { query: string; at: number; hits: number }

// The section whose ✎ was pressed: its edit bar is open.
export type MdviewEdit = { path: string; unit: number }

declare module 'claude-code' {
  interface PluginState {
    mdview: { doc: MdviewDoc | null; rev: number; toc: boolean; find: MdviewFind | null; edit: MdviewEdit | null }
  }
}
