// 飞书 Markdown 归一化测试（表格必须与相邻块级元素用空行分隔，官方文档硬性要求）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeFeishuMarkdown,
  hasMarkdownTable,
  splitMarkdownForCards,
  buildMarkdownCard,
} from '../lib/feishu/markdown.js'
import { helpText } from '../lib/platform/session-catalog.js'

test('[飞书 Markdown] 标题后紧跟表格：自动补空行', () => {
  const input = '### 会话控制\n| 指令 | 说明 |\n| --- | --- |\n| /help | 帮助 |'
  const output = normalizeFeishuMarkdown(input)
  assert.equal(output, '### 会话控制\n\n| 指令 | 说明 |\n| --- | --- |\n| /help | 帮助 |')
})

test('[飞书 Markdown] 表格后紧跟正文：同样补空行', () => {
  const input = '| a | b |\n| --- | --- |\n尾注'
  const output = normalizeFeishuMarkdown(input)
  assert.equal(output, '| a | b |\n| --- | --- |\n\n尾注')
})

test('[飞书 Markdown] 归一化幂等，且不动已有空行', () => {
  const already = '### 标题\n\n| a |\n| --- |\n| 1 |\n\n尾注'
  assert.equal(normalizeFeishuMarkdown(already), already)
  assert.equal(normalizeFeishuMarkdown(normalizeFeishuMarkdown(already)), already)
})

test('[飞书 Markdown] 围栏代码块内的竖线不当表格处理', () => {
  const input = '```\na | b\n--- | ---\n```\n正文'
  assert.equal(normalizeFeishuMarkdown(input), input)
})

test('[飞书 Markdown] 多行表格不被拆分（连续表格行之间不插空行）', () => {
  const input = '### t\n| a |\n| --- |\n| 1 |\n| 2 |'
  const output = normalizeFeishuMarkdown(input)
  assert.equal(output.split('\n').filter((l) => l === '').length, 1, '只应补一处空行')
})

test('[飞书 Markdown] 引用块后紧跟正文：补空行；块内连续行不拆', () => {
  assert.equal(normalizeFeishuMarkdown('> 第一行\n> 第二行\n正文'), '> 第一行\n> 第二行\n\n正文')
  assert.equal(normalizeFeishuMarkdown('> 单行引用\n\n正文'), '> 单行引用\n\n正文')
})

test('[飞书 Markdown] 围栏代码块内的引用符不当块级元素处理', () => {
  const input = '```\n> not a quote\ntext\n```'
  assert.equal(normalizeFeishuMarkdown(input), input)
})

test('[飞书 Markdown] /help 帮助文本的 3 张表格全部得到修复', () => {
  const raw = helpText()
  const lines = raw.split('\n')
  const brokenBefore = lines.filter((line, i) => /^\|/.test(line) && i > 0 && lines[i - 1].trim() !== '' && !/^\|/.test(lines[i - 1])).length
  assert.ok(brokenBefore >= 3, '原始帮助文本确实存在缺空行的表格（本次回归的根因）')

  const fixedLines = normalizeFeishuMarkdown(raw).split('\n')
  const brokenAfter = fixedLines.filter((line, i) => /^\|/.test(line) && i > 0 && fixedLines[i - 1].trim() !== '' && !/^\|/.test(fixedLines[i - 1])).length
  assert.equal(brokenAfter, 0, '归一化后不得再有缺空行的表格')
})

test('[飞书 Markdown] 表格识别：跳过代码块，普通文本不算表格', () => {
  assert.equal(hasMarkdownTable('## 标题\n正文'), false)
  assert.equal(hasMarkdownTable('```\na | b\n| --- |\n```'), false)
  assert.equal(hasMarkdownTable('### 标题\n| a | b |\n| --- | --- |'), true)
})

test('[飞书 Markdown] 卡片分片：表格跨片自动补表头，且不超上限', () => {
  const row = (i) => `| ${i} | ${'x'.repeat(50)} |`
  const long = ['### 会话列表', '| 编号 | 标题 |', '| --- | --- |', ...Array.from({ length: 30 }, (_, i) => row(i))].join('\n')

  const chunks = splitMarkdownForCards(long, 500)
  assert.ok(chunks.length > 1, '超长表格必须分片')
  assert.ok(chunks.every((c) => c.includes('| 编号 | 标题 |') && c.includes('| --- | --- |')), '每片都要有表头')
  assert.ok(chunks.every((c) => c.length <= 520), '分片长度需在上限附近（表头补偿允许少量超出）')
  assert.equal(chunks.join('\n').includes('| 29 |'), true, '内容不丢失')
})

test('[飞书 Markdown] 卡片分片：围栏代码块跨片自动补 ```', () => {
  const code = ['说明：', '```js', ...Array.from({ length: 40 }, (_, i) => `console.log(${i}) // ${'y'.repeat(30)}`), '```'].join('\n')
  const chunks = splitMarkdownForCards(code, 400)
  assert.ok(chunks.length > 1)
  assert.ok(chunks.every((c) => c.split('```').length % 2 !== 0), '每片围栏都要闭合（``` 数量为偶数倍）')
})

test('[飞书 Markdown] 卡片结构：JSON 2.0 + markdown 元素', () => {
  const card = buildMarkdownCard('| a |\n| --- |')
  assert.equal(card.schema, '2.0')
  assert.equal(card.body.elements[0].tag, 'markdown')
  assert.equal(card.body.elements[0].content, '| a |\n| --- |')
})
