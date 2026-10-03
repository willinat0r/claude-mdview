<div align="center">

# mdview

**Read the markdown files Claude names, without leaving Claude Code.**<br>
Click a `.md` path in the conversation and the file opens rendered in a side pane: headings, tables, code, links you can follow, pictures included.

[![Version](https://img.shields.io/badge/version-0.1.0-d77757.svg)](https://github.com/xuanji86/claude-mdview/releases)
[![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-c678dd.svg)](https://code.claude.com/docs/en/plugins/mods/overview)
[![License: MIT](https://img.shields.io/badge/license-MIT-4eba65.svg)](LICENSE)

**English** · [中文](README.zh-CN.md)

</div>

## Why

Claude writes plans, reports and notes as markdown files and names them in its replies. Reading one means leaving the
session for an editor or a browser. **mdview** is a [mod](https://code.claude.com/docs/en/plugins/mods/overview) that
makes those paths clickable and shows the file in a pane beside the conversation, drawn by Claude Code's own markdown
renderer.

## Features

| | |
| --- | --- |
| **Clickable paths** | A `.md` path in a reply (in backticks, bare, as a markdown link, even run into Chinese text) that names an existing file gets a `↗` and opens the pane on a plain click; `path:12` and `path#heading` land there. Read/Write/Edit rows and your own prompts that name a markdown file get an `⎿ path↗` line under them |
| **The pane** | Docked beside the transcript, as wide as the terminal allows; Esc closes it |
| **Navigation** | Links inside the file follow in place (other files, `#anchors`, `:line`); `← Back` (`b`) returns |
| **Contents and find** | `Contents` (`t`) lists the headings to jump to; `Find` (`f`) jumps from section to section holding the text |
| **Long files** | Paged in parts (`p` / `n`); long code blocks are closed and reopened, long tables repeat their header |
| **Pictures** | A picture on a line of its own is drawn in place (see [Terminals](#terminals)); one inside text becomes a `🖼` link |
| **HTML and wide tables** | Common HTML (`<details>`, `<br>`, `<img>`, `<a>`, `<b>`, comments) becomes markdown; a table too wide for the pane becomes one record per row |
| **Editing** | Hover a block (paragraph, list, table, code, picture, heading) and a `✎` shows at its right end; it opens a bar: type what to change and Enter sends it to Claude as your prompt, naming the file, the block's lines and how they begin; Claude edits, the pane redraws |
| **Other files** | Any text file opens as highlighted code with line numbers |
| **Live** | A file Claude writes or edits redraws at once; one changed elsewhere within 1.5 s |
| **`/md`** | `/md <path>[#heading\|:line]` opens any file; `/md` alone reopens the last one |
| **Tool** | `mcp__mdview__show` lets Claude open a file in the pane when you ask it to |
| **Warp** | A click on a path opens Warp's own Markdown viewer split to the right (Warp's "open file layout" setting) instead of the pane: sharp pictures, mermaid, editing. In the pane (`/md`), `Warp ↗` (`w`) does the same |

## Install

Requires Claude Code **2.1.287 or later** (mods are early access; tested on 2.1.288) in the **fullscreen** layout
(`"tui": "fullscreen"` in `~/.claude/settings.json`): only there does a click reach a mod.

```bash
git clone https://github.com/xuanji86/claude-mdview ~/Desktop/claude-mdview
```

Then load it in every session through `~/.claude/settings.json` (paths separated by `:`):

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "~/Desktop/claude-mdview" } }
```

or for one session: `claude --plugin-dir ~/Desktop/claude-mdview`.

## Terminals

| Terminal | Pictures |
| --- | --- |
| Ghostty, kitty | The terminal's own picture (kitty graphics protocol) |
| iTerm2 3.7+ | The same, with `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` set for iTerm2 only, e.g. in `~/.zshrc`: `[[ $TERM_PROGRAM == iTerm.app ]] && export CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` |
| Warp, others | Colored half blocks (`▀`, two pixels a cell): recognizable, not sharp; `↗ original` under one opens the file in its default app. In Warp a click goes to Warp's own viewer instead |

Claude Code draws pictures only in kitty and Ghostty unless forced. iTerm2 3.7 has the kitty graphics protocol and its
Unicode placeholders, so forcing works there; Warp has no placeholders yet
([warpdotdev/Warp#6210](https://github.com/warpdotdev/Warp/issues/6210)), and forcing it garbles the screen.

Formats other than PNG, and every picture drawn as half blocks, go through macOS's `sips`; elsewhere those show their
alt text.

## Limits

- No true fullscreen view: a mod's pane docks beside the transcript, which keeps a minimum width.
- Math, mermaid and heading sizes are beyond a terminal's text renderer; they show as written.
- A reply mdview redraws (one with a clickable path) copies its `⏺` along with the text.
- One Markdown element holds at most 10,000 characters and a drawing about 100,000, hence the paging.
- The mods API is early access and may change between Claude Code releases.

## Develop

```bash
claude plugin validate .
claude plugin test .
```

Saving a file reloads the mod in every session that loads it from this folder.

## License

[MIT](LICENSE)
