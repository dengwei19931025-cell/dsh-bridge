// 飞书 Markdown 发送前的归一化（post 的 `md` 元素 / 卡片的 markdown 元素共用同一套解析规则）
//
// 官方依据：「发送消息内容结构」文档（docs/dev/lark-sdk/official-message-content.md）
//   - `md` 标签支持 CommonMark 0.31 + GFM，**包括表格**；
//   - 但明确要求：**表格前后必须使用 `\n\n` 与其他块级元素分隔**；
//     "如果只使用单个 `\n`，后续内容可能被解析为表格的续行"；
//   - 同样要求：**引用块后面如需接其他块级元素，必须使用 `\n\n` 分隔**。
//
// 实测：本插件的 `/help`（`### 标题\n| 指令 | …`）正是"标题后紧跟表格、只有一个 \n"的写法，
// 结果表格整块不显示、只剩标题（issue 反馈截图实证）。此处统一补齐空行，避免各调用点各修一遍。

/**
 * 归一化飞书 Markdown：补齐官方要求的块级元素空行分隔。
 * - 表格：前后都要空行（否则表格会被解析异常，实测会整块丢失）
 * - 引用块：后面接其他块级元素时空行分隔
 * - 幂等：已有空行时不重复插入
 * - 跳过围栏代码块内的内容（代码里的 `|` / `>` 不算块级元素）
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeFeishuMarkdown(text) {
  const lines = String(text ?? '').split('\n')
  const out = []
  let inFence = false
  let prevWasTable = false
  let prevWasQuote = false

  for (const line of lines) {
    const isFence = /^\s*(```|~~~)/.test(line)
    const isTable = !inFence && /^\s{0,3}\|/.test(line)
    const isQuote = !inFence && /^\s{0,3}>/.test(line)

    if (isTable && !prevWasTable) {
      // 表格开始：与上一个块级元素之间必须有空行
      const last = out[out.length - 1]
      if (last !== undefined && last.trim() !== '') out.push('')
    } else if (!isTable && prevWasTable && line.trim() !== '') {
      // 表格结束：与后续块级元素之间同样要有空行
      out.push('')
    } else if (!isQuote && prevWasQuote && line.trim() !== '') {
      // 引用块结束：后面接其他块级元素必须有空行
      out.push('')
    }

    out.push(line)
    if (isFence) inFence = !inFence
    prevWasTable = isTable
    prevWasQuote = isQuote
  }

  return out.join('\n')
}

/**
 * 内容里是否含 Markdown 表格（跳过围栏代码块）。
 * 用于选择渲染器：表格走交互卡片（卡片渲染器对表格兼容性更好，见下方注释），其余走 post 富文本。
 */
export function hasMarkdownTable(text) {
  let inFence = false
  for (const line of String(text ?? '').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue }
    if (!inFence && /^\s{0,3}\|/.test(line)) return true
  }
  return false
}

/**
 * 按"单条消息上限"把 Markdown 切成多张卡片的内容片。
 *
 * 与 SDK 的 post 分片（`splitWithCodeFences`）目标一致，但额外保证：
 *   - **表格跨片时自动补表头**（表头 + 分隔行），否则续片会被渲染成普通文本；
 *   - 围栏代码块跨片时自动补 ```（与 SDK 行为一致，代码块不被截断语义）；
 *   - 单行超长时不切在行中间（宁可略超上限，也不破坏结构）。
 *
 * @param {string} text
 * @param {number} [limit] 单张卡片的字符上限
 * @returns {string[]}
 */
export function splitMarkdownForCards(text, limit = 2000) {
  const source = String(text ?? '')
  if (source.length <= limit) return [source]

  const lines = source.split('\n')
  const chunks = []
  let buf = []
  let size = 0
  let inFence = false
  let fenceLang = ''
  let tableHeader = null
  let lastWasRow = false

  const append = (line) => {
    size += line.length + (buf.length > 0 ? 1 : 0)
    buf.push(line)
  }
  const flush = () => {
    if (buf.length === 0) return
    chunks.push(buf.join('\n') + (inFence ? '\n```' : ''))
    buf = []
    size = 0
    if (inFence) append('```' + fenceLang)
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const isFence = /^\s*(```|~~~)/.test(line)
    const isRow = !inFence && /^\s{0,3}\|/.test(line)

    if (isRow && !lastWasRow) {
      // 表格起始：本行 + 下一行（分隔行）记为表头
      const next = lines[i + 1] ?? ''
      tableHeader = /^\s{0,3}\|[\s:|-]+\|?\s*$/.test(next) && next.includes('-') ? [line, next] : null
    }
    if (!isRow && !isFence && line.trim() !== '') tableHeader = null

    if (buf.length === 0 && isRow && lastWasRow && tableHeader) {
      append(tableHeader[0])
      append(tableHeader[1])
    }

    if (size + line.length + (buf.length > 0 ? 1 : 0) > limit && buf.length > 0) {
      flush()
      if (isRow && tableHeader) {
        append(tableHeader[0])
        append(tableHeader[1])
      }
    }

    append(line)
    if (isFence) {
      inFence = !inFence
      if (inFence) fenceLang = line.replace(/^\s*(```|~~~)/, '')
    }
    lastWasRow = isRow
  }
  flush()
  return chunks
}

/** 构造"Markdown 单元素"交互卡片（与重构前的卡片结构一致） */
export function buildMarkdownCard(markdownText) {
  return {
    schema: '2.0',
    config: { wide_screen_mode: true, update_multi: true },
    body: { elements: [{ tag: 'markdown', content: String(markdownText ?? '') }] },
  }
}
