// The file the pane shows, the page of it on screen, the element last brought into view (null: the top),
// and the files Back returns to (latest last).
export type MdviewDoc = { path: string; page: number; target: string | null; back: string[] }

// The find bar: open or not, what was last looked for, and which hit is shown.
export type MdviewFind = { query: string; at: number; hits: number }

// The block whose ✎ was pressed, by the line it began on and a fingerprint of its text (found again if the file
// changes above it): its edit bar is open.
export type MdviewEdit = { path: string; line: number; hash: string }

// An edit sent to Claude from a block's ✎: the block, the file's mtime when sent, and whether Claude's turn has ended;
// the pane shows its progress under the block until a few seconds after.
export type MdviewPending = { path: string; line: number; hash: string; mtime: number; finished: boolean }

declare module 'claude-code' {
  // `edit` is Shaped: its atom names a shape, bumped whenever MdviewEdit changes, so a reload declines an old value
  interface PluginState {
    // `cwds`: the working directories the session has had, latest first, kept across reloads of the mod
    mdview: { doc: MdviewDoc | null; rev: number; toc: boolean; find: MdviewFind | null; edit: Shaped<MdviewEdit | null>; cwds: string[]; pending: MdviewPending | null }
  }
}
