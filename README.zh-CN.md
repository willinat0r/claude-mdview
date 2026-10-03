<div align="center">

# mdview

**在 Claude Code 里直接读 Claude 提到的 markdown 文件。**<br>
单击对话里的 `.md` 路径，文件就在侧边 pane 里渲染出来：标题、表格、代码、可以继续点的链接，还有图片。

[![Version](https://img.shields.io/badge/version-0.1.0-d77757.svg)](https://github.com/xuanji86/claude-mdview/releases)
[![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-c678dd.svg)](https://code.claude.com/docs/en/plugins/mods/overview)
[![License: MIT](https://img.shields.io/badge/license-MIT-4eba65.svg)](LICENSE)

[English](README.md) · **中文**

</div>

## 为什么

Claude 常把计划、报告、笔记写成 markdown 文件，并在回复里给出路径。要读它就得离开会话，去编辑器或浏览器。**mdview** 是一个
[mod](https://code.claude.com/docs/en/plugins/mods/overview):把这些路径变成可点的链接，在对话旁边的 pane 里用 Claude Code
自带的 markdown 渲染器显示文件。

## 功能

| | |
| --- | --- |
| **可点的路径** | 回复里指向已存在文件的 `.md` 路径(反引号里的、裸写的、markdown 链接、和中文紧贴的都算)后面会带 `↗`,单击打开 pane;`path:12` 和 `path#标题` 会跳到对应位置。读写 markdown 文件的 Read/Write/Edit 工具行、以及你自己提到 markdown 文件的消息，下面会多一行 `⎿ 路径↗` |
| **pane** | 停靠在对话旁边，尽量占满终端宽度;Esc 关闭 |
| **跳转** | 文档里的链接直接在 pane 里打开(其他文件、`#锚点`、`:行号`);`← Back`(`b`)返回 |
| **目录和查找** | `Contents`(`t`)列出标题，点了就跳;`Find`(`f`)在包含该文字的小节之间跳 |
| **长文件** | 分页显示(`p` / `n`);被切开的长代码块会重新补上反引号，长表格会重复表头 |
| **图片** | 单独占一行的图片直接画出来(见[终端](#终端));夹在文字中间的变成 `🖼` 链接 |
| **HTML 和宽表格** | 常见 HTML(`<details>`、`<br>`、`<img>`、`<a>`、`<b>`、注释)转成 markdown;放不下的宽表格改成按行显示 |
| **编辑** | 每个小节右端的 `✎` 打开一个输入条：写下要怎么改，回车后作为你的消息发给 Claude(带上文件和这一节的行号),Claude 改完 pane 自动刷新。在 iTerm2 里，输入条上的 `vim ↗`(用你的 `$EDITOR`)会在当前会话旁边分栏打开编辑器并跳到这一节 |
| **其他文件** | 任何文本文件都按代码高亮显示，带行号 |
| **自动刷新** | Claude 写或改的文件立即刷新;外部修改最多 1.5 秒后刷新 |
| **`/md`** | `/md <路径>[#标题\|:行号]` 打开任意文件;不带参数则重新打开上一个 |
| **工具** | `mcp__mdview__show`:你让 Claude 打开某个文件时，它可以直接在 pane 里打开 |
| **Warp** | 单击路径不开 pane,而是在右侧分栏打开 Warp 自带的 Markdown 查看器(取决于 Warp 的“打开文件布局”设置):图片清晰、mermaid 能画、还能编辑。在 pane 里(`/md`)点 `Warp ↗`(`w`)效果一样 |

## 安装

需要 Claude Code **2.1.287 或更新**(mod 接口是抢先体验版;在 2.1.288 上测试),并使用 **fullscreen** 界面
(`~/.claude/settings.json` 里 `"tui": "fullscreen"`):只有这个模式下，单击事件才会传给 mod。

```bash
git clone https://github.com/xuanji86/claude-mdview ~/Desktop/claude-mdview
```

然后在 `~/.claude/settings.json` 里让每个会话都加载它(多个路径用 `:` 分隔):

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "~/Desktop/claude-mdview" } }
```

或者只对一个会话：`claude --plugin-dir ~/Desktop/claude-mdview`。

## 终端

| 终端 | 图片 |
| --- | --- |
| Ghostty、kitty | 终端自己画的真图(kitty 图片协议) |
| iTerm2 3.7+ | 同上，但要只对 iTerm2 设 `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1`,比如在 `~/.zshrc` 里加：`[[ $TERM_PROGRAM == iTerm.app ]] && export CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` |
| Warp 及其他 | 彩色半格色块(`▀`,每格两个像素):认得出，但不清晰;色块下面的 `↗ original` 用默认程序打开原图。在 Warp 里单击直接交给 Warp 自带的查看器 |

Claude Code 默认只在 kitty 和 Ghostty 里画图。iTerm2 3.7 支持 kitty 图片协议和它的 Unicode 占位符，所以强制开启可以用;Warp
还不支持占位符([warpdotdev/Warp#6210](https://github.com/warpdotdev/Warp/issues/6210)),强制开启会把界面搞乱。

非 PNG 格式的图片、以及所有用色块画的图片，都要经过 macOS 自带的 `sips` 处理;其他系统上只显示 alt 文字。

## 限制

- 做不到真全屏:mod 的 pane 只能停靠在对话旁边，对话区有最小宽度。
- 数学公式、mermaid、标题字号超出了终端文字渲染器的能力，按原文显示。
- 被 mdview 重画的回复(含可点路径的那些)复制时会带上 `⏺`。
- 单个 Markdown 元素最多 1 万字符，整个画面约 10 万字符，所以长文件要分页。
- mod 接口还是抢先体验版，Claude Code 升级后可能变化。

## 开发

```bash
claude plugin validate .
claude plugin test .
```

保存文件后，所有从这个目录加载它的会话都会自动重新加载。

## 许可证

[MIT](LICENSE)
