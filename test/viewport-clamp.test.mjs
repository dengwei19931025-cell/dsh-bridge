// viewport-clamp 的纯逻辑单测：判定"该不该拉、往哪拉、拉多少"。
// 核心 computeClampOffset 是纯函数（样式快照 + 盒子 + 视口宽 → 位移），
// 所以在 Node 里可直接验证，不依赖真实 DOM —— 换皮肤、换宿主都不会让它失效。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeClampOffset, computeDriftOffset } from '../client/viewport-clamp.js';

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
  // 2026-10-19 起带 anchor 参数（锚定目标由调用方注入，clamp 层保持皮肤无关）
  assert.match(clientIndex, /setupViewportClamp\(\{[^}]*anchor[^}]*\}\)|setupViewportClamp\(\)/,
    'client/index.js 必须调用 setupViewportClamp（带不带 anchor 都算）');
});

test('不依赖任何皮肤类名：兜底只按几何判定（换皮肤也不会失效）', () => {
  assert.doesNotMatch(source, /dsh-claude-/, 'viewport-clamp.js 不得出现皮肤类名，必须皮肤无关');
});

test('越界拉回只写 CSS 变量，用 translate 属性合成（与锚定的 transform 互不覆盖）', () => {
  // 2026-10-19：锚定（键盘漂移）已并入本模块，占用内联 transform 字段；
  // 拉回必须继续走 CSS 变量 + translate 属性 —— 两条位移靠属性分离互不覆盖。
  // （更早的两层实现正是因为互相写同一个字段而互相抹除。）
  assert.match(source, /style\.setProperty\(CLAMP_VAR/, '拉回必须写 CSS 变量');
  // 注入的 CSS 必须用 translate 属性合成（translate 与 transform 可叠加，互不覆盖）
  assert.match(source, /translate:var\(/, '注入 CSS 必须用 translate 属性合成位移');
  assert.doesNotMatch(source, /transform:translateX\(/, '不得用 transform 合成（会与锚定补偿互相盖掉）');
  // 拉回的位移不得写进 transform 字段（那是锚定专用的）
  const writeBlock = source.slice(source.indexOf('// ④ 统一写入'));
  assert.doesNotMatch(writeBlock, /el\.style\.transform\s*=\s*clampDx/,
    '拉回位移不得写进 transform（锚定专用字段）');
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

test('不得自激：observer 必须能识别自己的写入（元素级指纹，见下方新断言）', () => {
  // 2026-10-19：布尔自锁（let selfWrite）已换成**元素级样式指纹** ——
  // 布尔自锁会把皮肤在同一轮里的真实改动一起吞掉，补偿于是停在过期坐标上。
  assert.match(source, /function fingerprint\(/, '必须有样式指纹函数');
  assert.match(source, /selfFingerprints/, '必须按元素记录写入后的指纹');
  // observer 回调必须逐个 record 比对指纹，命中就跳过（否则无限自激）
  assert.match(source, /for \(const record of records\)/, '必须逐条 record 判定（不能一刀切忽略）');
  assert.match(source, /if \(expected !== undefined && expected === fingerprint\(el\)\) continue/,
    '指纹一致 = 自己的写入，必须跳过（否则无限自激）');
});

test('observer 只观察 body 直接子元素（不得 subtree:true —— 每个 token 都会变成一次重扫）', () => {
  assert.match(source, /mo\.observe\(doc\.body,\s*\{\s*childList:\s*true,\s*attributes:\s*true/,
    '观察配置必须是 body 直接子元素');
  assert.doesNotMatch(source, /mo\.observe\([^)]*subtree:\s*true/, '不得观察整棵子树（实测引发 329 次重扫）');
});

test('不得监听 window scroll：用户翻阅历史时那是最不该被插一脚的时刻', () => {
  // ⚠️ 只禁 **window** 的 scroll。visualViewport 的 scroll 是 iOS 键盘弹起/收起过程中
  // 坐标系不一致的信号，必须监听（2026-10-19 起由唯一观测者统一监听，键盘场景必需）。
  const listenerBlock = source.slice(source.indexOf('const schedule ='));
  assert.doesNotMatch(listenerBlock, /win\.addEventListener\('scroll'/,
    '不得监听 window scroll —— 会与用户的翻阅动作抢滚动');
  assert.doesNotMatch(listenerBlock, /window\.addEventListener\('scroll'/,
    '不得监听 window scroll（含全局写法）');
  assert.doesNotMatch(listenerBlock, /addEventListener\('scroll', schedule, \{ passive: true, capture: true \}\)/,
    '不得用捕获方式监听全局 scroll');
  // 键盘必需的这一条要保留
  assert.match(source, /visualViewport\.addEventListener\('scroll'/,
    'visualViewport 的 scroll 必须保留（iOS 键盘过程坐标系不一致）');
});

// ── 2026-10-19 重构：合并成"唯一观测者"，消除两层补偿互相覆盖的偶发故障 ──────────
//
// 此前 setupEffortAnchor（锚定/键盘漂移）与 setupViewportClamp（越界拉回）各测各的、
// 各写各的：拉回层看到的是**尚未锚定**的旧坐标，于是把按钮拉到一个锚定后仍然越界的
// 位置；或反过来抹掉锚定。两者都生效了，合起来却是错的 —— 这就是"偶发挤出边框"。
//
// 下面这组守住新架构的三条硬约束。

test('漂移补偿：补偿量 = 皮肤意图坐标 − 实际渲染位置', () => {
  // 皮肤写 left=215 / top=587，实际却渲染在 454/330（fixed 参照系漂移了）
  const rect = { left: 454, right: 484, top: 330, bottom: 358, width: 30, height: 28 };
  const off = computeDriftOffset(rect, '215px', '587px');
  assert.equal(off.usable, true);
  assert.equal(off.dx, 215 - 454, '横向补偿把实际位置拉回意图位置');
  assert.equal(off.dy, 587 - 330, '纵向同理');
});

test('漂移补偿：健康时恒为 0（坐标系没漂移就一个像素都不动）', () => {
  const rect = { left: 285, right: 315, top: 544, bottom: 572, width: 30, height: 28 };
  const off = computeDriftOffset(rect, '285px', '544px');
  assert.equal(off.usable, true);
  assert.equal(off.dx, 0);
  assert.equal(off.dy, 0);
});

test('漂移补偿：读不到意图坐标时不得补偿（皮肤还没摆放 → 基准不可信）', () => {
  const rect = { left: 300, right: 330, top: 500, bottom: 528, width: 30, height: 28 };
  assert.equal(computeDriftOffset(rect, '', '').usable, false,
    'inline left/top 都为空时必须 usable=false：此时任何补偿都是拿错误基准乱推');
  assert.equal(computeDriftOffset(rect, null, undefined).usable, false);
  // 皮肤尚未挂载 → 零尺寸盒子
  assert.equal(computeDriftOffset({ width: 0, height: 0, left: 0, top: 0 }, '215px', '587px').usable, false);
});

test('漂移补偿必须自愈：把补偿量再喂回去，下一轮应算回 0', () => {
  // 这是修「位置卡死」的核心性质：某帧量错了也不会永久错位。
  const intended = { left: 215, top: 587 };
  const drifted = { left: 454, top: 330, width: 30, height: 28 };
  const first = computeDriftOffset(drifted, `${intended.left}px`, `${intended.top}px`);
  const applied = { left: drifted.left + first.dx, top: drifted.top + first.dy, width: 30, height: 28 };
  assert.equal(applied.left, 215);
  assert.equal(applied.top, 587);
  const second = computeDriftOffset(applied, `${intended.left}px`, `${intended.top}px`);
  assert.equal(second.dx, 0, '补偿生效后下一轮必须归零（否则会越补越大）');
  assert.equal(second.dy, 0);
});

test('越界判定必须基于补偿之后的位置', () => {
  // 按钮此刻 left=300（宽 49，右缘 349），补偿把它往左带 40px（到右缘 309）；
  // 卡片右缘 302。若按**补偿前**的坐标判（349 > 302），会被拉回 −53；
  // 但补偿后右缘是 309，正确位移应是 302 − 6 − 309 = −13。
  const before = { left: 300, right: 349, width: 49, height: 28 };
  const afterAnchor = { left: before.left - 40, right: before.right - 40, width: 49, height: 28 };
  assert.equal(computeClampOffset(fixedBtn(), before, card(16, 302)), 302 - 6 - 349);
  assert.equal(computeClampOffset(fixedBtn(), afterAnchor, card(16, 302)), 302 - 6 - 309,
    '补偿后的位置才是真实落点，判定必须用它');
});

test('单一观测者：不得再出现第二个几何补偿器（setupEffortAnchor 已并入）', () => {
  assert.doesNotMatch(clientIndex, /function setupEffortAnchor\(/,
    'setupEffortAnchor 必须已删除：它是第二个观测者，会与 clamp 互相覆盖');
  assert.doesNotMatch(clientIndex, /setupEffortAnchor\(\);/, '不得再调用已删除的补偿器');
  // 锚定配置必须由调用方注入，clamp 层自身仍不得认皮肤类名
  assert.match(clientIndex, /setupViewportClamp\(\{ anchor: EFFORT_ANCHOR \}\)/,
    '锚定目标必须作为配置注入（保持 clamp 层皮肤无关）');
});

test('唯一观测者：清除 → 测量 → 计算 → 写入 必须集中在同一次 sweep 内', () => {
  // 读写交错会让每次写入都触发强制重排，也是抖动的来源
  const sweepBody = source.slice(source.indexOf('function runSweep()'));
  const clearAt = sweepBody.indexOf('// ① 统一清除');
  const measureAt = sweepBody.indexOf('// ② 统一测量');
  const calcAt = sweepBody.indexOf('// ③ 统一计算');
  const writeAt = sweepBody.indexOf('// ④ 统一写入');
  assert.ok(clearAt > 0 && measureAt > clearAt && calcAt > measureAt && writeAt > calcAt,
    '必须严格按 清除→测量→计算→写入 的顺序集中执行');
  // 测量阶段不得再写入样式（否则就是读写交错）
  const measureBlock = sweepBody.slice(measureAt, calcAt);
  assert.doesNotMatch(measureBlock, /\.style\.(transform|setProperty)\s*=/,
    '测量阶段不得写样式（读写交错会触发强制重排 → 抖动）');
});

test('自锁必须精确到元素（布尔自锁会吞掉皮肤的真实变更，让补偿停在过期坐标）', () => {
  assert.match(source, /function fingerprint\(/, '必须按元素记录写入后的样式指纹');
  assert.doesNotMatch(source, /let selfWrite\s*=\s*false/,
    '不得再用全局布尔自锁：它会把皮肤的变更一起忽略掉');
});

// ── 2026-10-20 皮肤 0.17.0 后「控件位置乱跑」的回归防线 ────────────────────────
//
// 实测（320/360/375px）：皮肤把强度按钮写在 left=215/top=587，它却渲染在 (454,330)
// —— 屏幕外。原因是我们那版锚定用「模型按钮右缘 + 2」的**绝对位置假设**，
// 布局未稳定时算出 239px 位移并写死，且此后没有任何事件触发重算。
// 改成漂移补偿后自愈；下面守住这个语义不要再退化。

test('锚定不得再用「模型按钮右缘」这类绝对位置假设', () => {
  assert.doesNotMatch(source, /targetSelector/, '不得再依赖目标元素：绝对位置假设会在布局未稳时算出巨大偏移');
  assert.doesNotMatch(source, /targetRect|gap\s*=\s*anchorCfg/, '不得再读取目标元素的 rect');
  assert.match(source, /computeDriftOffset/, '必须走漂移补偿（意图坐标 − 实际位置）');
});

test('漂移补偿必须用皮肤自己写的 inline left/top 作为意图基准', () => {
  assert.match(source, /el\.style\.left/, '必须读取皮肤的 inline left 作为意图');
  assert.match(source, /el\.style\.top/, '必须读取皮肤的 inline top 作为意图');
  // 读不到意图时必须放弃补偿（usable=false），不能退回任何"猜测"
  assert.match(source, /if \(!drift\.usable\)/, '不可用时必须整体放弃补偿');
});

test('浮层必须复用按钮的补偿量，不得独立计算', () => {
  // 独立算会把浮层的 left 当成按钮左缘去贴目标右缘 —— 实测把浮层甩到 l=328/r=592
  assert.match(source, /let drift = \{ dx: 0, dy: 0, usable: false \}/,
    '漂移量必须只算一次，作为唯一来源');
  const calcBlock = source.slice(source.indexOf('// ③ 统一计算'), source.indexOf('// ④ 统一写入'));
  assert.doesNotMatch(calcBlock, /computeDriftOffset\(b,/, '循环内不得对每个元素各算一次漂移');
  assert.match(calcBlock, /dx = drift\.dx/, '浮层与按钮共用同一份漂移量');
});

test('关着的浮层不得预置补偿（补了会在下次打开时错位）', () => {
  assert.match(source, /function isOpen\(/, '必须有浮层开启判定');
  assert.match(source, /isOpen\(el, cs, b\)/, '计算位移前必须确认浮层开着');
  assert.match(source, /data-open/, '开启判定必须认皮肤的 data-open 属性');
});

test('皮肤未摆放锚定控件时必须整个撒手（连越界拉回也不做）', () => {
  // 实测：皮肤还没写 inline left/top 时按钮停在 left=0，拉回层按 PAD 往里推 6px
  // 并写死，皮肤随后摆放好也顶着这 6px（320/360/375px 稳定复现）。
  assert.match(source, /if \(isBtn && !drift\.usable\)/, '必须有"未摆放就整个撒手"的守卫');
  const guardBlock = source.slice(source.indexOf('if (isBtn && !drift.usable)'), source.indexOf('if (drift.usable && (isBtn || isPop))'));
  assert.match(guardBlock, /continue;/, '守卫必须直接跳过该元素（不能让拉回层继续处理）');
});

test('必须监听焦点变化：iOS 键盘是 focus 之后才确定 fixed 参照系', () => {
  assert.match(source, /addEventListener\('focusin', schedule, true\)/,
    '必须监听 focusin（捕获）：否则补偿停在焦点变化前一帧的旧值');
  assert.match(source, /addEventListener\('focusout', schedule, true\)/, '必须监听 focusout');
  // 解绑要对称，否则热更新会叠加监听器
  assert.match(source, /removeEventListener\('focusin', schedule, true\)/, '解绑必须对称');
  assert.match(source, /removeEventListener\('focusout', schedule, true\)/, '解绑必须对称');
});