// 会话头部单行化的结构守卫。
//
// 背景：宿主（dsh-client-ui-conversation）把会话头部做成两行 grid ——
// 第 1 行 .<F>_titleRow（标题 + 模式 + 后台任务 + 右上角图标组），
// 第 2 行 .<F>_tabs（对话 / 轨迹 / 上下文 / 编队），min-height 76px。
// 本插件把标签行提到标题行同排（实测 77px → 51px，仅在 ≥768px 生效）。
//
// 本文件守的是四件最容易被顺手改坏的事：
//   1. 作用范围必须限定 ≥768px（手机宽度下标签行 198px 会把标题挤没）；
//   2. 必须留出间隔列 —— 右上角图标组自带 margin-inline-end:-16px，两行布局时它压的是
//      空白，单行化后会压到标签行上（实测重叠 16px）；间隔列被"简化"掉就会复发；
//   3. 必须用 :has() 自限，且**不准用 display:none 把标签藏掉**（那是"少一行"的假实现）；
//   4. 不得硬编码宿主哈希，必须走 __F_CONV__ 占位符。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOBILE_STYLES_CSS } from '../client/mobile-styles.js';
import { FAMILY_SLOTS, renderMobileStyles } from '../client/host-families.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(resolve(repoRoot, f), 'utf8');

const source = read('client/mobile-styles.js');
const rawBundle = read('client/client.js');

/** 去掉注释后的 CSS（注释里出现选择器片段属正常，不能拿它做结构判定） */
const cssNoComment = MOBILE_STYLES_CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** 下标处被哪些块（@media 等）包着：返回外层块的前导文本栈 */
function enclosingBlocks(css, index) {
  const stack = [];
  let prelude = '';
  for (let i = 0; i < index; i++) {
    const ch = css[i];
    if (ch === '{') { stack.push(prelude.trim()); prelude = ''; }
    else if (ch === '}') { stack.pop(); prelude = ''; }
    else prelude += ch;
  }
  return stack;
}

const RULE_ANCHOR = 'header[class*="__F_CONV__header"]:has(';
const RULE_INDEX = cssNoComment.indexOf(RULE_ANCHOR);

/** 用当前宿主实测前缀渲染（wSkVaW = 这次实测的 CONV 前缀） */
const rendered = renderMobileStyles(MOBILE_STYLES_CSS, Object.fromEntries(
  Object.entries(FAMILY_SLOTS).map(([slot, spec]) => [slot, spec.known[0]]),
));

const headerRule = rendered.match(/header\[class\*="[A-Za-z0-9_-]+_header"\]:has\([^)]*\)\s*\{([^}]*)\}/);
const tabsRule = rendered.match(/div\[class\*="[A-Za-z0-9_-]+_tabs"\]\s*\{([^}]*)\}/);

test('槽位表：CONV 必须收录 tabs 与 headerCorner（本改写直接依赖它们）', () => {
  for (const local of ['tabs', 'headerCorner']) {
    assert.ok(FAMILY_SLOTS.CONV.locals.includes(local), `CONV.locals 缺少 ${local}`);
  }
});

test('作用范围：必须限定在 min-width:768px 内，不得波及手机宽度', () => {
  assert.ok(RULE_INDEX > 0, '源码里找不到头部单行化规则（占位符写法被改？）');
  const blocks = enclosingBlocks(cssNoComment, RULE_INDEX);
  assert.equal(blocks.length, 1, `该规则应当只被一层块包住，实际：${JSON.stringify(blocks)}`);
  assert.match(blocks[0], /^@media\s*\(min-width:\s*768px\)$/,
    '必须限定 ≥768px：390px 下内容区仅 342px，而标签行本身 198px，单行化会把标题挤没');
});

test('规则存在：头部补出「间隔列 + 标签列」，标签行被提到第一行最后一列', () => {
  assert.ok(headerRule, '必须有一条 :has() 自限的头部规则');
  const decls = headerRule[1];
  const cols = decls.match(/grid-template-columns:\s*([^;]+);/);
  assert.ok(cols, '头部规则必须重写 grid-template-columns');
  const tracks = cols[1].replace(/!important/, '').trim().split(/\s+/);
  assert.deepEqual(tracks.slice(0, 2), ['auto', 'minmax(0,'],
    `前两列必须保持宿主的 auto / minmax(0,1fr)，实际：${cols[1]}`);
  // 关键：倒数第二列是间隔列，必须能吸收 headerCorner 的 -16px 外边距
  const spacer = tracks[tracks.length - 2];
  const spacerPx = Number((spacer.match(/^(\d+)px$/) || [])[1]);
  assert.ok(Number.isFinite(spacerPx), `倒数第二列必须是固定 px 间隔列，实际：${spacer}`);
  assert.ok(spacerPx >= 16,
    `间隔列必须 ≥16px：右上角图标组自带 margin-inline-end:-16px，两行布局时压的是空白，`
    + `单行化后会压到标签行上（实测重叠 16px）。当前 ${spacerPx}px`);
  assert.match(decls, /min-height:\s*0\s*!important/,
    '必须归零宿主的 min-height:76px（那是为两行留的高度）');
  assert.match(decls, /padding-bottom:\s*10px\s*!important/,
    '必须补回 padding-bottom：宿主只在"无标签行"时给这一条，我们有标签行所以要显式加回');

  assert.ok(tabsRule, '必须有一条标签行规则');
  assert.match(tabsRule[1], /grid-column:\s*4\s*!important/, '标签行必须落在最后一列（间隔列之后）');
  assert.match(tabsRule[1], /grid-row:\s*1\s*!important/, '标签行必须落在第一行');
  assert.match(tabsRule[1], /margin:\s*0\s*!important/, '必须清掉标签行自带的 margin-top:10px');
  assert.doesNotMatch(tabsRule[1], /(border|padding)-(left|inline-start)/,
    '不得用 border/padding 去挪标签行：皮肤 dsh-claude-style 按标签行的盒内坐标画高亮药丸，'
    + '内部偏移会让药丸错位。间距只能靠网格间隔列给');
});

test('自限：必须用 :has() 只作用于带标签行的头部，且不得把标签藏掉', () => {
  assert.match(headerRule[0], /:has\(/, '必须用 :has() 自限：新建会话页的 headerBlank/sessionless 不该被改动');
  assert.doesNotMatch(tabsRule[1], /display:\s*none/,
    '不允许用 display:none 把标签行藏掉——那是"少一行"的假实现，标签功能会一起消失');
  assert.doesNotMatch(headerRule[1], /display:\s*none/);
});

test('不硬编码宿主哈希：必须走 __F_CONV__ 占位符', () => {
  assert.match(source, /class\*="__F_CONV__tabs"/, '标签行选择器必须用 __F_CONV__ 占位符');
  assert.match(source, /class\*="__F_CONV__header"/, '头部选择器必须用 __F_CONV__ 占位符');
  assert.doesNotMatch(source, /class\*="(wSkVaW|Dc7zOa)_tabs"/,
    '不得硬编码宿主哈希：宿主换代重算哈希后这条改写会静默失效');
});

test('产物同步：client.js 里必须带上该改写（否则跑 npm run build:client）', () => {
  assert.match(rawBundle, /_tabs"\]/, '产物缺少标签行规则，请运行 npm run build:client');
  assert.match(rawBundle, /grid-column: 4 !important/, '产物缺少标签列排布，请运行 npm run build:client');
});
