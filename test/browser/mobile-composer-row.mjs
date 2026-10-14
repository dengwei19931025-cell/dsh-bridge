// 手机端输入卡片「底部工具行」的实机几何守卫。
//
// 用户上报（iOS）："模型思考强度不在底下这一栏，跑到别的地方去了"。
// 根因：宿主的 <F>_standardControls（装着皮肤画的「模型 / 思考强度」两个按钮）会被压到
// 0–20px 宽，而思考强度按钮是固定 33px 压不下去 → 溢出到输入卡片之外。
// 实测（修复前）：320px 卡片右缘 302，强度按钮到 341（整颗跑到卡片外）。
//
// 断言（320 / 390 / 430 三个宽度）：
//   1. 思考强度按钮整颗都在输入卡片内（右缘 ≤ 卡片右缘）；
//   2. 它与「发送」不在同一水平带时不做横向比较，但要保证**不越出卡片**；
//   3. 底部工具行仍是一行（没有把控件挤到第二行）；
//   4. 模型按钮没有被压成 16px 图标；
//   5. 权限区放不下时可横滑（overflow-x:auto + 内容溢出），不是把它顶出行外；
//   6. 电脑端红线：桌面宽度下我们的规则不生效（trailing 仍可收缩、modes 不横滑）。
import puppeteer from 'puppeteer-core';
import { connect, launchOptions, openGui, SUITE_RESULT_PREFIX } from './helpers.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const auth = connect();
const browser = await puppeteer.launch(launchOptions());
const page = await browser.newPage();
// 新会话页就带完整输入卡片（权限模式胶囊 + 模型 + 思考强度 + 发送），无需点进会话
await openGui(page, auth, { width: 1280, height: 800 });
await sleep(6000);

let pass = 0; let fail = 0;
const say = (label, ok, detail) => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

const probe = () => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
  const cs = (el, p) => (el ? getComputedStyle(el)[p] : null);
  const card = q('div[class*="_card"]');
  const row = q('div[class*="_row"]');
  const trailing = q('div[class*="_trailing"]');
  const tools = q('div[class*="_tools"]');
  const modes = q('div[class*="_modes"]');
  const model = q('.dsh-claude-model-btn');
  const effort = q('.dsh-claude-effort-btn');
  const send = q('button[class*="_primary"]');
  const rowChildren = row ? [...row.children].filter((c) => c.getBoundingClientRect().width > 0) : [];
  // 权限胶囊：找出完整落在权限区内的，以及带底色（= 激活）的那个
  const pills = modes ? [...modes.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0) : [];
  const mb = modes?.getBoundingClientRect() || null;
  const inModes = (b) => {
    const r = b.getBoundingClientRect();
    return !!mb && r.left >= mb.left - 1 && r.right <= mb.right + 1;
  };
  const pillInfo = pills.map((b) => ({
    text: (b.textContent || '').trim(),
    active: b.getAttribute('aria-checked') === 'true' || b.hasAttribute('data-active'),
    fully: inModes(b),
    h: Math.round(b.getBoundingClientRect().height),
  }));
  // 皮肤的激活白底是用 JS 算出的 --dsh-claude-pill-x/w 定位的（与头部标签行同一机制）：
  // 我们压缩了胶囊几何，这个指示器必须跟着重算，否则白底会错位到别的胶囊上。
  const segGroup = modes?.querySelector('.dsh-claude-segments') || null;
  const activeSeg = segGroup?.querySelector('[role="radio"][aria-checked="true"], .dsh-claude-segment[data-active]') || null;
  const segStyle = segGroup ? getComputedStyle(segGroup) : null;
  const indicator = (segGroup && activeSeg) ? {
    cssX: parseFloat(segStyle.getPropertyValue('--dsh-claude-pill-x')) || null,
    cssW: parseFloat(segStyle.getPropertyValue('--dsh-claude-pill-w')) || null,
    realX: activeSeg.offsetLeft,
    realW: activeSeg.offsetWidth,
    text: (activeSeg.textContent || '').trim(),
  } : null;
  return {
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    card: box(card), row: box(row), trailing: box(trailing), tools: box(tools), modes: box(modes),
    model: box(model), effort: box(effort), send: box(send),
    effortText: (effort?.textContent || '').trim().slice(0, 10),
    trailingMaxWidth: cs(trailing, 'minWidth'),
    modesOverflowX: cs(modes, 'overflowX'),
    modesScroll: modes ? { client: modes.clientWidth, scroll: modes.scrollWidth } : null,
    modesMask: cs(modes, 'maskImage') !== 'none' ? cs(modes, 'maskImage') : cs(modes, 'webkitMaskImage'),
    fullyVisiblePills: pillInfo.filter((p) => p.fully).map((p) => p.text),
    activePill: pillInfo.find((p) => p.active) || null,
    activePillFullyVisible: (() => { const a = pillInfo.find((p) => p.active); return a ? a.fully : null; })(),
    indicator,
    pillHeight: pillInfo.length ? Math.min(...pillInfo.map((p) => p.h)) : null,
    rowChildrenBands: rowChildren.map((c) => `${(c.className || '').toString().slice(0, 24)}:${Math.round(c.getBoundingClientRect().top)}..${Math.round(c.getBoundingClientRect().bottom)}`),
  };
});

const failList = [];
for (const w of [320, 390, 430]) {
  await page.setViewport({ width: w, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(900);
  const g = await probe();
  if (!g.effort || !g.card) { say(`${w}px: 底部工具行存在（模型/思考强度/发送按钮可定位）`, false, JSON.stringify(g)); continue; }

  const insideCard = g.effort.r <= g.card.r;
  const sameBand = Math.abs(g.effort.t - (g.send?.t ?? -999)) < 8;
  const overlapsSend = sameBand && g.send ? g.effort.r > g.send.l : false;
  say(`${w}px: 思考强度「${g.effortText}」整颗在输入卡片内`, insideCard,
    `effort=${g.effort.l}..${g.effort.r} card.r=${g.card.r}（差 ${g.effort.r - g.card.r}px）`);
  say(`${w}px: 思考强度与发送按钮不重叠`, !overlapsSend,
    `同行=${sameBand} effort.r=${g.effort.r} send.l=${g.send?.l}`);
  say(`${w}px: 底部工具行仍是一行（没有挤到第二行）`, (g.row?.h ?? 99) <= 34, `row.h=${g.row?.h} 子项=${JSON.stringify(g.rowChildrenBands)}`);
  say(`${w}px: 模型按钮没有被压成 16px 图标`, (g.model?.w ?? 0) >= 40, `model.w=${g.model?.w}`);
  say(`${w}px: 权限区放不下时可横滑（不是把右侧顶出行外）`,
    g.modesOverflowX === 'auto' && !!g.modesScroll,
    `overflow-x=${g.modesOverflowX} 可视/内容=${g.modesScroll?.client}/${g.modesScroll?.scroll}`);
  // 观感断言：不能再"齐刷刷切断"。⚠️ 320px 极窄屏可视区只有 ~29px，物理上放不下任何
  // 完整胶囊 —— 那种宽度只要求"没塌成 0 + 能滑 + 有渐隐提示"，不要求完整可见。
  const narrow = w < 390;
  if (narrow) {
    say(`${w}px: 权限区没塌成 0（仍可横滑 + 有渐隐提示）`,
      (g.modes?.w ?? 0) >= 20 && g.modesOverflowX === 'auto',
      `modes.w=${g.modes?.w} overflow-x=${g.modesOverflowX}`);
  } else {
    say(`${w}px: 激活的权限胶囊完整可见（不再被硬切断）`, g.activePillFullyVisible === true,
      `激活胶囊=${g.activePill?.text} 完整可见=${g.activePillFullyVisible}`);
    say(`${w}px: 至少 2 个权限胶囊完整可见`, (g.fullyVisiblePills?.length ?? 0) >= 2,
      `完整可见=${JSON.stringify(g.fullyVisiblePills)}`);
  }
  say(`${w}px: 权限区带右缘渐隐（提示可横滑）`, /linear-gradient\(to right/.test(g.modesMask || ''),
    `mask-image=${String(g.modesMask).slice(0, 60)}`);
  say(`${w}px: 权限胶囊高度 ≥ 22px（点按区没被压小）`, (g.pillHeight ?? 0) >= 22, `pillHeight=${g.pillHeight}`);
  // 我们压缩了胶囊几何，皮肤的激活指示器（--dsh-claude-pill-x/w）必须跟着重算
  const ind = g.indicator;
  say(`${w}px: 激活指示器仍精准对齐（胶囊压缩后皮肤已重算坐标）`,
    !!ind && Math.abs(ind.cssX - ind.realX) <= 2 && Math.abs(ind.cssW - ind.realW) <= 2,
    ind ? `--pill-x=${ind.cssX} vs 实际 ${ind.realX}；--pill-w=${ind.cssW} vs 实际 ${ind.realW}（激活=${ind.text}）` : '未找到指示器变量');
  if (!insideCard) failList.push(`${w}px 强度按钮出了卡片 ${g.effort.r - g.card.r}px`);
}

// 「思考强度」补偿：该按钮是皮肤画的 body 下 position:fixed 元素（不在行内 DOM 里），
// iOS 键盘弹起时坐标系不同步会让它留在旧坐标上浮到消息区。这里模拟该漂移，验证被贴回。
const effortProbe = () => page.evaluate(() => {
  const btn = document.querySelector('.dsh-claude-effort-btn');
  const model = document.querySelector('.dsh-claude-model-btn');
  const pop = document.querySelector('.dsh-claude-effort-popover');
  if (!btn || !model) return null;
  const b = btn.getBoundingClientRect();
  const m = model.getBoundingClientRect();
  return {
    dx: Math.round(m.right + 2 - b.left),
    dy: Math.round(m.top + (m.height - b.height) / 2 - b.top),
    btnTransform: btn.style.transform || '',
    popTransform: pop ? (pop.style.transform || '') : '',
    isFixed: getComputedStyle(btn).position === 'fixed',
    parentIsBody: btn.parentElement === document.body,
  };
});
const pokeViewport = async () => {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
    window.visualViewport?.dispatchEvent(new Event('resize'));
  });
  await sleep(400);
};

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await sleep(900);
const healthy = await effortProbe();
if (!healthy) {
  say('思考强度按钮可定位（用于键盘漂移补偿验证）', false, '未找到 .dsh-claude-effort-btn');
} else {
  say('思考强度按钮确实是皮肤画的 body 下 fixed 元素（补偿的前提）', healthy.isFixed && healthy.parentIsBody,
    `position:fixed=${healthy.isFixed} parentIsBody=${healthy.parentIsBody}`);
  say('健康态：坐标系未漂移时不加任何 transform', healthy.dx === 0 && healthy.dy === 0
    && healthy.btnTransform === '' && healthy.popTransform === '',
    `dx=${healthy.dx} dy=${healthy.dy} btn.transform="${healthy.btnTransform}" pop.transform="${healthy.popTransform}"`);

  // 模拟 iOS 键盘弹起后的坐标系不同步：left +420、top −660
  await page.evaluate(() => {
    const btn = document.querySelector('.dsh-claude-effort-btn');
    btn.style.left = `${Math.round((parseFloat(btn.style.left) || 0) + 420)}px`;
    btn.style.top = `${Math.round((parseFloat(btn.style.top) || 0) - 660)}px`;
  });
  await sleep(250);
  const drifted = await effortProbe();
  say('模拟漂移后：按钮确实离开了模型按钮（复现 iOS 症状）', Math.abs(drifted.dx) > 100 || Math.abs(drifted.dy) > 100,
    `dx=${drifted.dx} dy=${drifted.dy}`);
  await pokeViewport();
  const fixedBack = await effortProbe();
  say('触发视口事件后：被贴回模型按钮右侧（dx/dy ≈ 0）', fixedBack.dx === 0 && fixedBack.dy === 0,
    `dx=${fixedBack.dx} dy=${fixedBack.dy} transform="${fixedBack.btnTransform}"`);
  say('补偿是通过 transform 施加的（没有改皮肤的 left/top/position）', fixedBack.btnTransform.startsWith('translate('),
    `transform="${fixedBack.btnTransform}"`);

  // 漂移消失（皮肤自己修正）：补偿必须完全退回，不能残留
  await page.evaluate(() => {
    const btn = document.querySelector('.dsh-claude-effort-btn');
    btn.style.left = `${Math.round((parseFloat(btn.style.left) || 0) - 420)}px`;
    btn.style.top = `${Math.round((parseFloat(btn.style.top) || 0) + 660)}px`;
  });
  await pokeViewport();
  const cleaned = await effortProbe();
  say('漂移消失后：按钮与浮层的补偿都清干净（无残留）',
    cleaned.btnTransform === '' && cleaned.popTransform === '' && cleaned.dx === 0 && cleaned.dy === 0,
    `btn.transform="${cleaned.btnTransform}" pop.transform="${cleaned.popTransform}" dx=${cleaned.dx} dy=${cleaned.dy}`);
}

// 电脑端红线
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await sleep(900);
const desktop = await probe();
say('电脑端：我们的移动端规则不生效（trailing 不强制 max-content、modes 不横滑）',
  desktop.trailingMaxWidth !== 'max-content' && desktop.modesOverflowX !== 'auto',
  `trailing.min-width=${desktop.trailingMaxWidth} modes.overflow-x=${desktop.modesOverflowX}`);
const desktopEffort = await effortProbe();
if (desktopEffort) {
  say('电脑端：不做键盘漂移补偿（移动端专属）', desktopEffort.btnTransform === '',
    `transform="${desktopEffort.btnTransform}"`);
}

console.log(`\n${SUITE_RESULT_PREFIX} label=手机端输入卡片底部工具行 pass=${pass} skip=0 fail=${fail}`);
if (failList.length) console.log(`失败项：\n  - ${failList.join('\n  - ')}`);
console.log(`==== 手机端输入卡片底部工具行：通过 ${pass}/${pass + fail} ====`);
await browser.close();
process.exit(fail ? 1 : 0);
