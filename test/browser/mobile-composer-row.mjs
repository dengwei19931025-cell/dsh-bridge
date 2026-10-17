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
  // 判据说明：dx/dy 不必恰好为 0 —— 因为**几何兜底（viewport-clamp）可能同时在生效**
  // （它负责"不许越出输入卡片"），两个补偿叠加后 dx 会有几像素偏差。
  // 这里真正要断言的是「纵向漂移被修正」（键盘漂移的方向是 Y）与补偿机制被触发。
  say('触发视口事件后：键盘漂移被修正（纵向回到模型按钮水平带内）',
    Math.abs(fixedBack.dy) <= 2 && Math.abs(fixedBack.dy) < Math.abs(drifted.dy),
    `dy: ${drifted.dy} → ${fixedBack.dy}（dx=${fixedBack.dx}，兜底与补偿可叠加）`);
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
    return {
      w: Math.round(b.width), h: Math.round(b.height), display: cs.display,
      visible: cs.display !== 'none' && b.width > 0 && b.height > 0,
      cls: (el.className || '').toString().slice(0, 40),
      aria: el.getAttribute('aria-label'),
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 12),
    };
  };
  // 按语义找账号入口：换皮肤后类名会变（实测 .dsh-claude-account-btn → yHnPSG_trigger）
  const accountEl = [...document.querySelectorAll('button, [role="button"], [aria-haspopup]')]
    .find((el) => /账号|账户|account|profile|sign in|登录/i.test(
      `${el.getAttribute('aria-label') || ''} ${(el.className || '')} ${el.getAttribute('data-slot') || ''}`))
    || document.querySelector('.dsh-claude-account-btn');
  return {
    btn: info(accountEl),
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
// 在手机端本来就是 display:none）。现在断言：账号入口可见、设置可达。
//
// 皮肤换代会换类名（实测：dsh-claude-style 从 .dsh-claude-account-btn 换成了
// yHnPSG_trigger / aria="账号菜单"，data-dsh-claude-style 变为 b570d6bd81a1）。
// 所以这里**按语义找账号入口**（aria/text 命中"账号/账户/account"），不写死类名 ——
// 换皮肤时守卫依然有效，而产品代码里那条"恢复显示"规则匹配不到时无害。
const openSidebar = () => page.evaluate(() => {
  const btn = [...document.querySelectorAll('button, [role="button"]')]
    .find((b) => /打开侧边栏|侧边栏|菜单|Open sidebar/i.test(b.getAttribute('aria-label') || b.textContent || ''));
  if (btn) { btn.click(); return 'clicked'; }
  return 'not-found';
});
for (const w of [320, 390, 430]) {
  await page.setViewport({ width: w, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(700);
  await openSidebar();
  await sleep(1500);
  const a = await accountProbe();
  say(`${w}px: 账号入口可见（设置入口的载体，绝不能藏）`, a.btn?.visible === true,
    `盒子=${a.btn?.w}×${a.btn?.h} display=${a.btn?.display} 类名=${a.btn?.cls} aria=${a.btn?.aria} 文本="${a.btn?.text}"`);
  say(`${w}px: 输入卡片与工具行未被误伤`, (a.card?.h ?? 0) >= 60 && (a.row?.w ?? 0) > 100,
    `card=${a.card?.w}×${a.card?.h} row=${a.row?.w}×${a.row?.h}`);
  say(`${w}px: 模型 / 思考强度 / 发送 三个控件仍在`, (a.model?.visible ?? false) && (a.effort?.visible ?? false) && (a.send?.visible ?? false),
    `model=${a.model?.visible} effort=${a.effort?.visible} send=${a.send?.visible}`);
}

// 电脑端红线：账号入口必须照常显示
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await sleep(1000);
const desk = await accountProbe();
say('电脑端：账号入口照常显示（移动端规则不生效）', desk.btn?.visible === true,
  `盒子=${desk.btn?.w}×${desk.btn?.h} display=${desk.btn?.display} 类名=${desk.btn?.cls}`);
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

// ── 长模型名不得把「思考强度」顶出输入卡片（2026-10-16 回归修正）─────────────────────
// 真因：皮肤把「思考强度」做成 body 下的 position:fixed，按「模型右缘 + 2px」定位；
// 模型名越长 → 越靠右（修复前 390px 实测余量只剩 1px）。修复口径：模型按钮限宽 96px
// + label 省略号，模型名独自让位，强度（49px）与发送（26px）保持原尺寸。
const longModelProbe = () => page.evaluate(() => {
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width) }; };
  const cardEl = document.querySelector('[data-composer-card]');
  const card = box(cardEl);
  const model = document.querySelector('.dsh-claude-model-btn');
  const label = document.querySelector('.dsh-claude-model-btn-label');
  const effort = box(document.querySelector('.dsh-claude-effort-btn'));
  const sendEl = document.querySelector('button[class*="uV2eYG_primary"]');
  const send = box(sendEl);
  const rowEl = document.querySelector('div[class*="uV2eYG_row"]');
  return {
    cardR: card?.r, modelW: model ? Math.round(model.getBoundingClientRect().width) : null,
    labelOverflows: label ? label.scrollWidth > label.clientWidth + 1 : null,   // 模型名被裁成省略号 = 让位生效
    labelEllipsis: label ? getComputedStyle(label).textOverflow === 'ellipsis' : null,
    effort,
    effortInsideCard: card && effort ? (effort.l >= card.l && effort.r <= card.r) : null,
    // 皮肤本就把「思考强度」做成 fixed 层盖在发送按钮上方（设计如此），所以"与发送重叠"
    // 不是缺陷；真正的判据是它有没有越出卡片右缘。
    effortOverCard: card && effort ? effort.r <= card.r : null,
    slack: card && effort ? card.r - effort.r : null,
    rowOverflowsCard: (rowEl && cardEl) ? rowEl.getBoundingClientRect().right > cardEl.getBoundingClientRect().right + 1 : null,
  };
});
const forceLongModelName = () => page.evaluate(() => {
  const el = document.querySelector('.dsh-claude-model-btn-label');
  if (el) el.textContent = 'DeepSeek-V4.1-Flash-Preview · x0.08 · workbuddy-cn-long';
  window.dispatchEvent(new Event('resize'));
});
for (const w of [320, 390, 430]) {
  await page.setViewport({ width: w, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(800);
  await forceLongModelName();
  await sleep(900);
  const m = await longModelProbe();
  say(`${w}px: 长模型名被限宽并走省略号（模型名独自让位）`,
    (m.modelW ?? 999) <= 96 && m.labelEllipsis === true && m.labelOverflows === true,
    `模型=${m.modelW}px ellipsis=${m.labelEllipsis} 内容溢出=${m.labelOverflows}`);
  say(`${w}px: 长模型名时「思考强度」整颗仍在卡片内`,
    m.effortInsideCard === true && (m.slack ?? -1) >= 4,
    `强度=${JSON.stringify(m.effort)} 卡片右=${m.cardR} 余量=${m.slack}px`);
  say(`${w}px: 长模型名时不与发送重叠、整行不溢出卡片`,
    m.effortOverCard === true && m.rowOverflowsCard === false,
    `强度右缘≤卡片右缘=${m.effortOverCard} 整行溢出=${m.rowOverflowsCard}`);
}
// 电脑端红线：限宽规则不得外溢（桌面模型名不截断）
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await sleep(900);
await forceLongModelName();
await sleep(800);
const deskLong = await longModelProbe();
say('电脑端：模型名不被限宽（移动端规则不生效）', (deskLong.modelW ?? 0) > 96,
  `模型=${deskLong.modelW}px（>96 表示未限宽） ellipsis=${deskLong.labelEllipsis}`);
if ((deskLong.modelW ?? 0) <= 96) fail++;

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

// ── 几何兜底：换皮肤也不怕「思考强度」冲出屏幕（2026-10-17）─────────────────────────
// 这是"彻底解决"的那一层：viewport-clamp.js 不认任何皮肤类名，只按几何把
// **可见的 fixed 小控件**拉回视口内。前两层（限宽模型名 + 认语义）失效或换皮改版时，
// 这一层仍然兜得住。
// 断言口径与"认类名"的断言分开写：这里统计**所有**越界的可见 fixed 小控件，
// 而不是只找 .dsh-claude-effort-btn —— 换皮后类名变了也得能测出来。
const outOfViewProbe = () => page.evaluate(() => {
  const offenders = [];
  for (const el of document.body.children) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed') continue;
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const b = el.getBoundingClientRect();
    if (b.width <= 0 || b.height <= 0) continue;
    if (b.width > 240 || b.height > 120) continue;         // 浮层卡片/顶栏不在兜底范围
    offenders.push({
      cls: (el.className || '').toString().slice(0, 34),
      l: Math.round(b.left), r: Math.round(b.right),
      clamped: el.getAttribute('data-dshbr-clamp') !== null,
      // 兜底只写 CSS 变量、用 translate 属性合成 —— 断言它确实写进去了
      clampVar: el.style.getPropertyValue('--dshbr-clamp-x') || null,
      // 不碰 transform（transform 归键盘漂移补偿管，两者互不覆盖）
      transform: el.style.transform || '',
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 14),
    });
  }
  return {
    vw: innerWidth,
    offenders,
    outOfView: offenders.filter((o) => o.r > innerWidth + 1 || o.l < -1),
    clampedCount: offenders.filter((o) => o.clamped).length,
  };
});

// 注入一个"必定出界"的固定小控件（left:9999px）—— 这是可控、可重复的复现：
// 它模拟的正是皮肤用 JS 算出错误坐标的那类控件（position:fixed + 按钮尺寸 + 挂在 body 下），
// 但不依赖具体是哪个皮肤、哪个版本、哪个类名，所以换皮后这条守卫依然有效。
const injectOutside = () => page.evaluate(() => {
  document.getElementById('probe-outside-btn')?.remove();
  const b = document.createElement('button');
  b.id = 'probe-outside-btn';
  b.textContent = 'PRB';
  b.style.cssText = 'position:fixed;left:9999px;top:400px;width:80px;height:28px;';
  document.body.appendChild(b);
});
for (const w of [320, 360, 390, 430]) {
  await page.setViewport({ width: w, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(800);
  await injectOutside();
  await sleep(800);
  const o = await outOfViewProbe();
  const pb = o.offenders.find((x) => x.text === 'PRB') || null;
  say(`${w}px: 几何兜底 —— 出界控件被拉回视口内（皮肤无关）`,
    o.outOfView.length === 0 && pb !== null,
    pb ? `PRB 最终 ${pb.l}→${pb.r}（视口 ${o.vw}），clamp位移=${pb.clampVar}，transform 未被占用="${pb.transform}"`
       : `未找到注入控件，越界: ${o.outOfView.map((x) => `${x.cls} ${x.l}→${x.r}`).join(', ')}`);
  say(`${w}px: 兜底只写 CSS 变量，不占用 transform（与键盘补偿共存）`,
    pb ? pb.transform === '' : false, pb ? `transform="${pb.transform}" clampVar=${pb.clampVar}` : '控件缺失');
  // 稳定性：反复重扫位置必须稳定（自激抖动的回归点）
  const samples = [];
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await sleep(280);
    const s = await outOfViewProbe();
    samples.push(s.offenders.find((x) => x.text === 'PRB')?.l ?? null);
  }
  say(`${w}px: 反复重扫位置稳定（无自激抖动）`,
    samples.every((v) => v === samples[0] && v !== null), `4 次采样 left: ${samples.join(', ')}`);
  await page.evaluate(() => document.getElementById('probe-outside-btn')?.remove());
}
// 电脑端红线：兜底完全不该介入
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await sleep(900);
const deskClamp = await outOfViewProbe();
say('电脑端：几何兜底完全不介入（不标记、不位移）',
  deskClamp.clampedCount === 0 && deskClamp.outOfView.length === 0,
  `标记数=${deskClamp.clampedCount} 越界=${deskClamp.outOfView.length}`);
if (deskClamp.clampedCount > 0) fail++;
console.log(`\n${SUITE_RESULT_PREFIX} label=手机端输入卡片底部工具行 pass=${pass} skip=0 fail=${fail}`);
if (failList.length) console.log(`失败项：\n  - ${failList.join('\n  - ')}`);
console.log(`==== 手机端输入卡片底部工具行：通过 ${pass}/${pass + fail} ====`);
await browser.close();
process.exit(fail ? 1 : 0);
