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

test('右侧 [模型 | 思考强度 | 发送] 绝不收缩 —— 这是"强度按钮跑出行外"的根治点', () => {
  assert.ok(trailing, '必须有一条 trailing 规则');
  assert.match(trailing, /flex:\s*0 0 auto\s*!important/,
    'trailing 必须 flex:0 0 auto：一旦允许收缩，宿主的 standardControls 会被压到 0，'
    + '固定宽度的「思考强度」按钮就会溢出到输入卡片之外（320px 实测溢出 39px）');
  assert.match(trailing, /min-width:\s*max-content\s*!important/,
    'trailing 必须 min-width:max-content：连 min-width:0 都不能留，否则仍可被压到内容以下');
  assert.match(trailing, /justify-content:\s*flex-end\s*!important/, '右侧组必须右对齐');
  assert.doesNotMatch(trailing, /flex:\s*1 1 auto/, '不得改回 flex:1 1 auto（回归点）');
  assert.doesNotMatch(trailing, /min-width:\s*0\b/, '不得改回 min-width:0（回归点）');
});

test('左侧权限区负责让位：可收缩 + 可横滑（否则窄屏整体溢出）', () => {
  assert.ok(tools && modes, '必须各有一条规则');
  assert.match(tools, /flex:\s*1 1 auto\s*!important/,
    'tools 必须可收缩：右侧已经不让位了，左侧必须让位，否则整行溢出卡片');
  assert.match(tools, /min-width:\s*0\s*!important/, 'tools 必须 min-width:0 才能真正收缩');
  assert.match(tools, /overflow:\s*hidden\s*!important/, 'tools 需裁掉溢出，避免溢出内容盖到右侧组上');
  assert.match(modes, /flex:\s*1 1 auto\s*!important/, 'modes 必须可收缩');
  assert.match(modes, /min-width:\s*0\s*!important/, 'modes 必须 min-width:0');
  assert.match(modes, /overflow-x:\s*auto\s*!important/,
    'modes 必须能横滑：胶囊放不下时让用户滑得到，而不是把它们顶出行外');
  assert.match(modes, /scrollbar-width:\s*none\s*!important/, '横滑不应露出滚动条');
  assert.match(rendered, /_modes"\]::-webkit-scrollbar\s*\{[^}]*display:\s*none\s*!important/,
    'WebKit 也要隐藏滚动条（iOS Safari 用的就是这条）');
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

// ── 「思考强度」是皮肤画的 fixed 元素，不在行内：必须补偿 iOS 键盘造成的坐标漂移 ──────────
//
// 实测事实（本文件顶部说明的延伸）：
//   .dsh-claude-effort-btn 挂在 <body> 下、position:fixed，
//   行内样式形如 left:289px; top:771px —— 由皮肤 JS 从模型按钮的 getBoundingClientRect() 算出，
//   并给模型按钮设 margin-right 来"占位"。键盘弹起时 iOS 的 fixed 参照系与 rect 坐标系不同步，
//   皮肤算出的坐标失效 → 实测按钮浮到消息区中间（用户 iOS 截图）。
test('存在 setupEffortAnchor，且已在插件入口调用', () => {
  assert.match(clientIndex, /function setupEffortAnchor\(\)/, '必须实现 setupEffortAnchor');
  assert.match(clientIndex, /setupEffortAnchor\(\);/, '必须在插件入口调用它（与 setupIosKeyboardAdapter 同处）');
  assert.ok(rawBundle.includes('dsh-claude-effort-btn'), '产物里必须带上该补偿，请重新构建');
});

test('补偿只加 transform，绝不改皮肤的定位属性（否则就是"改皮肤"了）', () => {
  const body = clientIndex.match(/function setupEffortAnchor\(\)[\s\S]*?\n\}\n/);
  assert.ok(body, '必须能定位到 setupEffortAnchor 函数体');
  assert.match(body[0], /btn\.style\.transform = /, '只允许设置 transform');
  for (const forbidden of ['btn.style.left', 'btn.style.top', 'btn.style.position', 'btn.style.marginRight',
    'model.style.marginRight', 'removeChild', 'appendChild', 'insertBefore']) {
    assert.ok(!body[0].includes(forbidden),
      `不得动 ${forbidden}：皮肤自己负责 left/top/占位 margin，我们只做视觉补偿`);
  }
});

test('补偿的安全阀：非 fixed 实现不插手、坐标系健康时不加 transform、清掉旧补偿再测量', () => {
  const body = clientIndex.match(/function setupEffortAnchor\(\)[\s\S]*?\n\}\n/)[0];
  assert.match(body, /getComputedStyle\(btn\)\.position !== 'fixed'/,
    '必须探测皮肤是否仍是 fixed 实现：换了实现就不插手');
  assert.match(body, /if \(!dx && !dy\) return;/, '坐标系没漂移时必须直接返回（健康路径零影响）');
  assert.match(body, /if \(btn\.style\.transform\) btn\.style\.transform = '';/,
    '测量前必须清掉上次补偿，否则会自我累积（drift 越补越大）');
  assert.match(body, /if \(pop && pop\.style\.transform\) pop\.style\.transform = '';/,
    '浮层的旧补偿也要清：漂移消失后残留 transform 会让浮层错位');
  assert.ok(body.includes("window.innerWidth > MOBILE_MAX_WIDTH"), '必须只在手机端生效');
});

test('补偿的触发时机覆盖 iOS 键盘：visualViewport 的 resize/scroll + 焦点变化', () => {
  const body = clientIndex.match(/function setupEffortAnchor\(\)[\s\S]*?\n\}\n/)[0];
  assert.match(body, /visualViewport\.addEventListener\('resize'/, '必须监听 visualViewport resize（键盘弹起/收起）');
  assert.match(body, /visualViewport\.addEventListener\('scroll'/, '必须监听 visualViewport scroll（iOS 会二次滚动）');
  assert.match(body, /addEventListener\('focusin', schedule, true\)/, '必须监听 focusin');
  assert.match(body, /addEventListener\('focusout', schedule, true\)/, '必须监听 focusout');
  assert.match(body, /addEventListener\('scroll', schedule, \{ passive: true, capture: true \}\)/,
    '滚动必须用捕获：输入区在宿主的滚动容器里，事件不冒泡到 window');
});
