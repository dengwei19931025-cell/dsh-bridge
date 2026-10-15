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
  return {
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    card: box(card), row: box(row), trailing: box(trailing), tools: box(tools), modes: box(modes),
    model: box(model), effort: box(effort), send: box(send),
    effortText: (effort?.textContent || '').trim().slice(0, 10),
    trailingMaxWidth: cs(trailing, 'minWidth'),
    modesOverflowX: cs(modes, 'overflowX'),
    modesScroll: modes ? { client: modes.clientWidth, scroll: modes.scrollWidth } : null,
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

// ── 手机端隐藏底部「账户按钮」（用户说的 wb cn 700 那一行）────────────────────
const accountProbe = () => page.evaluate(() => {
  const info = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { w: Math.round(b.width), h: Math.round(b.height), display: cs.display, visible: cs.display !== 'none' && b.width > 0 && b.height > 0 };
  };
  return {
    btn: info(document.querySelector('.dsh-claude-account-btn')),
    btnText: (document.querySelector('.dsh-claude-account-btn')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    hostRow: info(document.querySelector('[data-dsh-claude-account-host-row]')),
    popover: info(document.querySelector('.dsh-claude-account-popover')),
    // 不能被误伤的东西
    card: info(document.querySelector('[data-composer-card]')),
    row: info(document.querySelector('div[class*="uV2eYG_row"]')),
    model: info(document.querySelector('.dsh-claude-model-btn')),
    effort: info(document.querySelector('.dsh-claude-effort-btn')),
    send: info(document.querySelector('button[class*="uV2eYG_primary"]')),
  };
});

// ── 手机端账户入口必须保留（回归修正）──────────────────────────────────────────────
// ⚠️ 曾经把它隐藏，结果把手机端打开设置的"唯一入口"堵死了（宿主自己的 settings.launcher
// 在手机端本来就是 display:none）。现在断言：按钮与浮层恢复可见、浮层宽度受控。
for (const w of [320, 390, 430]) {
  await page.setViewport({ width: w, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(900);
  const a = await accountProbe();
  say(`${w}px: 账户入口可见（设置入口的载体，绝不能藏）`, a.btn?.visible === true,
    `盒子=${a.btn?.w}×${a.btn?.h} display=${a.btn?.display}`);
  say(`${w}px: 设置项可达（浮层里的 [data-action=settings]）`, true,
    '浮层元素由 React 在点击时渲染，见单测的结构断言');
  say(`${w}px: 输入卡片与工具行未被误伤`, (a.card?.h ?? 0) >= 60 && (a.row?.w ?? 0) > 100,
    `card=${a.card?.w}×${a.card?.h} row=${a.row?.w}×${a.row?.h}`);
  say(`${w}px: 模型 / 思考强度 / 发送 三个控件仍在`, (a.model?.visible ?? false) && (a.effort?.visible ?? false) && (a.send?.visible ?? false),
    `model=${a.model?.visible} effort=${a.effort?.visible} send=${a.send?.visible}`);
}

// 电脑端红线：账户按钮必须照常显示
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await sleep(900);
const desk = await accountProbe();
say('电脑端：账户按钮照常显示（移动端规则不生效）', desk.btn?.visible === true,
  `盒子=${desk.btn?.w}×${desk.btn?.h} display=${desk.btn?.display}`);
if (desk.btn?.visible !== true) fail++;

// ── 手机端隐藏输入区「用量/积分」统计徽标（用户上报的 WB CN · 7）──────────────────
// 复现要点：① 宿主把统计显式显示出来（普通样式，无 !important）；
//          ② 第三方插件往同一槽位追加"渠道+积分"芯片（inline display，无 !important）。
// 断言：手机端两者都必须被我们的 !important 规则压成不可见，且不与权限区重叠；
//      电脑端我们的规则不生效（上抬位移变量不被清零）。
const showHostStats = () => page.evaluate(() => {
  if (document.getElementById('sim-host-stats')) return;
  const s = document.createElement('style');
  s.id = 'sim-host-stats';
  s.textContent = '[data-composer-stats],[data-composer-stat]{display:inline-flex;position:static;height:20px;width:auto;visibility:visible;opacity:1;}';
  document.body.appendChild(s);
});
const addThirdPartyChip = () => page.evaluate(() => {
  if (document.getElementById('sim-third-party-chip')) return;
  const host = document.querySelector('[data-composer-stats]')?.parentElement
    || document.querySelector('div[class*="_dock"]') || document.body;
  const chip = document.createElement('span');
  chip.id = 'sim-third-party-chip';
  chip.setAttribute('data-composer-stat', '');
  chip.style.display = 'inline-flex';
  chip.style.height = '20px';
  chip.textContent = 'WB CN · 7';
  host.appendChild(chip);
});
const statsProbe = () => page.evaluate(() => {
  const cs = (el, p) => (el ? getComputedStyle(el)[p] : null);
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
  const items = [...document.querySelectorAll('[data-composer-stat]')];
  const visible = items.filter((el) => cs(el, 'display') !== 'none' && el.getBoundingClientRect().width > 0);
  const modes = document.querySelector('div[class*="_modes"]');
  const mb = box(modes);
  const overlap = visible.filter((el) => {
    const b = box(el);
    return mb && b && !(b.b < mb.t || b.t > mb.b || b.r < mb.l || b.l > mb.r);
  }).length;
  const chip = document.getElementById('sim-third-party-chip');
  return {
    statItems: items.length,
    visibleStats: visible.length,
    chipDisplay: chip ? cs(chip, 'display') : null,
    chipW: chip ? Math.round(chip.getBoundingClientRect().width) : null,
    modesText: modes ? (modes.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24) : null,
    overlapWithModes: overlap,
    lift: getComputedStyle(document.body).getPropertyValue('--dsh-claude-mobile-stats-lift').trim(),
  };
});

await page.evaluate(() => { const el = document.querySelector('[data-composer-input] [contenteditable="true"], [data-composer-input] textarea'); if (el) el.click(); });
await sleep(1200);
for (const w of [320, 390, 430]) {
  await page.setViewport({ width: w, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(900);
  await page.evaluate(() => { const el = document.querySelector('[data-composer-input] [contenteditable="true"], [data-composer-input] textarea'); if (el) el.click(); });
  await sleep(900);
  await showHostStats();
  await addThirdPartyChip();
  await sleep(700);
  const s = await statsProbe();
  say(`${w}px: 输入区用量/积分统计已隐藏（宿主显式显示也压得住）`, s.statItems > 0 && s.visibleStats === 0,
    `条目=${s.statItems} 可见=${s.visibleStats} 上抬位移=${s.lift || '(未设置)'}`);
  say(`${w}px: 第三方「WB CN · 7」芯片被隐藏（inline display 也压得住）`, s.chipDisplay === 'none' && s.chipW === 0,
    `display=${s.chipDisplay} w=${s.chipW}`);
  say(`${w}px: 统计与权限区不再重叠（权限标签完整可读）`, s.overlapWithModes === 0,
    `重叠数=${s.overlapWithModes} 权限区文本="${s.modesText}"`);
}

// 电脑端红线：我们的统计隐藏规则不生效
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await sleep(1000);
await showHostStats();
await sleep(700);
const deskStats = await statsProbe();
say('电脑端：统计隐藏规则不生效（上抬位移变量未被我们清零）', deskStats.lift !== '0px',
  `--dsh-claude-mobile-stats-lift=${deskStats.lift || '(未设置)'}`);
if (deskStats.lift === '0px') fail++;

// ── 输入行里"其它插件插进来"的控件（渠道积分）必须自适应，不许叠字 ──────────────────
// 复现依据：dsh-connect-workbuddy 通过宿主共享 slot（conversation.input.left）把积分读数
// 插进输入行，元素自带样式 display:inline-flex + min-width:0（内容 nowrap）→
// 窄屏被压到 0 宽后内容照画，压住权限胶囊（用户截图「WB CN · Auto」叠字）。
const injectThirdParty = () => page.evaluate(() => {
  const row = document.querySelector('div[class*="_row"]');
  if (!row) return 'no-row';
  const mk = (cls, id, text) => {
    const el = document.createElement('span');
    el.className = cls;
    el.id = id;
    el.style.display = 'inline-flex';
    el.style.minWidth = '0';
    el.style.whiteSpace = 'nowrap';
    el.textContent = text;
    return el;
  };
  if (!document.getElementById('sim-wb-chip')) row.insertBefore(mk('dsm-workbuddy-composer-credits', 'sim-wb-chip', 'WB CN · 7'), row.firstChild);
  if (!document.getElementById('sim-generic-chip')) row.appendChild(mk('some-third-party-widget', 'sim-generic-chip', 'XYZ · 99'));
  return 'ok';
});
const thirdPartyProbe = () => page.evaluate(() => {
  const cs = (el, p) => (el ? getComputedStyle(el)[p] : null);
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width) }; };
  const chip = document.getElementById('sim-wb-chip');
  const gen = document.getElementById('sim-generic-chip');
  const modes = document.querySelector('div[class*="_modes"]');
  const mb = modes ? modes.getBoundingClientRect() : null;
  // 溢出判据：盒宽不足时，内容仍会画到盒外（用 内容右缘 = 盒左 + scrollWidth 估）
  const spills = (el) => {
    if (!el || !mb) return false;
    const b = el.getBoundingClientRect();
    const contentRight = Math.max(b.right, b.left + el.scrollWidth);
    return el.scrollWidth > b.width + 1 && contentRight > mb.left && b.left < mb.right;
  };
  const visible = (el) => !!el && cs(el, 'display') !== 'none' && el.getBoundingClientRect().width > 0;
  return {
    chipDisplay: chip ? cs(chip, 'display') : null,
    chipBox: box(chip),
    chipOverflow: chip ? cs(chip, 'overflow') : null,
    genericDisplay: gen ? cs(gen, 'display') : null,
    genericOverflow: gen ? cs(gen, 'overflow') : null,
    genericSpills: spills(gen),
    chipSpills: spills(chip),
    // 三个正式控件不能被误裁
    modelClipped: (() => { const m = document.querySelector('.dsh-claude-model-btn'); return m ? m.scrollWidth > m.clientWidth + 1 : null; })(),
    effortVisible: visible(document.querySelector('.dsh-claude-effort-btn')),
    sendVisible: visible(document.querySelector('button[class*="_primary"]')),
    modesScrollable: modes ? cs(modes, 'overflowX') : null,
  };
});

for (const w of [320, 390, 430]) {
  await page.setViewport({ width: w, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(900);
  await injectThirdParty();
  await sleep(600);
  const tp = await thirdPartyProbe();
  say(`${w}px: 渠道积分读数（WB CN · 7）已隐藏`, tp.chipDisplay === 'none' && (tp.chipBox?.w ?? -1) === 0,
    `display=${tp.chipDisplay} box=${JSON.stringify(tp.chipBox)}`);
  say(`${w}px: 任意第三方控件也不会溢出叠字（裁掉溢出）`, tp.genericOverflow === 'hidden' && !tp.genericSpills,
    `overflow=${tp.genericOverflow} 溢出叠字=${tp.genericSpills}`);
  say(`${w}px: 模型/思考强度/发送 三个正式控件未被误裁`,
    tp.modelClipped === false && tp.effortVisible === true && tp.sendVisible === true,
    `model截断=${tp.modelClipped} effort=${tp.effortVisible} send=${tp.sendVisible}`);
  say(`${w}px: 权限区仍可横滑（兜底规则没吃掉它）`, tp.modesScrollable === 'auto', `overflow-x=${tp.modesScrollable}`);
}

// 电脑端红线：我们的隐藏/裁剪规则不生效
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await sleep(900);
await injectThirdParty();
await sleep(600);
const deskTp = await thirdPartyProbe();
say('电脑端：渠道积分不被我们隐藏（移动端规则不生效）', deskTp.chipDisplay !== 'none',
  `display=${deskTp.chipDisplay} overflow=${deskTp.chipOverflow}`);

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
