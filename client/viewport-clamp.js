// 几何兜底（唯一观测者）：把「越出边界的可见浮动控件」拉回边界内，
// 并把「挂在 body 下的固定按钮」锚回它该在的位置。
//
// 为什么需要它（2026-10-17，用户再次上报"思考强度又挤出屏幕外"）：
// 皮肤把「思考强度」做成 **挂在 body 下的 position:fixed 按钮**，坐标由皮肤自己的
// JS 从模型按钮的 getBoundingClientRect() 算出并写进 inline left/top。已知两个易碎点：
//   ① 皮肤换版本就换算法（实测 b570d6bd81a1 → 907327d7a6ec，两套公式）；
//   ② 长模型名 / 窄屏会让皮肤算出的 left 直接冲出视口
//      （实测 320px + 长模型名 + 关闭本插件样式：强度按钮 322→371，右缘超出视口 51px）。
// 前几轮我们靠"认类名 + 限宽模型名"去治，**换皮后必然复发** —— 因为它在猜皮肤是谁。
//
// ── 2026-10-19 重构：为什么必须合并成"唯一观测者"─────────────────────────────
// 此前有两层独立补偿，各自测量、各自写位移：
//   · setupEffortAnchor（键盘坐标系漂移）写 style.transform
//   · setupViewportClamp（越界拉回）   写 CSS 变量 --dshbr-clamp-x
// 两者**互相看不见对方**：各自"先清自己的、再测量、再写"，于是测量到的 rect 里
// 混着对手那一半位移，写回去又互相覆盖。表现为**偶发**挤出边框 —— 命中哪个竞态
// 窗口取决于时序（皮肤写 inline left 的早晚、iOS 键盘动画的中间帧、MutationObserver
// 的投递时机），所以同一台手机时好时坏，压测也复现不稳定。
//
// 本模块的口径（现在只有这一个观测者）：
//   ① 一次 rAF 内：统一清除自己上次写的所有位移 → 统一测量 → 统一计算 → 统一写入；
//   ② 锚定与拉回在同一次计算里合成：先算锚定 dx，再在**锚定后**的位置上判定越界，
//      两个位移互不覆盖地叠加（transform 与 translate 属性本就可叠加）；
//   ③ 自锁精确到"元素 + 写入后的样式快照"，既能挡住自己的写入（防自激），
//      又不会把皮肤的后续写入一起吞掉（此前布尔自锁会漏掉真实变更 → 补偿过期）。
//
// 判定口径（皮肤无关）：只看**可见**、**position:fixed**、且**尺寸像小控件**的元素。
// 隐藏浮层（点开才出现的 visibility:hidden / opacity:0）本来就在视口外，被过滤掉。
// 只在移动端生效；几何健康时一行代码都不执行（零影响）。电脑端一个像素都不动。

// 小控件的尺寸上限：实测需要兜底的按钮 49×28。放宽到 240×120 仍足以排除
// 真正的浮层卡片（实测 241~265×171~184）与顶栏（390×52，宽超限被排除）。
const MAX_W = 240;
const MAX_H = 120;
// 视口左右各留的安全边距（避免贴边、也避开 iOS 安全区）
const PAD = 6;
// 一次扫描最多处理多少个元素，避免病态页面上开销失控
const MAX_NODES = 60;
// 移动端断点上限，与 mobile-styles.js 的 @media (max-width:767px) 对齐。
const MOBILE_MAX_WIDTH = 767;
// 兜底变量名与标记属性（与注入 CSS 的 var() / 选择器一致）
export const CLAMP_VAR = '--dshbr-clamp-x';
export const CLAMP_ATTR = 'data-dshbr-clamp';
const STYLE_ID = 'dsh-bridge-clamp-style';

function isVisible({ display, visibility, opacity, rect }) {
  if (display === 'none' || visibility === 'hidden' || Number(opacity) === 0) return false;
  return rect.width > 0 && rect.height > 0;
}

/**
 * 纯判定核心：给定「样式快照 + 盒子 + 边界」，算出需要的 X 位移（px）。
 * 抽成纯函数是为了能在 Node 里直接单测（不依赖真实 DOM / getComputedStyle）。
 * 返回 0 = 不需要任何干预（健康路径）。
 *
 * @param boundary 允许占据的横向区间 {left, right}。
 *   生产上优先传**输入卡片的左右缘**：真实故障是按钮越出输入卡片（实测长模型名时
 *   右缘比卡片右缘多 12px，虽然还在视口内），只按视口判会漏掉这一档。
 *   传视口宽度则退化为"只要在屏幕内"。
 */
export function computeClampOffset(style, rect, boundary) {
  if (style.position !== 'fixed') return 0;
  if (!isVisible({ ...style, rect })) return 0;
  if (rect.width > MAX_W || rect.height > MAX_H) return 0;
  const { left: bl, right: br } = boundary;
  let dx = 0;
  if (rect.right > br - PAD) dx = br - PAD - rect.right;   // 右侧出界 → 左移
  if (rect.left < bl + PAD) dx = Math.max(dx, bl + PAD - rect.left);   // 左侧出界 → 右移
  return Math.round(dx);   // 量化到整数像素，避免亚像素抖动
}

/**
 * 纯判定核心：把固定按钮锚回目标（模型按钮）右侧并垂直居中，返回需要的位移。
 * iOS 键盘弹起时 fixed 参照系与 rect 坐标系不同步，皮肤算出的坐标会失效
 * —— 实测按钮浮到消息区中间。这里只算差，坐标系没漂移时返回 {0,0}。
 */
export function computeAnchorOffset(btnRect, targetRect, gap = 2) {
  if (!btnRect?.width || !btnRect?.height) return { dx: 0, dy: 0 };
  if (!targetRect?.width || !targetRect?.height) return { dx: 0, dy: 0 };
  return {
    dx: Math.round(targetRect.right + gap - btnRect.left),
    dy: Math.round(targetRect.top + (targetRect.height - btnRect.height) / 2 - btnRect.top),
  };
}

// 边界基准：输入卡片（宿主属性 data-composer-card，与皮肤无关）。取不到就退化为视口。
function boundaryFor(rect, viewportWidth, cardRect) {
  if (cardRect && cardRect.height > 0
      && rect.top < cardRect.bottom && rect.bottom > cardRect.top) {
    return { left: cardRect.left, right: cardRect.right };
  }
  return { left: 0, right: viewportWidth };
}

// 注入一小段 CSS：把兜底变量合成为横向平移。
// ⚠️ 用 **`translate` 属性**而非 transform —— 锚定补偿占用了内联 transform，
// 两条位移必须互不覆盖地叠加（CSS 变换顺序：translate → rotate → scale → transform）。
function ensureClampCss(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `[${CLAMP_ATTR}]{translate:var(${CLAMP_VAR},0px) 0 !important}`;
  (doc.head || doc.documentElement).appendChild(style);
}

// 自己是"写入后"的样式指纹：用于精确区分"我的写入"与"皮肤的真实变更"。
// 布尔自锁做不到这一点 —— 它会把皮肤在我写入期间的改动一起吞掉（补偿随即过期）。
function fingerprint(el) {
  return `${el.getAttribute('style') || ''}\u0000${el.getAttribute(CLAMP_ATTR) || ''}`;
}

/**
 * 安装几何兜底（唯一观测者）。返回 teardown（供测试与热更新用）。
 *
 * @param {object} [deps.anchor] 可选的锚定配置（由调用方告知"谁是按钮、锚在谁旁边"；
 *   本模块因此不必认识任何皮肤类名）。{ btnSelector, targetSelector, popoverSelector, gap }
 */
export function setupViewportClamp(deps = {}) {
  const doc = deps.document || (typeof document !== 'undefined' ? document : null);
  const win = deps.window || (typeof window !== 'undefined' ? window : null);
  const raf = deps.requestAnimationFrame || (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : null);
  const MO = deps.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
  if (!doc || !win || !raf) return () => {};

  const anchorCfg = deps.anchor || null;
  ensureClampCss(doc);
  let rafId = 0;

  // 被我们改过 transform 的元素：记下它原本的值，撤补偿时精确还原
  // （皮肤自己也可能用 transform 做动画，不能一律清成空串）。
  const managed = new Map();   // el -> { prevTransform }
  // 本轮写入后的指纹：observer 据此忽略自己的写入，挡住自激。
  const selfFingerprints = new Map();   // el -> fingerprint

  const clearEl = (el) => {
    const rec = managed.get(el);
    if (rec) el.style.transform = rec.prevTransform;
    el.style.removeProperty(CLAMP_VAR);
    el.removeAttribute(CLAMP_ATTR);
    managed.delete(el);
  };

  const clearAll = () => {
    for (const el of [...managed.keys()]) clearEl(el);
    for (const el of doc.querySelectorAll(`[${CLAMP_ATTR}]`)) {
      el.style.removeProperty(CLAMP_VAR);
      el.removeAttribute(CLAMP_ATTR);
    }
  };

  const sweep = () => {
    rafId = 0;
    try {
      runSweep();
    } finally {
      // 写入全部完成后统一记录指纹：observer 只会忽略"与这一刻一致"的变更，
      // 皮肤的后续改动（指纹变了）照样能触发重扫。
      for (const el of touchedThisRound) selfFingerprints.set(el, fingerprint(el));
      touchedThisRound.clear();
    }
  };

  let touchedThisRound = new Set();

  function runSweep() {
    if (win.innerWidth > MOBILE_MAX_WIDTH) {   // 只在移动端兜底，电脑端一个像素都不许动
      clearAll();
      selfFingerprints.clear();
      return;
    }
    const vw = win.innerWidth;
    const cardEl = doc.querySelector('[data-composer-card]');
    const cardRect = cardEl ? cardEl.getBoundingClientRect() : null;

    // 锚定目标每轮重新取：皮肤可能重建模型按钮节点
    const targetEl = anchorCfg?.targetSelector ? doc.querySelector(anchorCfg.targetSelector) : null;
    const targetRect = targetEl ? targetEl.getBoundingClientRect() : null;
    const gap = anchorCfg?.gap ?? 2;

    // ① 统一清除：把自己上次写的所有位移全部撤掉，得到与皮肤一致的测量基准。
    //    ⚠️ 不先清就量，量到的是"补偿后"的位置 → 下一轮判定"在界内" → 撤掉 →
    //    弹回界外 → 再补偿…… 实测表现为位置来回抖动（这正是"偶发"的来源之一）。
    for (const el of [...managed.keys()]) {
      clearEl(el);
      touchedThisRound.add(el);
    }
    for (const el of doc.querySelectorAll(`[${CLAMP_ATTR}]`)) {
      if (managed.has(el)) continue;
      el.style.removeProperty(CLAMP_VAR);
      el.removeAttribute(CLAMP_ATTR);
      touchedThisRound.add(el);
    }

    // ② 统一测量：先把所有盒子与样式读完，再统一计算与写入。
    //    读写交错会让每次写入都触发一次强制重排（布局抖动），也是抖动来源之一。
    const candidates = new Set();
    let scanned = 0;
    for (const el of doc.body.children) {
      if (scanned++ > MAX_NODES) break;
      candidates.add(el);
    }
    // 锚定按钮/浮层即使不在 body 直接子级也要纳入（皮肤可能改挂载点）
    if (anchorCfg) {
      for (const sel of [anchorCfg.btnSelector, anchorCfg.popoverSelector]) {
        if (!sel) continue;
        const found = doc.querySelector(sel);
        if (found) candidates.add(found);
      }
    }

    const items = [];
    for (const el of candidates) {
      let cs;
      let b;
      try {
        cs = getComputedStyle(el);
        b = el.getBoundingClientRect();
      } catch {
        continue;
      }
      items.push({ el, cs, b });
    }

    // ③ 统一计算：锚定与拉回在同一次计算里合成。
    const writes = [];
    for (const { el, cs, b } of items) {
      let transform = null;
      let dx = 0;
      let dy = 0;

      const isAnchor = Boolean(anchorCfg && (matchesSelector(el, anchorCfg.btnSelector)
        || matchesSelector(el, anchorCfg.popoverSelector)));
      if (isAnchor && targetRect) {
        const off = computeAnchorOffset(b, targetRect, gap);
        dx = off.dx;
        dy = off.dy;
        if (dx || dy) transform = `translate(${dx}px, ${dy}px)`;
      }

      let clampDx = 0;
      if (cs.position === 'fixed') {
        // ⚠️ 关键：越界判定必须用**锚定之后**的位置。此前两层各自算各自的，
        // 拉回层看到的是尚未锚定的旧坐标，于是把按钮拉到一个锚定后仍然越界的地方
        // （或反过来抹掉锚定）—— 两者都"生效"了，合起来却是错的。
        const rect = dx === 0
          ? { left: b.left, right: b.right, width: b.width, height: b.height, top: b.top, bottom: b.bottom }
          : {
            left: b.left + dx, right: b.right + dx, width: b.width, height: b.height,
            top: b.top + dy, bottom: b.bottom + dy,
          };
        clampDx = computeClampOffset(
          { position: cs.position, display: cs.display, visibility: cs.visibility, opacity: cs.opacity },
          rect,
          boundaryFor(rect, vw, cardRect),
        );
      }

      if (transform || clampDx !== 0) writes.push({ el, transform, clampDx });
      else touchedThisRound.add(el);   // 没写入也要记指纹（我们可能刚清过它的补偿）
    }

    // ④ 统一写入
    for (const { el, transform, clampDx } of writes) {
      if (transform) {
        if (!managed.has(el)) managed.set(el, { prevTransform: el.style.transform || '' });
        el.style.transform = transform;
      }
      if (clampDx !== 0) {
        el.style.setProperty(CLAMP_VAR, `${clampDx}px`);
        el.setAttribute(CLAMP_ATTR, '1');
      }
      touchedThisRound.add(el);
    }
  }

  const schedule = () => { if (!rafId) rafId = raf(sweep); };
  win.addEventListener('resize', schedule, { passive: true });
  win.addEventListener('orientationchange', schedule, { passive: true });
  // ⚠️ 刻意**不**监听 scroll：用户往上翻历史时那正是最不该被我们插一脚的时刻，
  // 而固定定位控件的横坐标也不随纵向滚动变化（只有键盘导致视口高度变化时才会动，
  // 那条已由 visualViewport.resize 覆盖）。少一个监听器 = 少一个抢滚动的机会。
  if (win.visualViewport) {
    win.visualViewport.addEventListener('resize', schedule);
    // iOS 键盘弹起/收起过程中视觉视口会连续滚动，中间帧的坐标系是不一致的
    win.visualViewport.addEventListener('scroll', schedule);
  }

  // 皮肤在布局后写 inline left；若只在 resize 时扫一次，可能量到还没写完的旧位置
  // （实测 360px 那一档就是因为扫得太早而漏掉）。
  // ⚠️ 只观察 **body 的直接子元素**（subtree: false）：我们要管的浮动控件本来
  // 就挂在 body 下。观察整棵子树等于把"每个 token 到达"都变成一次 sweep
  // —— 实测流式输出 5 秒触发了 329 次重扫（用户看到的"一闪一闪"就是这个）。
  let mo = null;
  if (MO) {
    mo = new MO((records) => {
      // 精确自锁：只有当"变更后的指纹与我写入后的一致"时才认定是自己的写入。
      // 布尔自锁会把皮肤在同一轮里的真实改动一起吞掉，导致补偿停在过期坐标上。
      for (const record of records) {
        const el = record.target;
        const expected = selfFingerprints.get(el);
        if (expected !== undefined && expected === fingerprint(el)) continue;   // 自己的，忽略
        schedule();
        return;
      }
    });
    mo.observe(doc.body, { childList: true, attributes: true, attributeFilter: ['style', 'class'] });
  }
  schedule();

  return () => {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (mo) { mo.disconnect(); mo = null; }
    win.removeEventListener('resize', schedule);
    win.removeEventListener('orientationchange', schedule);
    if (win.visualViewport) {
      win.visualViewport.removeEventListener('resize', schedule);
      win.visualViewport.removeEventListener('scroll', schedule);
    }
    clearAll();
    selfFingerprints.clear();
    doc.getElementById(STYLE_ID)?.remove();
  };
}

function matchesSelector(el, selector) {
  if (!selector || typeof el.matches !== 'function') return false;
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
}
