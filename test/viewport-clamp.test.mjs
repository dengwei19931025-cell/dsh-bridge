// viewport-clamp 的纯逻辑单测：判定"该不该拉、往哪拉、拉多少"。
// 核心 computeClampOffset 是纯函数（样式快照 + 盒子 + 视口宽 → 位移），
// 所以在 Node 里可直接验证，不依赖真实 DOM —— 换皮肤、换宿主都不会让它失效。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeClampOffset } from '../client/viewport-clamp.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(resolve(repoRoot, f), 'utf8');

const source = read('client/viewport-clamp.js');
const rawBundle = read('client/client.js');
const clientIndex = read('client/index.js');

/** 皮肤浮动按钮的典型样式（实测：position:fixed、可见、49×28） */
const fixedBtn = (patch = {}) => ({
  position: 'fixed', display: 'flex', visibility: 'visible', opacity: '1', ...patch,
});

/** 造一个盒子；left/right 一致时自动推算 width */
const box = ({ left = 0, width = 49, height = 28, right }) => ({
  left,
  right: right ?? left + width,
  width,
  height,
});

/** 视口边界（退化用法） */
const viewport = (w) => ({ left: 0, right: w });
/** 输入卡片边界（生产用法：实测 390px 下卡片为 16→372） */
const card = (l = 16, r = 372) => ({ left: l, right: r });

test('右侧出界：拉回一个负位移，恰好停在安全边距内', () => {
  // 实测复现：320px 视口下强度按钮 322→371，右缘超出视口 51px
  assert.equal(computeClampOffset(fixedBtn(), box({ left: 322, width: 49 }), viewport(320)), -57);
});

test('左侧出界：拉回一个正位移', () => {
  assert.equal(computeClampOffset(fixedBtn(), box({ left: -30, width: 49 }), viewport(320)), 36);
});

test('几何健康：已在边界内 → 0（健康路径零影响）', () => {
  assert.equal(computeClampOffset(fixedBtn(), box({ left: 237, width: 49 }), viewport(320)), 0);
});

test('非 fixed 一律不碰（皮肤换了实现就撒手，绝不改它的定位方式）', () => {
  assert.equal(computeClampOffset(fixedBtn({ position: 'static' }), box({ left: 322 }), viewport(320)), 0);
  assert.equal(computeClampOffset(fixedBtn({ position: 'absolute' }), box({ left: 322 }), viewport(320)), 0);
});

test('隐藏浮层不碰：visibility:hidden / opacity:0 / display:none 都跳过', () => {
  for (const patch of [{ visibility: 'hidden' }, { opacity: '0' }, { display: 'none' }]) {
    assert.equal(computeClampOffset(fixedBtn(patch), box({ left: 322 }), viewport(320)), 0,
      `patch=${JSON.stringify(patch)} 不该被兜底`);
  }
});

test('浮层卡片 / 顶栏不碰：尺寸超上限的固定元素不是"小控件"', () => {
  // 实测浮层卡片 241~265×171~184（本来就在视口外，点开才显示，绝不能动）
  assert.equal(computeClampOffset(fixedBtn(), box({ left: 322, width: 285, height: 86 }), viewport(320)), 0);
  // 实测顶栏 390×52
  assert.equal(computeClampOffset(fixedBtn(), box({ left: -5, width: 390, height: 52 }), viewport(320)), 0);
});

test('零尺寸元素跳过（未挂载 / 折叠状态）', () => {
  assert.equal(computeClampOffset(fixedBtn(), box({ left: 322, width: 0, height: 0 }), viewport(320)), 0);
});

test('两侧同时出界时取更正的位移（不叠两个补偿）', () => {
  // 比边界还宽的小控件：左右都越界，按右侧为准
  const wide = { left: 300, right: 400, width: 100, height: 28 };
  const dx = computeClampOffset(fixedBtn(), wide, viewport(320));
  assert.equal(dx, 320 - 6 - 400);   // -86
});

test('边界取输入卡片：越出卡片（即使仍在视口内）也必须拉回', () => {
  // 实测长模型名场景：按钮 265→314，卡片右缘 302 → 越出卡片 12px，但仍在视口 320 内。
  // 只按视口判会漏掉这一档 —— 这正是用户看到的"挤到卡片外面"。
  const dx = computeClampOffset(fixedBtn(), box({ left: 265, width: 49 }), card(16, 302));
  assert.equal(dx, 302 - 6 - 314, '应拉回到卡片右缘内侧 6px');

  // 同样位置若按视口判则判定"在界内"（0）—— 证明卡片边界确实更严
  assert.equal(computeClampOffset(fixedBtn(), box({ left: 265, width: 49 }), viewport(320)), 0);
});

test('边界取输入卡片：卡片左右缘之内一律不干预（健康路径零影响）', () => {
  assert.equal(computeClampOffset(fixedBtn(), box({ left: 237, width: 49 }), card(16, 302)), 0);
});

test('产物同步：viewport-clamp 必须打进 client.js（否则线上跑的是旧逻辑）', () => {
  assert.ok(rawBundle.includes('dshbr-clamp'), 'client.js 缺少 data-dshbr-clamp 痕迹');
  assert.ok(rawBundle.includes('computeClampOffset'), 'client.js 缺少纯判定核心');
});

test('插件入口必须调用 setupViewportClamp（不调用等于没装）', () => {
  assert.match(clientIndex, /setupViewportClamp\(\)/, 'client/index.js 必须调用 setupViewportClamp');
});

test('不依赖任何皮肤类名：兜底只按几何判定（换皮肤也不会失效）', () => {
  assert.doesNotMatch(source, /dsh-claude-/, 'viewport-clamp.js 不得出现皮肤类名，必须皮肤无关');
});

test('与键盘漂移补偿互不覆盖：兜底不写 transform，只写 CSS 变量', () => {
  // setupEffortAnchor 占用内联 transform 做补偿；兜底若也写 transform，两者互相抹除
  // （实测：键盘补偿把按钮推到离卡片 264px，兜底的拉回被覆盖）。
  const sweepBody = source.slice(source.indexOf('const sweep ='));
  assert.doesNotMatch(sweepBody, /\.style\.transform\s*=/,
    '兜底的 sweep 绝不能写 style.transform（那是键盘漂移补偿的字段）');
  assert.match(source, /style\.setProperty\(CLAMP_VAR/, '兜底必须写 CSS 变量');
  // 注入的 CSS 必须用 translate 属性合成（translate 与 transform 可叠加，互不覆盖）
  assert.match(source, /translate:var\(/, '注入 CSS 必须用 translate 属性合成位移');
  assert.doesNotMatch(source, /transform:translateX\(/, '不得用 transform 合成（会被内联 transform 盖掉）');
});

test('只在移动端兜底：电脑端必须一个像素都不动', () => {
  assert.match(source, /innerWidth\s*>\s*MOBILE_MAX_WIDTH/, '必须以移动端断点为界');
  assert.match(source, /MOBILE_MAX_WIDTH\s*=\s*767/, '断点必须与 mobile-styles.js 的 767 对齐');
});

test('离界后必须清除补偿，不能留残留位移', () => {
  assert.match(source, /removeProperty\(CLAMP_VAR\)/, '回到视口内后必须清掉变量');
  assert.match(source, /removeAttribute\(CLAMP_ATTR\)/, '回到视口内后必须清掉标记');
});

// ── 2026-10-17 用户上报：「输出文字时一闪一闪、光标自动跳到底部」───────────────
// 实测：兜底的 MutationObserver 监听 body **整棵子树**的 style/class，而 sweep 自己
// 又要写 style —— 自激循环。流式输出 5 秒触发了 329 次重扫（修复前）。
// 这三条守住"不再自激、不抢滚动"。

test('不得自激：sweep 写样式期间必须上自锁，observer 看到自己的写入不再排队', () => {
  assert.match(source, /let selfWrite\s*=\s*false/, '必须有自锁标记');
  assert.match(source, /selfWrite\s*=\s*true/, 'sweep 进入时必须上锁');
  // observer 回调必须检查自锁
  assert.match(source, /new MO\(\(\)\s*=>\s*\{\s*if \(!selfWrite\)\s*schedule\(\)/,
    'MutationObserver 回调必须跳过自锁期间的写入（否则无限自激）');
});

test('observer 只观察 body 直接子元素（不得 subtree:true —— 每个 token 都会变成一次重扫）', () => {
  assert.match(source, /mo\.observe\(doc\.body,\s*\{\s*childList:\s*true,\s*attributes:\s*true/,
    '观察配置必须是 body 直接子元素');
  assert.doesNotMatch(source, /mo\.observe\([^)]*subtree:\s*true/, '不得观察整棵子树（实测引发 329 次重扫）');
});

test('不得监听 scroll：用户翻阅历史时那是最不该被插一脚的时刻', () => {
  const listenerBlock = source.slice(source.indexOf('const schedule ='));
  assert.doesNotMatch(listenerBlock, /addEventListener\('scroll'/,
    '兜底不得监听 scroll —— 会与用户的翻阅动作抢滚动');
});