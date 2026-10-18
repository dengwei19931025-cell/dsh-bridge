// 手机端输入卡片「底部工具行」的结构守卫。
//
// 背景（真实回归，用户在 iOS 上报："模型思考强度不在底下这一栏，跑到别的地方去了"）：
// 底部工具行 = 左侧 [权限模式胶囊 Read/Edit/Auto/Yolo + 加号] + 右侧 [模型 | 思考强度 | 发送]。
// 右侧那组属于宿主的 <F>_trailing，而"模型 / 思考强度"两个按钮装在宿主的
// <F>_standardControls 容器里（**不是**本插件的元素）。
//
// 实测（433/390/375/360/320px + 禁用本插件样式的对照）：
//   · 宿主/皮肤原样：左侧 tools 是 flex:0 0 auto（不让位），右侧 trailing 可收缩 →
//     standardControls 被压到 0–20px，模型标签被压成 16px；而思考强度按钮是固定 33px
//     压不下去，于是**溢出到输入卡片之外**（320px 实测卡片右缘 302，强度按钮到 341），
//     320/390/430 三个宽度都会与发送按钮区域相交。这是宿主的既有问题，我们只是受害者。
//   · 本插件此前的规则（trailing 可收缩）在 ≥430px 恰好掩盖了它，窄屏照样复现。
//
// 修法：右侧 trailing 绝不收缩（0 0 auto + min-width:max-content），把"让位"交给
// 左侧 tools/modes（可收缩 + 横滑，滚动条隐藏）。这样**无论左边量出多宽，思考强度
// 都不会被顶出输入卡片**。
//
// 本文件守的是三件最容易被顺手改坏的事：
//   1. 右侧 trailing 必须不收缩（改回 flex:1 1 auto / min-width:0 就会复发）；
//   2. 左侧 tools/modes 必须可收缩且 modes 能横滑（否则窄屏整体溢出卡片左缘）；
//   3. 必须仍在 max-width:767px 内（电脑端一个像素都不许动）。
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
const clientIndex = read('client/index.js');   // 补偿函数在这里（client/index.js）
const rawBundle = read('client/client.js');
const cssNoComment = MOBILE_STYLES_CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** 用当前宿主实测前缀渲染（uV2eYG = 实机实测的 COMPOSER 前缀） */
const composerHash = FAMILY_SLOTS.COMPOSER.known.find((h) => h === 'uV2eYG') || FAMILY_SLOTS.COMPOSER.known[0];
const rendered = renderMobileStyles(MOBILE_STYLES_CSS, Object.fromEntries(
  Object.entries(FAMILY_SLOTS).map(([slot, spec]) => [slot, spec.known[0]]),
));

const ruleFor = (local) => {
  const m = rendered.match(new RegExp(`div\\[class\\*="[A-Za-z0-9_-]+_${local}"\\]\\s*\\{([^}]*)\\}`));
  return m ? m[1] : null;
};
const trailing = ruleFor('trailing');
const tools = ruleFor('tools');
const modes = ruleFor('modes');

test('槽位表：COMPOSER 必须收录 trailing / tools / modes（本修正直接依赖它们）', () => {
  for (const local of ['trailing', 'tools', 'modes']) {
    assert.ok(FAMILY_SLOTS.COMPOSER.locals.includes(local), `COMPOSER 必须收录 ${local}`);
  }
});

test('槽位表：JOBS 与 SUBAGENT 是两个宿主包，必须分别登记（2026-10-17 用户截图）', () => {
  // 此前只登记了 JOBS（后台任务），用户截图里漏出来的是**子代理**按钮 ——
  // 实测 button.ZKlsPq_trigger aria-label="1 个子智能体"，与 JOBS 的 QsffPG 完全不同。
  // 两者挨在同一条头部工具带里，靠猜"是哪个包"会漏（已经漏过一次）。
  assert.ok(FAMILY_SLOTS.JOBS, '必须登记 JOBS（后台任务）');
  assert.ok(FAMILY_SLOTS.SUBAGENT, '必须登记 SUBAGENT（子代理）—— 后台任务 ≠ 子代理');
  assert.notEqual(FAMILY_SLOTS.JOBS.known[0], FAMILY_SLOTS.SUBAGENT.known[0],
    '两个槽位的类名前缀不能相同（相同说明错把两个包当成了一个）');
  assert.ok(FAMILY_SLOTS.SUBAGENT.optional, '子代理缺席是常态（没有子代理时不渲染）');
});

test('手机端必须隐藏「子智能体」与「后台任务」两个头部按钮', () => {
  // ⚠️ 断言对象是 **源码模板**（MOBILE_STYLES_CSS），不是渲染后的 CSS：
  // 槽位占位符 __F_XXX__ 要到运行时才替换成真实哈希（渲染后会变成 ZKlsPq_trigger 等）。
  for (const slot of ['SUBAGENT', 'JOBS']) {
    const re = new RegExp(`button\\[class\\*="__F_${slot}__trigger"\\][^{]*\\{[^}]*display:\\s*none\\s*!important`);
    assert.match(MOBILE_STYLES_CSS, re, `必须有一条 button[class*="__F_${slot}__trigger"] { display:none !important }`);
  }
  // 子代理按钮的外层包裹也要一起藏，否则头部留一段空隙
  assert.match(MOBILE_STYLES_CSS, /\[class\*="__F_SUBAGENT__root"\][^{]*\{[^}]*display:\s*none\s*!important/,
    '必须连 __F_SUBAGENT__root 一起藏（外层包裹，否则留空隙）');
  // 反向守卫：选择器里不得硬编码子代理的类名哈希（哈希随宿主版本变）。
  // 注意只查**选择器部分**（剔除注释）—— 注释里记录实测类名是有意为之的文档。
  assert.doesNotMatch(cssNoComment, /ZKlsPq/, '选择器里不得硬编码子代理哈希，必须走槽位');
});

test('长模型名不得把「思考强度」顶出卡片（2026-10-16 回归修正）', () => {
  // 真因：皮肤把「思考强度」做成 body 下的 position:fixed 元素，按「模型按钮右缘 + 2px」
  // 定位。所以"模型名越长 → 强度按钮越靠右"。旧写法 trailing{0 0 auto; min-width:max-content}
  // 虽保住了强度按钮不被压扁，却也保住了长模型名不被截断 → 390px 实测余量只剩 1px。
  // 新不变量：**强度 / 发送 保持原尺寸，模型名才是唯一让位者**。
  assert.ok(trailing, '必须有一条 trailing 规则');
  assert.match(trailing, /flex:\s*0 1 auto\s*!important/,
    'trailing 必须允许收缩（0 1 auto）：否则长模型名顶不动，fixed 的强度按钮会被顶出卡片');
  assert.match(trailing, /min-width:\s*0\s*!important/, 'trailing 必须 min-width:0，否则收缩无从发生');
  assert.match(trailing, /justify-content:\s*flex-end\s*!important/, '右侧组必须右对齐');

  // 模型按钮必须限宽 + 省略号（可见的是皮肤自绘的 .dsh-claude-model-btn，不是宿主槽位）
  const skinBtn = cssNoComment.match(/\.dsh-claude-model-btn\s*\{([^}]*)\}/);
  assert.ok(skinBtn, '必须直接限宽皮肤自绘的模型按钮（限宿主槽位无效，实测过）');
  assert.match(skinBtn[1], /max-width:\s*\d+px\s*!important/, '模型按钮必须有 max-width 上限');
  assert.match(skinBtn[1], /overflow:\s*hidden\s*!important/, '配合限宽裁掉多余内容');
  const label = cssNoComment.match(/\.dsh-claude-model-btn-label\s*\{([^}]*)\}/);
  assert.ok(label, '必须有 .dsh-claude-model-btn-label 规则');
  assert.match(label[1], /text-overflow:\s*ellipsis\s*!important/, '模型名必须走省略号');
  assert.match(label[1], /white-space:\s*nowrap\s*!important/, '模型名必须单行不换行');
  assert.match(label[1], /overflow:\s*hidden\s*!important/, '配合 ellipsis 生效');

  // 宿主槽位的旧 180px 上限要跟着降到同一量级，避免两套规则打架
  const modelRoot = ruleFor('MODEL__root') || cssNoComment.match(/__F_MODEL__root[^{]*\{([^}]*)\}/)?.[1];
  if (modelRoot) assert.doesNotMatch(modelRoot, /max-width:\s*180px/, '槽位 180px 上限已过时，别留两套打架的规则');
});

test('左侧权限区负责让位：可收缩 + 可横滑（否则窄屏整体溢出）', () => {
  assert.ok(tools && modes, '必须各有一条规则');
  assert.match(tools, /flex:\s*1 1 auto\s*!important/,
    'tools 必须可收缩：右侧已经不让位了，左侧必须让位，否则整行溢出卡片');
  assert.match(tools, /min-width:\s*0\s*!important/, 'tools 必须 min-width:0 才能真正收缩');
  // ⚠️ 2026-10-17 修正：tools 从 overflow:hidden 改为 overflow-x:auto。
  // 原因（用户截图「完全权限」被挤扁）：hidden 会把 modes 的溢出内容一刀切掉，
  // 而权限胶囊是 flex:0 1 auto，被压窄后 label 的 nowrap+ellipsis 只能裁字。
  // 改 auto 后放不下的部分靠 tools 自己横滑（滚动条已隐藏），文字不再被裁。
  assert.match(tools, /overflow-x:\s*auto\s*!important/,
    'tools 必须 overflow-x:auto：hidden 会把权限胶囊的溢出文字一刀切掉（实测「完全权限」被裁）');
  assert.doesNotMatch(tools, /overflow:\s*hidden\s*!important/,
    'tools 不得再用 overflow:hidden（那正是「完全权限」显示不完全的根因）');
  assert.match(tools, /scrollbar-width:\s*none\s*!important/, 'tools 横滑不应露出滚动条');
  assert.match(rendered, /_tools"\]::-webkit-scrollbar\s*\{[^}]*display:\s*none\s*!important/,
    'tools 的 WebKit 滚动条也要隐藏（iOS Safari 用的就是这条）');
  assert.match(modes, /flex:\s*1 1 auto\s*!important/, 'modes 必须可收缩');
  assert.match(modes, /min-width:\s*0\s*!important/, 'modes 必须 min-width:0');
  assert.match(modes, /overflow-x:\s*auto\s*!important/,
    'modes 必须能横滑：胶囊放不下时让用户滑得到，而不是把它们顶出行外');
  assert.match(modes, /scrollbar-width:\s*none\s*!important/, '横滑不应露出滚动条');
  assert.match(rendered, /_modes"\]::-webkit-scrollbar\s*\{[^}]*display:\s*none\s*!important/,
    'WebKit 也要隐藏滚动条（iOS Safari 用的就是这条）');
});

// ── 权限胶囊必须显示完整（2026-10-17 用户截图：「完全权限」被挤扁）────────────────
//
// 实测（390px，切到「完全权限」档）：label width=52px，而 4 个汉字 @13px 需要约 52px
// —— 正好卡在边界，字被裁/挤扁，用户看到四字挤成一团、认不出来。
// 根因链：右侧（模型 + Medium）吃空间 → tools 被压 → modes scrollW=64 而 clientW=51
// → 胶囊（flex:0 1 auto）被压窄 → label 的 nowrap+ellipsis 无处可去只能裁字。
//
// 修法三层：胶囊 flex:0 0 auto + min-width:max-content；label 取消省略号；
// tools 改 overflow-x:auto（让溢出靠横滑而不是被裁）。
// 压力验收（320px + 8 字超长档位名）：胶囊 129px 完整显示，整行无控件越出卡片右缘。
test('权限胶囊必须显示完整：不被压窄、文字不被裁', () => {
  // ① 胶囊本身绝不被压窄
  const bodiesOf = (cls) => {
    const out = [];
    for (const m of MOBILE_STYLES_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (m[1].includes(`.${cls}`)) out.push(m[2]);
    }
    return out.join('\n');
  };
  const permBtn = bodiesOf('dsh-claude-perm-btn');
  assert.ok(permBtn.trim(), '必须存在 .dsh-claude-perm-btn 规则');
  assert.match(permBtn, /flex:\s*0 0 auto\s*!important/,
    '权限胶囊必须 flex:0 0 auto —— 0 1 auto 会被压窄，文字随之被裁');
  assert.match(permBtn, /min-width:\s*max-content\s*!important/,
    '权限胶囊必须 min-width:max-content：按内容定宽，不参与压缩');
  // 外层容器同样不能压它（胶囊是它的子元素）
  const permContainer = bodiesOf('dsh-claude-perm-container');
  assert.ok(permContainer.trim(), '必须存在 .dsh-claude-perm-container 规则');
  assert.match(permContainer, /flex:\s*0 0 auto\s*!important/, '容器也必须 0 0 auto');
  assert.match(permContainer, /min-width:\s*max-content\s*!important/, '容器也必须 max-content');
  // ② label 不能走省略号（省略号 = 用户看到的就是残缺文字）
  const permLabel = bodiesOf('dsh-claude-perm-label');
  assert.ok(permLabel.trim(), '必须存在 .dsh-claude-perm-label 规则');
  assert.match(permLabel, /text-overflow:\s*clip\s*!important/,
    'label 不得走 ellipsis：权限名是功能标识，残缺会让用户认不出当前档位');
  assert.doesNotMatch(permLabel, /text-overflow:\s*ellipsis/, 'label 不得出现 ellipsis');
  assert.match(permLabel, /white-space:\s*nowrap\s*!important/, 'label 必须单行（权限名是短标签）');
  assert.match(permLabel, /overflow:\s*visible\s*!important/, 'label 不得裁切自身');
  assert.match(permLabel, /flex:\s*0 0 auto\s*!important/, 'label 本身也不参与压缩');
  // ③ 三条规则都必须在手机端块内（电脑端空间充裕，且原本就是完好的）
  for (const cls of ['dsh-claude-perm-btn', 'dsh-claude-perm-label']) {
    const i = cssNoComment.indexOf(`.${cls}`);
    assert.ok(i > 0, `找不到 .${cls}`);
    const opens = (cssNoComment.slice(0, i).match(/\{/g) || []).length;
    const closes = (cssNoComment.slice(0, i).match(/\}/g) || []).length;
    assert.equal(opens - closes, 1, `.${cls} 必须在 max-width:767px 块内`);
  }
  assert.ok(rawBundle.includes('dsh-claude-perm-btn'), '产物必须带上，请重新构建');
});

test('作用范围：全部改动必须限定在 max-width:767px 内（电脑端一个像素都不许动）', () => {
  for (const [name] of [['trailing'], ['tools'], ['modes']]) {
    const anchor = cssNoComment.indexOf(`__F_COMPOSER__${name}`);
    assert.ok(anchor > 0, `必须能在 CSS 里找到 __F_COMPOSER__${name}`);
    const before = cssNoComment.slice(0, anchor);
    const opens = (before.match(/\{/g) || []).length;
    const closes = (before.match(/\}/g) || []).length;
    assert.equal(opens - closes, 1, `${name} 规则必须恰好在 max-width:767px 块内（不能落到顶层）`);
    assert.match(before.slice(before.lastIndexOf('@media')), /max-width:\s*767px/,
      `${name} 所在块必须是 max-width:767px`);
  }
});

test('产物同步：client.js 里必须带上该修正（否则跑 npm run build:client）', () => {
  assert.ok(source.includes('__F_COMPOSER__trailing'), '源码里必须用 __F_COMPOSER__trailing 占位符');
  assert.ok(rawBundle.includes('min-width:max-content'), '产物缺少右侧不收缩的修正，请重新构建');
  // 不硬编码宿主哈希
  assert.doesNotMatch(source, new RegExp(composerHash + '_trailing'), '不得硬编码宿主哈希，必须走占位符');
});

// 【已回退】原先两条「隐藏账户按钮/防复活」测试已随方案回退一并移除（2026-10-15）：
// 账户按钮 + 浮层是手机端打开设置的唯一入口，不能藏。见下方"回归修正"测试。

test('手机端隐藏输入区「用量/积分」统计徽标（用户上报的 WB CN · 7 那一条）', () => {
  // 实测定位：宿主把统计渲染在 [data-composer-stats] 容器里，条目是 [data-composer-stat]
  // （锚点 span.bOPqQW_anchor），挂在 uV2eYG_dock；第三方插件也会往同一槽位塞"渠道+积分"。
  // 手机端聚焦输入框后 body 带 data-dsh-claude-composer-active，皮肤按
  // data-dsh-claude-stats-position=context 把它上抬进底部工具行 → 压住权限胶囊
  // （实测把「完全权限」压成「完全节」）。
  const statsRule = cssNoComment.match(/\[data-composer-stats\],\s*\[data-composer-stat\]\s*\{([^}]*)\}/);
  assert.ok(statsRule, '必须有一条同时覆盖 [data-composer-stats] 与 [data-composer-stat] 的规则');
  assert.match(statsRule[1], /display:\s*none\s*!important/,
    '统计徽标必须 display:none !important —— 宿主可能用普通样式或第三方插件用 inline 把它显示出来，'
    + '只有 !important 才压得住');
  // 上抬位移也要清零（双保险）
  assert.match(cssNoComment, /body\[data-dsh-claude-composer-active\]\s*\{[^}]*--dsh-claude-mobile-stats-lift:\s*0px\s*!important/,
    '必须把皮肤的移动端统计上抬位移清零（--dsh-claude-mobile-stats-lift）');
  // 两条都必须限定在手机端
  for (const anchor of ['[data-composer-stats],', 'body[data-dsh-claude-composer-active]']) {
    const i = cssNoComment.indexOf(anchor);
    assert.ok(i > 0, `找不到 ${anchor}`);
    const opens = (cssNoComment.slice(0, i).match(/\{/g) || []).length;
    const closes = (cssNoComment.slice(0, i).match(/\}/g) || []).length;
    assert.equal(opens - closes, 1, `${anchor} 必须在 max-width:767px 块内（电脑端统计要照常显示）`);
  }
  assert.ok(rawBundle.includes('data-composer-stat'), '产物里必须带上，请重新构建');
});

test('手机端：输入行里"其它插件插进来"的控件必须自适应（渠道积分不再叠字）', () => {
  // 用户上报 + 截图：接入渠道的插件（dsh-connect-workbuddy）把积分读数
  // 「WB CN · 7」通过宿主共享 slot（conversation.input.left）塞进输入行；
  // 它自身是 display:inline-flex + min-width:0，窄屏被压到 0 宽后内容不缩，
  // 于是文字直接画在权限胶囊上（截图里显示成「WB CN · Auto」叠字）。
  assert.match(cssNoComment, /\.dsm-workbuddy-composer-credits\s*\{[^}]*display:\s*none\s*!important/,
    '渠道积分读数必须被隐藏（用户明确要求不显示）');
  // 通用兜底：输入行直接子项不得溢出（modes 除外，它要横向滚动）
  assert.match(cssNoComment,
    /div\[class\*="__F_COMPOSER__row"\]\s*>\s*\*:not\(\[class\*="__F_COMPOSER__modes"\]\)\s*\{[^}]*overflow:\s*hidden\s*!important/,
    '输入行的任何直接子项都必须裁掉溢出 —— 否则任何插件往这个共享座位塞东西都会叠字');
  // 兜底规则不能把 modes 的横滑吃掉
  assert.match(modes, /overflow-x:\s*auto\s*!important/, 'modes 仍必须能横向滚动（兜底规则已用 :not 排除它）');
  // ⚠️ 回归点：本文件整体是 JS 模板字符串，注释里出现反引号会把它截断（构建直接失败，已踩过）
  assert.ok(!MOBILE_STYLES_CSS.includes('`'), '手机端 CSS 里不得出现反引号（会截断模板字符串）');
  assert.ok(rawBundle.includes('dsm-workbuddy-composer-credits'), '产物里必须带上，请重新构建');
});

test('手机端必须保留账户按钮与浮层（那是打开设置的唯一入口）—— 回归修正', () => {
  // ⚠️ 教训（2026-10-15）：曾把账户按钮 + 浮层一起隐藏，结果把手机端唯一的设置入口
  // 堵死了 —— 宿主自己的 settings.launcher 在手机端本来就是 display:none（宿主行为），
  // 打开设置的真正入口是皮肤账户浮层里的 [data-action="settings"] 项。
  const accountRule = cssNoComment.match(/\.dsh-claude-account-btn\s*\{([^}]*)\}/);
  assert.ok(accountRule, '必须有一条 .dsh-claude-account-btn 规则');
  assert.doesNotMatch(accountRule[1], /display:\s*none/, '账户按钮绝不能 display:none（设置入口会被堵死）');
  assert.match(accountRule[1], /display:\s*inline-flex\s*!important/, '账户按钮必须恢复可见（inline-flex）');
  const popRule = cssNoComment.match(/\.dsh-claude-account-popover\s*\{([^}]*)\}/);
  assert.ok(popRule, '必须有一条浮层规则');
  assert.doesNotMatch(popRule[1], /display:\s*none/, '账户浮层绝不能 display:none（里面有设置项）');
  assert.match(popRule[1], /max-width:\s*calc\(100vw - 24px\)\s*!important/, '浮层宽度必须约束到手机屏内');
});

// ── 「积分」读数必须收窄（2026-10-17 用户要求：它占的位置太多了）──────────────────
//
// 实测（390px）：第三方插件 dsh-connect-workbuddy 通过宿主共享槽位
// conversation.input.right 渲染 [刷新按钮 20px] + [文本 96px] = **116px**，
// 是整个输入行最宽的一段外来内容，把权限胶囊和模型钮都挤扁了。
// 文本形如「WB.1,222（积分）」：数字部分仅 37.7px，而「（积分）」3 个全角字符
// 就要 22px —— 单位标签比数字本身还占地方。
//
// 用户明确要求"把它缩短一点"。做法是**只收窄、不隐藏**：那是渠道接入的核心读数，
// 用户没说不要；隐藏属于越权修改第三方插件功能。
test('「积分」读数必须收窄：限宽 + 可收缩 + 省略号', () => {
  const right = [...MOBILE_STYLES_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => m[1].includes('[data-slot="conversation.input.right"]'))
    .map((m) => m[2]).join('\n');
  assert.ok(right.trim(), '必须有一条 conversation.input.right 规则');
  // ① 上限必须明显小于它原本的 116px（否则等于没缩短）
  const maxW = Number(right.match(/max-width:\s*(\d+)px/)?.[1] || 0);
  assert.ok(maxW > 0 && maxW <= 100, `积分必须有 max-width 上限（原本 116px），当前 ${maxW}px`);
  assert.ok(maxW >= 40, `上限不应低于 40px（否则数字都看不全），当前 ${maxW}px`);
  // ② 必须允许收缩 + 裁掉溢出（否则子项限宽也白搭：父级按内容定宽会吃光空间）
  assert.match(right, /flex:\s*0 1 auto\s*!important/, '积分容器必须可收缩（0 1 auto）');
  assert.match(right, /min-width:\s*0\s*!important/, '积分容器必须 min-width:0，否则收缩无从发生');
  assert.match(right, /overflow:\s*hidden\s*!important/, '积分容器必须裁掉溢出');
  // ③ 刷新按钮必须保住可点尺寸（20px），不参与压缩
  assert.match(right, /width:\s*20px\s*!important/, '刷新按钮必须固定 20px（保证点得中）');
  // ④ 文本必须走省略号：放不下时末尾 …，而不是把邻居顶出去
  assert.match(right, /text-overflow:\s*ellipsis\s*!important/, '积分文本必须走省略号');
  assert.match(right, /white-space:\s*nowrap\s*!important/, '积分文本必须单行');
  // ⑤ 必须仍在手机端块内（电脑端空间充裕，读数应完整显示）
  const i = cssNoComment.indexOf('[data-slot="conversation.input.right"]');
  assert.ok(i > 0, '找不到 conversation.input.right');
  const opens = (cssNoComment.slice(0, i).match(/\{/g) || []).length;
  const closes = (cssNoComment.slice(0, i).match(/\}/g) || []).length;
  assert.equal(opens - closes, 1, '积分收窄规则必须在 max-width:767px 块内');
  assert.ok(rawBundle.includes('conversation.input.right'), '产物必须带上，请重新构建');
});

// ── 「思考强度」是皮肤画的 fixed 元素，不在行内：必须补偿 iOS 键盘造成的坐标漂移 ──────────
//
// 实测事实（本文件顶部说明的延伸）：
//   .dsh-claude-effort-btn 挂在 <body> 下、position:fixed，
//   行内样式形如 left:289px; top:771px —— 由皮肤 JS 从模型按钮的 getBoundingClientRect() 算出，
//   并给模型按钮设 margin-right 来"占位"。键盘弹起时 iOS 的 fixed 参照系与 rect 坐标系不同步，
//   皮肤算出的坐标失效 → 实测按钮浮到消息区中间（用户 iOS 截图）。
//
// ⚠️ 2026-10-19：独立的 setupEffortAnchor 已**删除并并入** setupViewportClamp。
//    两层各自测量、各自写位移，互相看不见对方 —— 拉回层按尚未锚定的旧坐标判定，
//    两者合起来是错的，这就是"偶发挤出边框"。现在由唯一观测者统一处理，
//    锚定目标由调用方以 EFFORT_ANCHOR 注入。本组只守"契约"，行为细节见
//    test/viewport-clamp.test.mjs 的单一观测者一节。
test('锚定目标由调用方注入：入口必须把 EFFORT_ANCHOR 传给唯一观测者', () => {
  assert.match(clientIndex, /const EFFORT_ANCHOR = \{/, '必须保留锚定配置常量');
  assert.match(clientIndex, /btnSelector:\s*'\.dsh-claude-effort-btn'/, '锚的主体是皮肤自绘的强度按钮');
  assert.match(clientIndex, /targetSelector:\s*'\.dsh-claude-model-btn'/, '锚定目标是模型按钮右缘');
  assert.match(clientIndex, /popoverSelector:\s*'\.dsh-claude-effort-popover'/, '浮层承受同一坐标系误差，必须一起补');
  assert.match(clientIndex, /setupViewportClamp\(\{ anchor: EFFORT_ANCHOR \}\)/,
    '必须由唯一观测者统一处理（不得再单独调用已删除的 setupEffortAnchor）');
  assert.doesNotMatch(clientIndex, /setupEffortAnchor\(\);/, '不得再调用第二个观测者');
  assert.ok(rawBundle.includes('dsh-claude-effort-btn'), '产物里必须带上该补偿，请重新构建');
});

test('补偿只加 transform / CSS 变量，绝不改皮肤的定位属性（否则就是"改皮肤"了）', () => {
  // clamp 层（唯一观测者）负责实际写入
  const clampSrc = read('client/viewport-clamp.js');
  assert.match(clampSrc, /el\.style\.transform = transform/, '锚定仍只写 transform');
  assert.match(clampSrc, /style\.setProperty\(CLAMP_VAR/, '越界拉回只写 CSS 变量');
  for (const forbidden of ['.style.left', '.style.top', '.style.position', '.style.marginRight',
    'removeChild', 'appendChild', 'insertBefore']) {
    assert.ok(!clampSrc.includes(`${forbidden} =`) && !clampSrc.includes(`${forbidden}=`),
      `不得动 ${forbidden}：皮肤自己负责 left/top/占位 margin，我们只做视觉补偿`);
  }
  // 入口侧的锚定配置也不得夹带几何改写
  const anchorBlock = clientIndex.match(/const EFFORT_ANCHOR = \{[\s\S]*?\n\};/)[0];
  assert.doesNotMatch(anchorBlock, /style/, '锚定配置只是选择器，不得直接改样式');
});

test('安全阀：坐标健康时不加位移、清掉旧补偿再测量（防自我累积）', () => {
  const clampSrc = read('client/viewport-clamp.js');
  assert.match(clampSrc, /computeAnchorOffset/, '锚定必须走纯计算（坐标系没漂移时自然返回 0）');
  // 统一清除阶段：把自己上次写的所有位移都撤掉，才量得到皮肤的真实位置
  assert.match(clampSrc, /\/\/ ① 统一清除/, '必须有统一清除阶段');
  assert.match(clampSrc, /clearEl\(el\)/, '清除时必须还原 transform 与 CSS 变量');
  assert.match(clampSrc, /innerWidth\s*>\s*MOBILE_MAX_WIDTH/, '必须只在手机端生效');
});

test('触发时机覆盖 iOS 键盘：visualViewport 的 resize/scroll', () => {
  const clampSrc = read('client/viewport-clamp.js');
  assert.match(clampSrc, /visualViewport\.addEventListener\('resize'/, '必须监听 visualViewport resize（键盘弹起/收起）');
  assert.match(clampSrc, /visualViewport\.addEventListener\('scroll'/, '必须监听 visualViewport scroll（iOS 会二次滚动）');
  // 不得监听 window scroll：用户翻阅历史时最不该被插一脚，
  // 且固定控件的横坐标不随纵向滚动变化（visualViewport 的 scroll 是键盘信号，要保留）
  const listenerBlock = clampSrc.slice(clampSrc.indexOf('const schedule ='));
  assert.doesNotMatch(listenerBlock, /win\.addEventListener\('scroll'/,
    '不得监听 window scroll —— 会与用户的翻阅动作抢滚动');
  assert.doesNotMatch(listenerBlock, /window\.addEventListener\('scroll'/,
    '不得监听 window scroll（含全局写法）');
});
