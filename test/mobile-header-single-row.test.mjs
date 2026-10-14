// 手机端会话头部单行化的结构守卫。
//
// 背景：宿主（dsh-client-ui-conversation）的会话头部在手机端仍是两行 grid、min-height 76px ——
// 第 1 行 .<F>_titleRow（面包屑标题已被本插件在移动端隐藏，只剩右侧 actions + 右上角图标组），
// 第 2 行 .<F>_tabs（对话 / 轨迹 / 上下文 / 编队）。本插件把标签行提到标题行同排
// （实测 433px：76px → 39px，省 37px），**仅手机端**，电脑端保持宿主原样。
//
// 本文件守的是六件最容易被顺手改坏的事：
//   1. 必须在 max-width:767px 内（电脑端一个像素都不许动）；
//   2. 必须留出间隔列 —— 右上角图标组自带 margin-inline-end:-16px，两行布局时它压的是
//      空白，单行化后会压到标签行上（桌面版实测重叠 16px）；间隔列被"简化"掉就会复发；
//   3. 标签行要常显（opacity:1）—— 皮肤的"悬停才显形"在触屏上没有真正的 hover；
//   4. 必须用 :has() 自限，且**不准用 display:none 把标签藏掉**（那是"少一行"的假实现）；
//   5. 只用网格列挪位置，不得动标签行自身的 border/padding（皮肤按盒内坐标画高亮药丸）；
//   6. 不得硬编码宿主哈希，必须走 __F_CONV__ 占位符。
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

/** 用当前宿主实测前缀渲染（wSkVaW = 实机实测的 CONV 前缀） */
const rendered = renderMobileStyles(MOBILE_STYLES_CSS, Object.fromEntries(
  Object.entries(FAMILY_SLOTS).map(([slot, spec]) => [slot, spec.known[0]]),
));

const headerRule = rendered.match(/header\[class\*="[A-Za-z0-9_-]+_header"\]:has\([^)]*\)\s*\{([^}]*)\}/);
const tabsRules = [...rendered.matchAll(/div\[class\*="[A-Za-z0-9_-]+_tabs"\]\s*\{([^}]*)\}/g)].map((m) => m[1]);

test('槽位表：CONV 必须收录 tabs 与 headerCorner（本改写直接依赖它们）', () => {
  for (const local of ['tabs', 'headerCorner']) {
    assert.ok(FAMILY_SLOTS.CONV.locals.includes(local), `CONV.locals 缺少 ${local}`);
  }
});

test('作用范围：必须限定在 max-width:767px 内（电脑端一个像素都不许动）', () => {
  assert.ok(RULE_INDEX > 0, '源码里找不到头部单行化规则（占位符写法被改？）');
  const blocks = enclosingBlocks(cssNoComment, RULE_INDEX);
  assert.equal(blocks.length, 1, `该规则应当只被一层块包住，实际：${JSON.stringify(blocks)}`);
  assert.match(blocks[0], /^@media\s*\(max-width:\s*767px\)$/,
    '必须限定 ≤767px：本次需求是"只改手机端页面"，电脑端要保持宿主两行原样');
  assert.doesNotMatch(blocks[0], /min-width/,
    '不得写成 min-width（那会落到桌面端——上一版就是这么错的，已被 revert）');
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
  const spacerPx = Number(((tracks[tracks.length - 2] || '').match(/^(\d+)px$/) || [])[1]);
  assert.ok(Number.isFinite(spacerPx), `倒数第二列必须是固定 px 间隔列，实际：${tracks[tracks.length - 2]}`);
  assert.ok(spacerPx >= 16,
    `间隔列必须 ≥16px：右上角图标组自带 margin-inline-end:-16px，两行布局时压的是空白，`
    + `单行化后会压到标签行上（桌面版实测重叠 16px）。当前 ${spacerPx}px`);
  assert.match(decls, /min-height:\s*0\s*!important/,
    '必须归零宿主的 min-height:76px——那 76px 就是"两行"的高度，省下 37px 全靠它');
});

test('标签行：落在第一行最后一列、常显、且不得用内部偏移挪位置', () => {
  assert.ok(tabsRules.length > 0, '必须有一条标签行规则');
  const all = tabsRules.join('\n');
  assert.match(all, /grid-column:\s*4\s*!important/, '标签行必须落在最后一列（间隔列之后）');
  assert.match(all, /grid-row:\s*1\s*!important/, '标签行必须落在第一行');
  assert.match(all, /margin:\s*0\s*!important/, '必须清掉标签行自带的 margin-top:10px');
  assert.match(all, /opacity:\s*1\s*!important/,
    '标签行必须常显：皮肤的"悬停才显形"在触屏上没有真正的 hover（实测 opacity 0，'
    + '点一下对话区才变 1），合并后不常显那一行看起来就是空的');
  assert.doesNotMatch(all, /(border|padding)-(left|inline-start)/,
    '不得用 border/padding 去挪标签行：皮肤按标签行的盒内坐标画高亮药丸，内部偏移会让药丸错位。'
    + '间距只能靠网格间隔列给');
});

test('自限与假实现：必须用 :has() 只作用于带标签行的头部，且不得把标签藏掉', () => {
  assert.match(headerRule[0], /:has\(/, '必须用 :has() 自限：新建会话页的 headerBlank/sessionless 不该被改动');
  const all = tabsRules.join('\n');
  assert.doesNotMatch(all, /display:\s*none/,
    '不允许用 display:none 把标签行藏掉——那是"少一行"的假实现，标签功能会一起消失');
  assert.doesNotMatch(headerRule[1], /display:\s*none/);
});

test('不硬编码宿主哈希：必须走 __F_CONV__ 占位符', () => {
  assert.match(source, /class\*="__F_CONV__tabs"/, '标签行选择器必须用 __F_CONV__ 占位符');
  assert.match(source, /class\*="__F_CONV__header"/, '头部选择器必须用 __F_CONV__ 占位符');
  assert.doesNotMatch(source, /class\*="(wSkVaW|Dc7zOa)_tabs"/,
    '不得硬编码宿主哈希：宿主换代重算哈希后这条改写会静默失效');
});

test('槽位表：JOBS 与 FILEOPEN 必须带中英双语锚点（英文宿主也要认得出）', () => {
  // 锚点返回的是闭包，正则捕获在闭包里，源码文本里看不到；
  // 所以这里用假 doc **实际调用**锚点函数来验（行为断言，比正则匹配源码可靠）。
  const fakeDoc = (label, classes) => ({
    querySelectorAll: () => [{ getAttribute: () => label, classList: classes }],
  });

  const cases = {
    JOBS: {
      local: 'trigger',
      classes: ['QsffPG_trigger'],
      hit: ['1 个后台任务运行中', '2 个后台任务运行中', '1 background job running', '2 background jobs running'],
    },
    FILEOPEN: {
      local: 'main',
      classes: ['OMoRSG_main'],
      hit: ['用 文件资源管理器 打开', '用 访达 打开', 'Open in File Explorer'],
    },
  };

  for (const [slot, spec] of Object.entries(cases)) {
    const family = FAMILY_SLOTS[slot];
    assert.ok(family?.locals?.includes(spec.local), `缺少 ${slot} 槽位或本地名 ${spec.local}`);
    assert.ok(family.known?.length >= 1, `${slot} 必须带 known 基线（锚点失配时的兜底）`);
    const find = family.anchors?.[0]?.find;
    assert.equal(typeof find, 'function', `${slot} 必须带锚点（否则只能靠会过期的基线）`);
    for (const label of spec.hit) {
      assert.ok(find(fakeDoc(label, spec.classes)), `${slot} 锚点认不出「${label}」（中英双语都要认得出）`);
    }
    assert.equal(find(fakeDoc('打开右侧边栏', ['wSkVaW_corner'])), null, `${slot} 锚点不得误命中无关按钮`);
  }
});

test('可选槽位：JOBS / FILEOPEN 缺席不得把 compat 拖成 partial', () => {
  assert.equal(FAMILY_SLOTS.JOBS.optional, true, 'JOBS 必须标 optional（没有后台任务时它不渲染）');
  assert.equal(FAMILY_SLOTS.FILEOPEN.optional, true, 'FILEOPEN 必须标 optional（无本地路径时它不渲染）');
  const src = read('client/host-families.js');
  assert.match(src, /if \(!spec\.optional\) unverified\.push\(slot\)/,
    'optional 槽位必须排除在 unverified 之外，否则 compat 会恒为 partial');
  assert.match(src, /if \(!spec\.optional\) missing\.push\(slot\)/,
    'optional 槽位必须排除在 missing 之外');
});

test('手机端隐藏后台任务与「用文件资源管理器打开」两个按钮', () => {
  const hideIdx = cssNoComment.indexOf('button[class*="__F_JOBS__trigger"]');
  assert.ok(hideIdx > 0, '源码里找不到隐藏规则（占位符写法被改？）');
  const blocks = enclosingBlocks(cssNoComment, hideIdx);
  assert.equal(blocks.length, 1, `隐藏规则应当只被一层块包住，实际：${JSON.stringify(blocks)}`);
  assert.match(blocks[0], /^@media\s*\(max-width:\s*767px\)$/,
    '隐藏必须限定手机端：电脑端要保留这两个按钮（后台任务/在文件资源管理器中打开在桌面是有用的）');

  const hideRule = rendered.match(
    /button\[class\*="[A-Za-z0-9_-]+_trigger"\],\s*button\[class\*="[A-Za-z0-9_-]+_main"\],\s*\[class\*="[A-Za-z0-9_-]+_menuAnchor"\],\s*\[class\*="[A-Za-z0-9_-]+_split"\]\s*\{([^}]*)\}/,
  );
  assert.ok(hideRule, '隐藏规则必须覆盖 JOBS__trigger + FILEOPEN 的 main/menuAnchor/split 四件');
  assert.match(hideRule[1], /display:\s*none\s*!important/, '必须是 display:none !important');
  // menuAnchor/split 是"整组隐藏"的关键：只藏按钮会在头部残留一条 1px 竖线（实测）
  assert.ok(FAMILY_SLOTS.FILEOPEN.locals.includes('menuAnchor'), 'FILEOPEN 必须收录 menuAnchor（外层包裹）');
  assert.ok(FAMILY_SLOTS.FILEOPEN.locals.includes('split'), 'FILEOPEN 必须收录 split（1px 分隔线）');

  assert.doesNotMatch(source, /class\*="(QsffPG|OMoRSG)_/,
    '不得硬编码这两个包的哈希：必须走 __F_JOBS__ / __F_FILEOPEN__ 占位符（宿主换代重算哈希）');
});

test('产物同步：client.js 里必须带上该改写（否则跑 npm run build:client）', () => {
  assert.match(rawBundle, /_tabs"\]/, '产物缺少标签行规则，请运行 npm run build:client');
  assert.match(rawBundle, /grid-column: 4 !important/, '产物缺少标签列排布，请运行 npm run build:client');
});
