// 几何兜底：把「越出视口的可见浮动控件」拉回视口内。
//
// 为什么需要它（2026-10-17，用户再次上报"思考强度又挤出屏幕外"）：
// 皮肤把「思考强度」做成 **挂在 body 下的 position:fixed 按钮**，坐标由皮肤自己的
// JS 从模型按钮的 getBoundingClientRect() 算出并写进 inline left/top。已知两个易碎点：
//   ① 皮肤换版本就换算法（实测 b570d6bd81a1 → 907327d7a6ec，两套公式）；
//   ② 长模型名 / 窄屏会让皮肤算出的 left 直接冲出视口
//      （实测 320px + 长模型名 + 关闭本插件样式：强度按钮 322→371，右缘超出视口 51px）。
// 前两轮我们靠"认类名 + 限宽模型名"去治，**换皮后必然复发** —— 因为它在猜皮肤是谁。
//
// 本模块的口径（皮肤无关）：
//   只看**可见**（display/visibility/opacity 通过、有非零盒子）、**position:fixed**、
//   且**尺寸像小控件**（宽 ≤ MAX_W、高 ≤ MAX_H）的元素；
//   只要它的右缘越过视口右沿（或左缘越过安全边距），就把它横向拉回；离界后清除，
//   避免残留位移。隐藏浮层（点开才出现的 visibility:hidden / opacity:0）本来就在
//   视口外，被过滤掉，不会误伤。
//
// 与 setupEffortAnchor 的关系（关键设计）：
//   那个函数已占用 el.style.transform 做"键盘坐标系漂移补偿"（含 X 与 Y）。
//   若兜底也去写同一个 transform 属性，两者会互相覆盖（实测：键盘补偿把按钮推到
//   离卡片 264px，兜底的拉回随即被覆盖；反过来兜底也会抹掉键盘补偿）。
//   所以兜底**绝不碰 transform**，改为写一个 CSS 变量，再用 `translate` 属性
//   （不是 transform）合成位移 —— CSS 变换顺序是 translate → rotate → scale →
//   transform，两者**互不覆盖地叠加**。于是键盘补偿管 Y（以及它自己那个 X），
//   兜底管"越界拉回"，各管一段，谁都不抹掉谁。
//
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

// DOM 版本：读取实时样式与盒子后交给纯判定核心。
// 边界优先取输入卡片（宿主属性 data-composer-card，与皮肤无关）：控件若在卡片
// 所在的水平带上，就不许越过卡片左右缘；否则退化为视口（浮层之类不在卡带上的）。
function clampOffsetFor(el, viewportWidth, cardRect) {
  const cs = getComputedStyle(el);
  const b = el.getBoundingClientRect();
  let boundary = { left: 0, right: viewportWidth };
  if (cardRect && cardRect.height > 0
      && b.top < cardRect.bottom && b.bottom > cardRect.top) {
    boundary = { left: cardRect.left, right: cardRect.right };
  }
  return computeClampOffset(
    { position: cs.position, display: cs.display, visibility: cs.visibility, opacity: cs.opacity },
    { left: b.left, right: b.right, width: b.width, height: b.height },
    boundary,
  );
}

// 注入一小段 CSS：把兜底变量合成为横向平移。
// ⚠️ 用 **`translate` 属性**而非 transform —— 见文件头"与 setupEffortAnchor 的关系"。
function ensureClampCss(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `[${CLAMP_ATTR}]{translate:var(${CLAMP_VAR},0px) 0 !important}`;
  (doc.head || doc.documentElement).appendChild(style);
}

/**
 * 安装几何兜底。返回 teardown（供测试与热更新用）。
 */
export function setupViewportClamp(deps = {}) {
  const doc = deps.document || (typeof document !== 'undefined' ? document : null);
  const win = deps.window || (typeof window !== 'undefined' ? window : null);
  const raf = deps.requestAnimationFrame || (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : null);
  const MO = deps.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
  if (!doc || !win || !raf) return () => {};

  ensureClampCss(doc);
  let rafId = 0;

  const clearEl = (el) => {
    el.style.removeProperty(CLAMP_VAR);
    el.removeAttribute(CLAMP_ATTR);
  };

  const sweep = () => {
    rafId = 0;
    if (win.innerWidth > MOBILE_MAX_WIDTH) {   // 只在移动端兜底，电脑端一个像素都不许动
      doc.querySelectorAll(`[${CLAMP_ATTR}]`).forEach(clearEl);
      return;
    }
    const vw = win.innerWidth;
    // 边界基准：输入卡片（宿主属性，与皮肤无关）。取不到就退化为视口。
    const cardEl = doc.querySelector('[data-composer-card]');
    const cardRect = cardEl ? cardEl.getBoundingClientRect() : null;
    let scanned = 0;
    for (const el of doc.body.children) {
      if (scanned++ > MAX_NODES) break;
      // ⚠️ 必须先清掉**自己上次的补偿再量**（与 setupEffortAnchor 同一做法）。
      // 否则会自激：加了 translate 之后元素已在界内 → 下一轮量到"在界内" →
      // 清掉补偿 → 元素弹回界外 → 再加上……实测表现为位置来回抖动，
      // 而且各宽度结果随机（只有某一档碰巧停在被兜住的那一帧）。
      const had = el.getAttribute(CLAMP_ATTR) !== null;
      if (had) el.style.removeProperty(CLAMP_VAR);

      let dx;
      try { dx = clampOffsetFor(el, vw, cardRect); } catch { continue; }
      if (dx !== 0) {
        // 写变量、**不碰 transform**：与键盘漂移补偿互不覆盖。
        el.style.setProperty(CLAMP_VAR, `${dx}px`);
        el.setAttribute(CLAMP_ATTR, '1');
      } else if (had) {
        // 撤掉补偿后依然在视口内 → 确认不需要兜底，清掉标记避免残留位移
        el.removeAttribute(CLAMP_ATTR);
      }
    }
  };

  const schedule = () => { if (!rafId) rafId = raf(sweep); };
  win.addEventListener('resize', schedule, { passive: true });
  win.addEventListener('orientationchange', schedule, { passive: true });
  win.addEventListener('scroll', schedule, { passive: true, capture: true });
  if (win.visualViewport) {
    win.visualViewport.addEventListener('resize', schedule);
    win.visualViewport.addEventListener('scroll', schedule);
  }

  // 皮肤在布局后写 inline left；若只在 resize 时扫一次，可能量到还没写完的旧位置
  // （实测 360px 那一档就是因为扫得太早而漏掉）。监听 style/class 变化重扫。
  let mo = null;
  if (MO) {
    mo = new MO(schedule);
    mo.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  }
  schedule();

  return () => {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (mo) { mo.disconnect(); mo = null; }
    win.removeEventListener('resize', schedule);
    win.removeEventListener('orientationchange', schedule);
    win.removeEventListener('scroll', schedule, true);
    if (win.visualViewport) {
      win.visualViewport.removeEventListener('resize', schedule);
      win.visualViewport.removeEventListener('scroll', schedule);
    }
    doc.querySelectorAll(`[${CLAMP_ATTR}]`).forEach(clearEl);
    doc.getElementById(STYLE_ID)?.remove();
  };
}