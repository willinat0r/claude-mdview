# python3 assets/make_previews.py — draws the README previews in Claude Code's dark theme: every run placed and
# sized by terminal column, the pane docked beside the transcript as the fullscreen layout seats it.
# The drawing helpers are agentpane's (github.com/xuanji86/claude-agentpane, assets/make_previews.py).
import html, os, unicodedata

OUT = os.path.dirname(os.path.abspath(__file__))
CW, LH, FS, PAD = 8.4, 19, 14, 18
C = dict(bg='#1f1f1f', fg='#e8e8e8', dim='#8a8a8a', faint='#5c5c5c', claude='#d77757', code='#b1b9f9',
         ok='#4eba65', line='#4a4a4a', hover='#373737')


def w(s):
    return sum(2 if unicodedata.east_asian_width(ch) in 'WF' else 1 for ch in s)


def runs(col, row, parts):
    """parts: (text, color[, style]) laid left to right from column `col` on text row `row`; style 'b' bold, 'u' bold underlined."""
    out = []
    for text, color, *style in parts:
        body = text.strip()
        if body:
            lead = len(text) - len(text.lstrip())
            x, y = PAD + (col + lead) * CW, PAD + 14 + row * LH
            b = ' font-weight="700"' if style else ''
            u = ' text-decoration="underline"' if style and style[0] == 'u' else ''
            out.append(f'<text x="{x:.1f}" y="{y}" fill="{C[color]}"{b}{u} textLength="{w(body) * CW:.1f}" '
                       f'lengthAdjust="spacingAndGlyphs">{html.escape(body)}</text>')
        col += w(text)
    return out


def clip(parts, room):
    """Cut a row of parts to `room` columns, ending in an ellipsis, as the transcript wraps beside the pane."""
    out, used = [], 0
    for text, color, *style in parts:
        if used + w(text) <= room:
            out.append((text, color, *style))
            used += w(text)
            continue
        keep = ''
        for ch in text:
            if used + w(keep) + w(ch) > room - 1:
                break
            keep += ch
        out.append((keep + '…', color, *style))
        break
    return out


def vline(col, row0, row1, color='line'):
    x = PAD + col * CW + CW / 2
    return f'<line x1="{x:.1f}" y1="{PAD + row0 * LH}" x2="{x:.1f}" y2="{PAD + row1 * LH}" stroke="{C[color]}" stroke-width="1.2"/>'


def hline(col0, col1, row, color='line'):
    y = PAD + row * LH + LH / 2
    return f'<line x1="{PAD + col0 * CW:.1f}" y1="{y}" x2="{PAD + col1 * CW:.1f}" y2="{y}" stroke="{C[color]}" stroke-width="1"/>'


def band(col0, col1, row0, row1, color='hover'):
    """A hovered block: its rows lit across the pane."""
    return (f'<rect x="{PAD + col0 * CW:.1f}" y="{PAD + row0 * LH + 1}" width="{(col1 - col0) * CW:.1f}" '
            f'height="{(row1 - row0) * LH}" fill="{C[color]}"/>')


def picture(col, row, cols, rows):
    """A picture in the pane (a gradient, as the test PNG draws)."""
    return (f'<defs><linearGradient id="g{col}{row}" x1="0" y1="0" x2="1" y2="1">'
            f'<stop offset="0" stop-color="#2a0fb0"/><stop offset="0.5" stop-color="#9a3fae"/>'
            f'<stop offset="1" stop-color="#f6f3a0"/></linearGradient>'
            f'<linearGradient id="h{col}{row}" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="#1f1f1f" stop-opacity="0"/><stop offset="1" stop-color="#3ce0a0" stop-opacity="0.55"/>'
            f'</linearGradient></defs>'
            f'<rect x="{PAD + col * CW:.1f}" y="{PAD + row * LH + 2}" width="{cols * CW:.1f}" height="{rows * LH - 4}" fill="url(#g{col}{row})"/>'
            f'<rect x="{PAD + col * CW:.1f}" y="{PAD + row * LH + 2}" width="{cols * CW:.1f}" height="{rows * LH - 4}" fill="url(#h{col}{row})"/>')


def draw(name, cols, rows, items):
    width, height = PAD * 2 + cols * CW, PAD * 2 + rows * LH
    doc = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" '
           f'viewBox="0 0 {width:.0f} {height:.0f}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" '
           f'font-size="{FS}"><rect width="100%" height="100%" rx="10" fill="{C["bg"]}"/>' + ''.join(items) + '</svg>')
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        f.write(doc)


def scene(name, left, pane, split, cols, rows, under=()):
    """left: transcript rows; pane: rows drawn right of the divider at column `split`; `under`: drawn first (bands, pictures)."""
    items = list(under)
    for r, parts in enumerate(left):
        items += runs(1, r, clip(parts, split - 2))
    items.append(vline(split, 0, rows - 2))
    for r, parts in enumerate(pane):
        items += runs(split + 2, r, clip(parts, cols - split - 3))
    items.append(hline(0, cols, rows - 2))
    items += runs(1, rows - 1, [('>', 'fg', 'b')])
    items.append(f'<rect x="{PAD + 3 * CW:.1f}" y="{PAD + (rows - 1) * LH + 2}" width="{CW:.1f}" height="16" fill="{C["fg"]}" opacity="0.7"/>')
    draw(name, cols, rows, items)


TRANSCRIPT = [
    [('> write up the release plan', 'fg', 'b')],
    [],
    [('⏺ ', 'fg'), ('Done. The plan is in ', 'fg'), ('docs/RELEASE.md↗', 'code'), (':', 'fg')],
    [('  three phases behind one flag, with', 'fg')],
    [('  the rollback steps at the end.', 'fg')],
    [],
    [('⏺ ', 'ok'), ('Write', 'fg', 'b'), ('(docs/RELEASE.md)', 'fg')],
    [('  ⎿  Wrote 31 lines to docs/RELEASE.md', 'dim')],
    [('  ⎿  ', 'dim'), ('~/app/docs/RELEASE.md↗', 'code')],
]

SPLIT, COLS, ROWS = 46, 124, 25
P = SPLIT + 2  # the pane's first text column
DOC = [
    [('⏺ ', 'fg'), ('RELEASE.md', 'fg', 'b'), ('  ~/app/docs · 31 lines · 3 sections', 'dim')],
    [('b: back · t: contents · f: find · q: close', 'dim')],
    [],
    [('Release plan', 'fg', 'u')],
    [],
    [('Three phases, each behind ', 'fg'), ('release.v2', 'code'), ('; turning it off is the rollback.', 'fg')],
    [],
    [('Phases', 'fg', 'b')],
    [],
    [('┌─────────┬────────────┬────────┐', 'dim')],
    [('│ ', 'dim'), ('Phase  ', 'fg', 'b'), (' │ ', 'dim'), ('Who       ', 'fg', 'b'), (' │ ', 'dim'), ('When  ', 'fg', 'b'), (' │', 'dim')],
    [('├─────────┼────────────┼────────┤', 'dim')],
    [('│ ', 'dim'), ('Canary ', 'fg'), (' │ ', 'dim'), ('5% of users', 'fg'), ('│ ', 'dim'), ('Oct 7 ', 'fg'), (' │', 'dim')],
    [('│ ', 'dim'), ('Ramp   ', 'fg'), (' │ ', 'dim'), ('50%       ', 'fg'), (' │ ', 'dim'), ('Oct 9 ', 'fg'), (' │', 'dim')],
    [('│ ', 'dim'), ('General', 'fg'), (' │ ', 'dim'), ('everyone  ', 'fg'), (' │ ', 'dim'), ('Oct 14', 'fg'), (' │', 'dim')],
    [('└─────────┴────────────┴────────┘', 'dim')],
    [],
    [('Turn the flag off, purge the CDN, then post in ', 'fg'), ('#release', 'code'), ('.', 'fg')],
    [],
    [], [], [], [], [],
]
under = [band(P - 1, COLS, 17, 18), picture(P, 19, 34, 4)]
pane_rows = [row for row in DOC]
pane_rows[17] = DOC[17] + [(' ' * 8, 'fg'), ('✎', 'dim')]
scene('pane.svg', TRANSCRIPT, pane_rows, SPLIT, COLS, ROWS, under)

# Editing: hover a block, ✎, say what to change; it goes to Claude as your prompt.
EDIT_LEFT = [
    [('> Edit lines 21-21 of `docs/RELEASE.md`', 'fg', 'b')],
    [('  in the section "Rollback", which begin', 'fg', 'b')],
    [('  "Turn the flag off, purge the CDN…": ', 'fg', 'b')],
    [('  make it a checklist', 'fg', 'b')],
    [],
    [('⏺ ', 'ok'), ('Update', 'fg', 'b'), ('(docs/RELEASE.md)', 'fg')],
    [('  ⎿  Updated docs/RELEASE.md with 4', 'dim')],
    [('     additions and 1 removal', 'dim')],
]
EDIT_PANE = [
    [('Rollback', 'fg', 'b')],
    [],
    [('╭' + '─' * 74 + '╮', 'claude')],
    [('│ ', 'claude'), ('> ', 'fg'), ('make it a checklist', 'fg'), ('▏', 'fg'), (' ' * 45, 'fg'), ('send', 'dim'), ('  │', 'claude')],
    [('╰' + '─' * 74 + '╯', 'claude')],
    [('  enter to send to Claude · cancel', 'dim')],
    [],
    [('Turn the flag off, purge the CDN, then post in ', 'fg'), ('#release', 'code'), ('.', 'fg')],
    [],
    [('Owners', 'fg', 'b')],
    [],
    [('Ana for the flag, Raj for the CDN.', 'fg')],
]
scene('edit.svg', EDIT_LEFT, EDIT_PANE, 44, 124, 14, [band(45, 124, 2, 8)])
