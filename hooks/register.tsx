import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { MdviewDoc, MdviewFind } from '../types'
import { bmpPixels, clean, fitCells, halfBlocks, html, paginate, pngSize, sectionAt, sections, split, tables } from './doc'
import { basename, dirname, FENCE, hrefOf, linkify, MD, refOf, resolveRef } from './links'
import type { Ref } from './links'

const PANE = 'mdview'
const doc = atom({ plugin: 'mdview', key: 'doc' } as const, null as MdviewDoc | null)
const rev = atom({ plugin: 'mdview', key: 'rev' } as const, 0)
const toc = atom({ plugin: 'mdview', key: 'toc' } as const, false)
const find = atom({ plugin: 'mdview', key: 'find' } as const, null as MdviewFind | null)

const TEXT_MAX = 9_000 // a Markdown or Code element takes at most 10,000 characters
const PAGE_MAX = 60_000 // a page of a long file: a whole tree tops out near 100k characters
const MAYBE_MD = /\.(?:md|markdown|mdx)\b/i
const MARK = '↗' // after each path a click opens here, so it reads as clickable
const PNG = /\.png$/i
const IMAGE = /\.(?:png|jpe?g|gif|webp|svg|bmp|tiff?|heic)$/i
const LONE_IMAGE = /^\s*!\[([^\]\n]*)\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)\s*$/
const ANY_IMAGE = /!\[([^\]\n]*)\]\(/g

type Part =
  | { kind: 'md'; text: string; hrefs: string[] }
  | { kind: 'img'; file: string; alt: string; columns: number; rows: number }
  | { kind: 'raster'; file: string; cells: string; alt: string; columns: number; rows: number }
  | { kind: 'code'; source: string; path: string; startLine: number }
// A stretch the pane jumps to: a section of a markdown file, or a run of lines of any other.
type Unit = { level: number; title: string; slug: string; line: number; plain: string; parts: Part[] }
type View = { units: Unit[]; pages: number[] } | { note: string }

// Module state: a reload starts these over, which costs only a few stats.
let home = ''
let columns = 0 // the widest the terminal has been seen
let paneColumns = 80
let isOpen = false
const known = new Set<string>() // files seen to exist
const cwds: string[] = [] // working directories this session has had, latest first
const cwdOf = new Map<string, string>() // a reply's working directory when first drawn
const views = new Map<string, View>() // lazy: the last 8 files drawn, by path, mtime and width
const sizes = new Map<string, { width: number; height: number } | null>() // lazy: a picture's size, never re-read
let pictures = false // the terminal draws an Image itself (kitty's graphics protocol); elsewhere pictures are Rasters
let isWarp = false // Warp has a Markdown viewer of its own, a click away from the pane
let tmp = '/tmp'
let made = 0

const remember = (cwd: string) => {
  const i = cwds.indexOf(cwd)
  if (i >= 0) cwds.splice(i, 1)
  cwds.unshift(cwd)
  cwds.length = Math.min(cwds.length, 10)
}
const tilde = (p: string): string => (home && p.startsWith(home + '/') ? '~' + p.slice(home.length) : p)
const plainTitle = (t: string): string => t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*~]/g, '')
const note = (text: string): View => ({ note: text })
const keyOf = (unit: number, part: number) => (part ? `u${unit}-${part}` : `u${unit}`)

async function homeDir($: EngineInterface) {
  return (home ||= (await $.env.get('HOME')) ?? '')
}

// `text` with every reference to an existing file made a file:// link (markdown files, and with `anyLink` any
// file a markdown link names), tried against each of `bases` in turn; null when there is none.
async function linkFiles($: EngineInterface, text: string, bases: readonly string[], opts: { self?: string; anyLink?: boolean } = {}) {
  await homeDir($)
  const found = new Map<string, Ref[]>()
  linkify(text, (raw, kind) => {
    const refs: Ref[] = []
    for (const base of bases) {
      const ref = resolveRef(raw, base, home, { anyExt: opts.anyLink && kind === 'link', self: opts.self })
      if (ref && !refs.some(r => r.abs === ref.abs)) refs.push(ref)
    }
    if (refs.length) found.set(`${kind}|${raw}`, refs)
    return null
  })
  if (found.size === 0) return null
  await Promise.all(
    [...new Set([...found.values()].flat().map(r => r.abs))]
      .filter(p => !known.has(p))
      .map(async p => {
        const st = await $.fs.stat(p).catch(() => null)
        if (st?.kind === 'file') known.add(p)
      }),
  )
  const hrefs = new Set<string>()
  const out = linkify(
    text,
    (raw, kind) => {
      const ref = found.get(`${kind}|${raw}`)?.find(r => known.has(r.abs))
      if (!ref) return null
      try {
        const h = hrefOf(ref)
        hrefs.add(h)
        return h
      } catch {
        return null // a lone surrogate encodeURI refuses
      }
    },
    MARK,
  )
  return hrefs.size ? { text: out, hrefs: [...hrefs] } : null
}

const mdParts = (text: string, hrefs: readonly string[]): Part[] =>
  split(text, TEXT_MAX).map(t => ({ kind: 'md', text: t, hrefs: hrefs.filter(h => t.includes(`](${h})`)).slice(0, 256) }))

// macOS's own image tool: what converts and scales any picture format here. Null where it is missing or fails.
async function sips($: EngineInterface, args: string[]): Promise<string | null> {
  const run = await $.process.run(['sips', ...args], { timeoutMs: 15_000 }).catch(() => null)
  return run?.exitCode === 0 ? run.stdout : null
}

async function imageSize($: EngineInterface, file: string) {
  if (!sizes.has(file)) {
    let size: { width: number; height: number } | null = null
    if (PNG.test(file)) {
      const bytes = await $.fs.read(file, { as: 'bytes' }).catch(() => null)
      size = bytes ? pngSize(bytes.base64) : null
    }
    if (!size) {
      const out = (await sips($, ['-g', 'pixelWidth', '-g', 'pixelHeight', file])) ?? ''
      const width = Number(/pixelWidth: (\d+)/.exec(out)?.[1])
      const height = Number(/pixelHeight: (\d+)/.exec(out)?.[1])
      size = width > 0 && height > 0 ? { width, height } : null
    }
    sizes.set(file, size)
  }
  return sizes.get(file) ?? null
}

// A local picture drawn in place, sized to the pane and kept to its proportions: the terminal's own picture where it
// draws one (another format turned into a PNG first), elsewhere colored half-block cells any truecolor terminal shows.
async function imagePart($: EngineInterface, src: string, alt: string, base: string): Promise<Part | null> {
  const ref = resolveRef(src, base, home, { anyExt: true })
  if (!ref || !IMAGE.test(ref.abs) || (await $.fs.stat(ref.abs).catch(() => null))?.kind !== 'file') return null
  const size = await imageSize($, ref.abs)
  if (!size) return null
  alt ||= basename(ref.abs)
  if (pictures) {
    let file = ref.abs
    if (!PNG.test(file)) {
      file = `${tmp}/mdview-${[...ref.abs].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)}.png` // left in place: the terminal reads it
      if ((await sips($, ['-s', 'format', 'png', ref.abs, '--out', file])) === null) return null
    }
    return { kind: 'img', file, alt, ...fitCells(size.width, size.height, Math.min(paneColumns - 2, 80), 40) }
  }
  const box = fitCells(size.width, size.height, Math.min(paneColumns - 2, 80), 24) // lazy: 24 rows keeps a page's cells small; tall pictures shrink
  const bmp = `${tmp}/mdview-${made++}.bmp`
  if ((await sips($, ['-s', 'format', 'bmp', '-z', String(box.rows * 2), String(box.columns), ref.abs, '--out', bmp])) === null) return null
  const bytes = await $.fs.read(bmp, { as: 'bytes' }).catch(() => null)
  void $.process.run(['rm', '-f', bmp]).catch(() => null)
  const px = bytes ? bmpPixels((Uint8Array as unknown as { fromBase64: (s: string) => Uint8Array }).fromBase64(bytes.base64)) : null
  if (!px) return null
  const cells = new Uint8Array(halfBlocks(px, box.columns, box.rows).buffer) as Uint8Array & { toBase64: () => string }
  return { kind: 'raster', file: ref.abs, cells: cells.toBase64(), alt, ...box }
}

// One section of a markdown file as the pane draws it: HTML and too-wide tables turned to markdown, local PNGs on
// a line of their own drawn as pictures, other pictures a link, file references links.
async function sectionParts($: EngineInterface, text: string, path: string): Promise<Part[]> {
  const base = dirname(path)
  const parts: Part[] = []
  let buf: string[] = []
  const flush = async () => {
    const md = buf.join('\n').replace(/^\n+|\n+$/g, '')
    buf = []
    if (!md) return
    const linked = await linkFiles($, md, [base], { self: path, anyLink: true })
    parts.push(...mdParts(linked?.text ?? md, linked?.hrefs ?? []))
  }
  let fence: string | null = null
  for (const line of tables(html(text), paneColumns - 2).split('\n')) {
    const f = FENCE.exec(line)?.[1]
    if (fence || f) {
      if (fence && f && f[0] === fence[0] && f.length >= fence.length) fence = null
      else if (!fence && f) fence = f
      buf.push(line)
      continue
    }
    const lone = LONE_IMAGE.exec(line)
    const img = lone ? await imagePart($, lone[2]!, lone[1]!, base) : null
    if (img) {
      await flush()
      parts.push(img)
    } else buf.push(line.replace(ANY_IMAGE, (_, alt: string) => `[🖼 ${alt || 'image'}](`))
  }
  await flush()
  return parts
}

async function build($: EngineInterface, path: string): Promise<View> {
  const link = `[${basename(path)}](${hrefOf({ abs: path, frag: '' })})`
  if (IMAGE.test(path)) {
    const img = await imagePart($, path, basename(path), '/')
    return img
      ? { units: [{ level: 0, title: '', slug: '', line: 1, plain: '', parts: [img] }], pages: [0] }
      : note(`This picture can't be drawn here. Open ${link} instead.`)
  }
  let raw: string
  try {
    raw = await $.fs.read(path)
  } catch (err) {
    return note(`Can't read ${link}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500))
  }
  if (raw.slice(0, 8000).includes(String.fromCharCode(0))) return note(`${link} is a binary file.`)
  const src = clean(raw)

  if (!MD.test(path)) {
    const units: Unit[] = []
    let line = 1
    for (const source of split(src, TEXT_MAX)) {
      units.push({ level: 0, title: '', slug: '', line, plain: source.toLowerCase(), parts: [{ kind: 'code', source, path, startLine: line }] })
      line += source.split('\n').length
    }
    return { units, pages: paginate(units.map(u => u.plain.length), PAGE_MAX) }
  }

  const units: Unit[] = []
  for (const s of sections(src)) {
    const parts = await sectionParts($, s.text, path)
    units.push({ level: s.level, title: plainTitle(s.title), slug: s.slug, line: s.line, plain: s.text.toLowerCase(), parts })
  }
  if (!units.length) units.push({ level: 0, title: '', slug: '', line: 1, plain: '', parts: [{ kind: 'md', text: '*(empty file)*', hrefs: [] }] })
  const size = (u: Unit) =>
    u.parts.reduce((n, p) => n + (p.kind === 'md' ? p.text.length : p.kind === 'code' ? p.source.length : p.kind === 'raster' ? p.cells.length : 100), 0)
  return { units, pages: paginate(units.map(size), PAGE_MAX) }
}

// The file as the pane draws it, parsed once per change on disk and width.
async function load($: EngineInterface, path: string): Promise<View> {
  await homeDir($)
  const st = await $.fs.stat(path).catch(() => null)
  if (st?.kind !== 'file') return note(`Can't find ${tilde(path)}.`)
  const key = `${path}|${st.mtimeMs}|${paneColumns}`
  const hit = views.get(key)
  if (hit) return hit
  const view = await build($, path)
  views.set(key, view)
  if (views.size > 8) views.delete(views.keys().next().value!)
  return view
}

async function openPane($: EngineInterface, path: string): Promise<string> {
  // No placement takes the whole screen: ask the dock for all of it, and the engine leaves the transcript its narrowest strip.
  const pane = { id: PANE, title: basename(path), focus: true as const, closeOnEscape: true as const }
  const opened = await $.ui.open(columns ? { ...pane, columns } : pane).catch(() => $.ui.open(pane))
  isOpen = true
  return opened.isPlaced ? 'shown' : `waiting: ${opened.reason}`
}

// Brings an element of the pane into view (null: its top), retrying while a pane just opened is not drawn yet.
async function scrollTo($: EngineInterface, key: string | null) {
  try {
    for (let n = 0; n < 8; n++) {
      const r = await $.ui.scroll({ in: PANE, to: key ? { key } : 'start', block: 'start' }).catch((err: unknown) => ({ deny: String(err) }))
      if (!r.deny) return
      await $.clock.sleep(80)
    }
  } catch {
    // the module reloaded or the dispatch ended: the pane stays where it is
  }
}

// Shows `page` of the file with `target` brought into view; the scroll runs on without holding up the caller.
async function moveTo($: EngineInterface, page: number, target: string | null) {
  await update($, doc, x => (x ? { ...x, page, target } : x))
  void scrollTo($, target)
}

async function goUnit($: EngineInterface, i: number) {
  const d = await read($, doc)
  if (!d) return
  const v = await load($, d.path)
  if ('note' in v) return
  await update($, toc, () => false)
  await moveTo($, v.pages[i] ?? 0, keyOf(i, 0))
}

async function show($: EngineInterface, ref: Ref | null): Promise<string> {
  if (!ref) return 'no file'
  // Open first, before any await: only an open made while the person's click or command is being answered is
  // placed at any width; one made later counts as the plugin's own and waits below 144 columns.
  const opening = openPane($, ref.abs)
  const d = await read($, doc)
  const isNew = d?.path !== ref.abs
  if (isNew) {
    await update($, doc, x => ({ path: ref.abs, page: 0, target: null, back: x ? [...x.back, x.path].slice(-30) : [] }))
    await update($, find, () => null)
    await update($, toc, () => false)
  }
  const placed = await opening
  const v = ref.frag ? await load($, ref.abs) : null
  const i = v && !('note' in v) ? sectionAt(v.units, ref.frag) : null
  if (i !== null) await goUnit($, i)
  else if (isNew) void scrollTo($, null)
  return placed
}

// A click on a link: the file in the pane, and a toast when that fails or the pane has to wait. The promise goes
// back to the press, so the open is part of answering it.
function press($: EngineInterface, href: string): Promise<unknown> {
  return show($, refOf(href))
    .then(placed => placed.startsWith('waiting') && $.ui.toast(`mdview: ${placed}`))
    .catch((err: unknown) => $.ui.toast(`mdview: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200)))
}

async function back($: EngineInterface) {
  const d = await read($, doc)
  const prev = d?.back.at(-1)
  if (!d || !prev) return
  await update($, doc, () => ({ path: prev, page: 0, target: null, back: d.back.slice(0, -1) }))
  await update($, find, () => null)
  await update($, toc, () => false)
  await openPane($, prev)
  void scrollTo($, null)
}

// Hands a file to a macOS app (`open`): the default one for its type, or the one `-a` names; a failure is a toast.
async function openWith($: EngineInterface, args: string[]) {
  const run = await $.process.run(['open', ...args], { timeoutMs: 10_000 }).catch((err: unknown) => ({ exitCode: -1, stderr: String(err) }))
  if (run.exitCode !== 0) $.ui.toast(`mdview: could not open it (${run.stderr.trim().slice(0, 120) || `exit ${run.exitCode}`})`)
}

// Enter in the find bar: the next section holding the text, wrapping around; a new text starts from the first.
async function findNext($: EngineInterface, query: string) {
  const d = await read($, doc)
  const q = query.trim()
  if (!d) return
  const v = await load($, d.path)
  if (!q || 'note' in v) return void (await update($, find, () => ({ query: q, at: 0, hits: 0 })))
  const hits = v.units.flatMap((u, i) => (u.plain.includes(q.toLowerCase()) ? [i] : []))
  const prev = await read($, find)
  const at = prev && prev.query === q && hits.length ? (prev.at + 1) % hits.length : 0
  await update($, find, () => ({ query: q, at, hits: hits.length }))
  const hit = hits[at]
  if (hit !== undefined) await goUnit($, hit)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await homeDir($)
    remember(e.cwd)
    // As Claude Code decides it: kitty or Ghostty, or forced on (iTerm2 3.7 draws kitty pictures; Warp can't place them)
    const forced = (await $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES')) ?? ''
    pictures =
      (forced !== '' && !/^(0|false|no|off)$/i.test(forced)) ||
      /kitty/i.test((await $.env.get('TERM')) ?? '') ||
      /ghostty/i.test((await $.env.get('TERM_PROGRAM')) ?? '') ||
      !!(await $.env.get('KITTY_WINDOW_ID'))
    isWarp = (await $.env.get('TERM_PROGRAM')) === 'WarpTerminal'
    tmp = ((await $.env.get('TMPDIR')) ?? '/tmp').replace(/\/+$/, '') || '/tmp'
    await $.command.register({ name: 'md', description: 'Show a file rendered in a side pane', argumentHint: '<path>[#heading|:line]' })
    await $.tool.register({
      name: 'show',
      description:
        'Open a local file in the mdview side pane for the person to read: markdown rendered, any other text file as highlighted code. Use when the person asks to see, open or preview a file.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Absolute, ~ or working-directory-relative path; may end in #heading or :line' } },
        required: ['path'],
      },
    })
    // Redraw the pane when its file changes on disk.
    let seen = -1
    $.clock.every(1_500, async () => {
      const d = isOpen ? await read($, doc) : null
      if (!d) return
      const m = (await $.fs.stat(d.path).catch(() => null))?.mtimeMs ?? -1
      if (m !== seen) {
        seen = m
        await update($, rev, () => m)
      }
    })
    return next(e)
  })

  on('classic.CwdChanged', ($, e, next) => {
    remember(e.new_cwd)
    return next(e)
  })

  // A markdown file Claude just wrote: links to it appear, and the pane showing it redraws, at once.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (e.tool === 'Write' || e.tool === 'Edit') {
      if (MD.test(e.file_path) || (isOpen && (await read($, doc))?.path === e.file_path)) $.ui.invalidate('ui.render')
    }
    return result
  })

  on('tool.call', { tool: 'mcp__mdview__show' }, async ($, e) => {
    const arg = String((e as { path?: unknown }).path ?? '').trim()
    const ref = resolveRef(arg, await $.session.cwd(), await homeDir($), { anyExt: true })
    const st = ref ? await $.fs.stat(ref.abs).catch(() => null) : null
    if (!ref || st?.kind !== 'file') return { result: `No such file: ${arg}` }
    try {
      return { result: `${tilde(ref.abs)}: pane ${await show($, ref)}` }
    } catch (err) {
      return { result: `Could not open the pane: ${err instanceof Error ? err.message : String(err)}` }
    }
  })

  on('command.run', { command: 'md' }, async ($, e) => {
    const arg = e.args.trim().replace(/^(['"`])(.*)\1$/, '$2')
    if (!arg) {
      const d = await read($, doc)
      if (!d) return { text: 'Usage: /md <path>[#heading|:line]' }
      await openPane($, d.path)
      return { text: `Showing ${tilde(d.path)}` }
    }
    const ref = resolveRef(arg, await $.session.cwd(), await homeDir($), { anyExt: true })
    const st = ref ? await $.fs.stat(ref.abs).catch(() => null) : null
    if (!ref || st?.kind !== 'file') return { text: `No such file: ${arg}` }
    await show($, ref)
    return { text: `Showing ${tilde(ref.abs)}` }
  })

  on('ui.close', async ($, e, next) => {
    const result = await next(e)
    if (e.id === PANE && !(result && 'deny' in result && result.deny)) {
      isOpen = false
      await update($, toc, () => false)
      await update($, find, () => null)
    }
    return result
  })

  // A reply that names .md files: drawn as the engine draws it, with those paths a click away.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    columns = Math.max(columns, e.viewport?.columns ?? 0)
    // Clicks reach a plugin only in the fullscreen terminal; elsewhere the engine's own drawing stays.
    if (e.surface !== 'terminal' || !e.viewport?.isFullscreen || !MAYBE_MD.test(e.props.text)) return next(e)
    const now = await $.session.cwd()
    remember(now)
    if (!cwdOf.has(e.requestId)) cwdOf.set(e.requestId, now)
    const linked = await linkFiles($, e.props.text, [...new Set([cwdOf.get(e.requestId)!, ...cwds])])
    if (!linked) return next(e)
    const { Box, Markdown, Text } = $.ui.resolve(e)
    const follow = (link: { href: string }) => press($, link.href)
    return (
      <Box flexDirection="row" marginTop={1}>
        <Box minWidth={2}>
          <Text>{e.props.isFirstOfReply ? '⏺' : ' '}</Text>
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          {split(linked.text, TEXT_MAX).map((text, i) => {
            const hrefs = linked.hrefs.filter(h => text.includes(`](${h})`)).slice(0, 256)
            return hrefs.length ? (
              <Markdown key={`r${i}`} text={text} pressableLinks={hrefs} onLinkPress={follow} />
            ) : (
              <Markdown key={`r${i}`} text={text} />
            )
          })}
        </Box>
      </Box>
    )
  })

  // A tool row that read or wrote a markdown file: the engine's own row, with a line under it that opens the file here.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const file = (e.props.input as { file_path?: unknown } | null)?.file_path
    const isMdTool = ['Read', 'Write', 'Edit'].includes(e.props.tool) && typeof file === 'string' && MD.test(file)
    if (e.surface !== 'terminal' || !e.viewport?.isFullscreen || !isMdTool || e.props.isRunning || e.props.isErrored) return next(e)
    const st = await $.fs.stat(file).catch(() => null)
    if (st?.kind !== 'file') return next(e)
    const href = hrefOf({ abs: file, frag: '' })
    const { Box, Markdown } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box paddingLeft={2}>
          <Markdown key="open" dimColor text={`⎿  [${tilde(file)}${MARK}](${href})`} pressableLinks={[href]} onLinkPress={link => press($, link.href)} />
        </Box>
      </Box>
    )
  })

  // A prompt of yours naming markdown files: your own row, with a line under it that opens them here.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !e.viewport?.isFullscreen || e.props.origin.kind !== 'composer' || !MAYBE_MD.test(e.props.text)) return next(e)
    const linked = await linkFiles($, e.props.text, [...new Set([await $.session.cwd(), ...cwds])])
    if (!linked) return next(e)
    const hrefs = linked.hrefs.slice(0, 20)
    const { Box, Markdown } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box paddingLeft={2}>
          <Markdown
            key="open"
            dimColor
            text={`⎿  ${hrefs.map(h => `[${tilde(refOf(h)?.abs ?? h)}${MARK}](${h})`).join(' · ')}`}
            pressableLinks={hrefs}
            onLinkPress={link => press($, link.href)}
          />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    isOpen = true
    paneColumns = e.props.bodyColumns || paneColumns
    const { Box, Button, Code, Markdown, Text } = $.ui.resolve(e)
    const Input = e.surface === 'mobile' ? null : $.ui.resolve(e).Input
    const Image = e.surface === 'terminal' ? $.ui.resolve(e).Image : null
    const Raster = e.surface === 'terminal' ? $.ui.resolve(e).Raster : null
    const d = await read($, doc)
    await read($, rev) // subscribes: a change on disk redraws
    const isTocOpen = await read($, toc)
    const f = await read($, find)
    if (!d) return <Text dimColor>{'Click a .md path in the conversation, or run /md <path>.'}</Text>

    const v = await load($, d.path)
    const units = 'note' in v ? [] : v.units
    const pages = 'note' in v ? [0] : v.pages
    const pageCount = (pages.at(-1) ?? 0) + 1
    const page = Math.min(d.page, pageCount - 1)
    const heads = units.flatMap((u, i) => (u.level > 0 ? [{ u, i }] : []))
    const follow = (link: { href: string }) => press($, link.href)

    const pager = (where: 'top' | 'bottom') =>
      pageCount > 1 ? (
        <Box flexDirection="row" gap={1}>
          {page > 0 && <Button key={`prev-${where}`} label="◂ Prev" {...(where === 'top' ? { hotkey: 'p' } : {})} onPress={() => moveTo($, page - 1, null)} />}
          <Text dimColor>{`Part ${page + 1} of ${pageCount}`}</Text>
          {page < pageCount - 1 && <Button key={`next-${where}`} label="Next ▸" {...(where === 'top' ? { hotkey: 'n' } : {})} onPress={() => moveTo($, page + 1, null)} />}
        </Box>
      ) : null

    const draw = (p: Part, key: string) => {
      if (p.kind === 'code') return <Code key={key} source={p.source} path={p.path} startLine={p.startLine} wrap="wrap" />
      if (p.kind === 'raster')
        return Raster ? (
          <Box key={`${key}-box`} flexDirection="column" alignItems="flex-start">
            <Raster key={key} cells={p.cells} columns={p.columns} rows={p.rows} />
            <Button key={`${key}-original`} plain dimColor label="↗ original" onPress={() => openWith($, [p.file])} />
          </Box>
        ) : (
          <Text key={key} dimColor>{`[picture: ${p.alt}]`}</Text>
        )
      if (p.kind === 'img')
        return Image ? (
          <Image key={key} source={{ file: p.file, format: 'png' }} columns={p.columns} rows={p.rows} alt={p.alt} />
        ) : (
          <Text key={key} dimColor>{`[picture: ${p.alt}]`}</Text>
        )
      return p.hrefs.length ? (
        <Markdown key={key} text={p.text} pressableLinks={p.hrefs} onLinkPress={follow} />
      ) : (
        <Markdown key={key} text={p.text} />
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          {/* the engine's own close mark sits at the top right, where a terminal may draw over it (Ghostty's 🔒) */}
          <Button key="close" label="✕" role="dismiss" hotkey="q" onPress={() => $.ui.close({ id: PANE })} />
          {d.back.length > 0 && <Button key="back" label="← Back" hotkey="b" onPress={() => back($)} />}
          {heads.length > 1 && <Button key="toc" label={isTocOpen ? 'Contents ▾' : 'Contents'} hotkey="t" onPress={() => update($, toc, x => !x)} />}
          {/* Warp's own Markdown viewer, split to the right as its "open file layout" setting says (a file:// URL would open a tab) */}
          {isWarp && <Button key="warp" label="Warp ↗" hotkey="w" onPress={() => openWith($, [`warp://action/open_file_editor?path=${encodeURIComponent(d.path)}`])} />}
          {Input && units.length > 0 && (
            <Button key="find-toggle" label="Find" hotkey="f" onPress={() => update($, find, x => (x ? null : { query: '', at: 0, hits: 0 }))} />
          )}
          <Text dimColor wrap="truncate-start">
            {tilde(d.path)}
          </Text>
        </Box>
        {f && Input && (
          <Box flexDirection="column">
            <Input key="find" placeholder="Find in this file; Enter again for the next" value={f.query} submitLabel="next" autoFocus onSubmit={q => findNext($, q)} />
            {f.query !== '' && <Text dimColor>{f.hits ? `${f.at + 1} of ${f.hits} sections hold "${f.query}"` : `No "${f.query}" in this file`}</Text>}
          </Box>
        )}
        {isTocOpen && (
          <Box flexDirection="column" marginBottom={1}>
            {heads.slice(0, 200).map(({ u, i }) => (
              <Button key={`toc-${i}`} plain label={`${'  '.repeat(u.level - 1)}${u.title}`.slice(0, Math.max(10, paneColumns - 2))} onPress={() => goUnit($, i)} />
            ))}
          </Box>
        )}
        {pager('top')}
        {'note' in v && <Markdown key="note" text={v.note} />}
        {units.flatMap((u, i) => (pages[i] === page ? u.parts.map((p, j) => draw(p, keyOf(i, j))) : []))}
        {pager('bottom')}
      </Box>
    )
  })
}
