// 会话头部单行化验收：在**真实宿主**里量几何，而不是只断言 CSS 文本。
//
// 为什么必须实测：这条改写依赖只有真页面才能确认的三件事 ——
//   1. 宿主的头部真是 grid 两行（min-height:76px），标签行真在第二行；
//   2. 单行化后**不能被右上角图标组压住**：headerCorner 自带 margin-inline-end:-16px，
//      两行布局时它压的是空白，单行化后会压到标签行上（真实踩到过 16px 重叠，
//      靠网格间隔列吸收）。这条只有量 rect 才能发现，CSS 文本断言查不出来；
//   3. `:has()` 自限在真实 DOM 上成立（新建会话页不该被波及），
//      且 min-width:768px 的门槛真的挡住了手机宽度。
//
// 用法：node test/browser/header-single-row.mjs（或 npm run verify:mobile-ui header-single）
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { suiteResult, launchOptions, shotsDir, connect, openGui } from './helpers.mjs';

const SHOTS = shotsDir('header-single-row');
const auth = connect();

const rows = [];
const skipRows = [];
const say = (name, ok, detail = '') => {
  rows.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const skip = (name, detail = '') => {
  skipRows.push({ name, detail });
  console.log(`SKIP  ${name}${detail ? ' — ' + detail : ''}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch(launchOptions());
const page = await browser.newPage();
// 桌面宽度：这条改写的诉求来自桌面窗口，且最该防的是它被误放进移动端媒体查询
await openGui(page, auth, { width: 1280, height: 800 });
await sleep(6000);

/**
 * 进一个**有内容**的会话。
 *
 * 侧边栏的 treeitem 既有工作区分组行、也有会话行，且空会话渲染的是
 * headerBlank/headerSessionless（压根没有标签行）。所以这里不猜"哪一行是会话"，
 * 而是按分数逐个点、每次点完看标签行出现没有——点工作区行会顺带展开分组，
 * 下一轮就能扫到里面的会话行。
 */
async function enterSession() {
  await page.evaluate(() => {
    if (document.querySelectorAll('[role="treeitem"]').length) return;
    [...document.querySelectorAll('button[aria-label]')]
      .find((b) => /打开侧边栏|open sidebar/i.test(b.getAttribute('aria-label') || ''))?.click();
  });
  await sleep(2000);

  const clickedTexts = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const picked = await page.evaluate((seen) => {
      const list = [...document.querySelectorAll('[role="treeitem"]')];
      const scored = list.map((r, i) => {
        const t = (r.textContent || '').trim();
        let s = 0;
        if (/分钟|小时|天|刚刚/.test(t)) s += 5;   // 有时间戳 = 已产生过消息
        if (/修复|安装|开发|插件/.test(t)) s += 1;
        if (/新会话/.test(t)) s -= 10;              // 空会话没有标签行
        if (seen.includes(t)) s -= 20;              // 已经点过的不再重复
        return { i, t, s };
      }).sort((a, b) => b.s - a.s);
      const best = scored[0];
      if (!best) return null;
      document.querySelectorAll('[role="treeitem"]')[best.i]?.click();
      return best;
    }, clickedTexts);
    if (!picked) break;
    clickedTexts.push(picked.t);
    await sleep(3500);
    const hasTabs = await page.evaluate(() => !!document.querySelector('div[class*="_tabs"]'));
    if (hasTabs) return { text: picked.t.slice(0, 40), attempt };
  }
  return null;
}

/** 量会话头部：高度、网格列、标题行/角标/标签行的矩形与重叠量 */
const measure = () => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const rect = (e) => {
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), h: Math.round(b.height), w: Math.round(b.width) };
  };
  const header = q('header[class*="_header"]');
  const titleRow = q('div[class*="_titleRow"]');
  const corner = q('div[class*="_headerCorner"]');
  const tabs = q('div[class*="_tabs"]');
  if (!header || !titleRow || !tabs) {
    return { found: false, hasHeader: !!header, hasTitleRow: !!titleRow, hasTabs: !!tabs };
  }
  const c = rect(corner);
  const t = rect(tabs);
  const tr = rect(titleRow);
  return {
    found: true,
    header: rect(header),
    headerMinHeight: getComputedStyle(header).minHeight,
    headerCols: getComputedStyle(header).gridTemplateColumns,
    titleRow: tr,
    corner: c,
    tabs: t,
    tabsColumn: getComputedStyle(tabs).gridColumnStart,
    tabsRow: getComputedStyle(tabs).gridRowStart,
    tabsDisplay: getComputedStyle(tabs).display,
    tabLabels: [...tabs.children].map((b) => (b.textContent || '').trim()),
    overlapCornerTabs: (c && t) ? Math.max(0, Math.min(c.r, t.r) - Math.max(c.l, t.l)) : null,
    cornerToTabsGap: (c && t) ? t.l - c.r : null,
  };
});

const entered = await enterSession();
console.log('进入会话:', JSON.stringify(entered));

const geo = await measure();
if (!geo.found) {
  skip('会话头部几何测量', `页面上没同时找到 header/titleRow/tabs（hasHeader=${geo.hasHeader} hasTitleRow=${geo.hasTitleRow} hasTabs=${geo.hasTabs}）`);
} else {
  console.log(`INFO  头部 h=${geo.header.h} min-height=${geo.headerMinHeight} 列=${geo.headerCols}`);
  console.log(`INFO  titleRow=${geo.titleRow.l}..${geo.titleRow.r} corner=${geo.corner?.l}..${geo.corner?.r} tabs=${geo.tabs.l}..${geo.tabs.r}`);

  say('头部已从两行收成一行（高度 < 60px，两行时实测 77px）',
    geo.header.h < 60, `h=${geo.header.h}`);
  say('网格补出了间隔列 + 标签列（≥4 列）',
    geo.headerCols.split(' ').length >= 4, geo.headerCols);
  say('标签行被提到标题行同排（垂直中心差 ≤ 8px）',
    Math.abs((geo.tabs.t + geo.tabs.h / 2) - (geo.titleRow.t + geo.titleRow.h / 2)) <= 8,
    `tabs.c=${geo.tabs.t + geo.tabs.h / 2} titleRow.c=${geo.titleRow.t + geo.titleRow.h / 2}`);
  say('标签行落在第一行最后一列',
    geo.tabsColumn === '4' && geo.tabsRow === '1', `column=${geo.tabsColumn} row=${geo.tabsRow}`);
  // 本套件最重要的一条：角标带 -16px 外边距，必须被间隔列吸收
  say('右上角图标组没有压住标签行（重叠必须为 0）',
    geo.overlapCornerTabs === 0, `overlap=${geo.overlapCornerTabs}px gap=${geo.cornerToTabsGap}px`);
  say('角标与标签行之间留有可见间距', (geo.cornerToTabsGap ?? 0) >= 6, `${geo.cornerToTabsGap}px`);
  say('标签行仍可见（不许用 display:none 假实现）', geo.tabsDisplay !== 'none', geo.tabsDisplay);
  say('标签功能完好（4 个标签一个不少）', geo.tabLabels.length === 4, geo.tabLabels.join('/'));
}

await page.screenshot({ path: path.join(SHOTS, 'session-1280.png') });

// ---- 自限性：新建会话页（headerBlank / headerSessionless）不得被这条改写波及 ----
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button[aria-label]')]
    .find((b) => /新建会话|New session/i.test(b.getAttribute('aria-label') || ''));
  btn?.click();
});
await sleep(4000);
const hero = await measure();
if (!hero.found || !hero.hasTabs) {
  const selfLimit = await page.evaluate(() => {
    const anyHeader = document.querySelector('header[class*="_header"]');
    if (!anyHeader) return null;
    const fam = (anyHeader.className.match(/([A-Za-z0-9_-]+)_header/) || [])[1] || '';
    return fam ? document.querySelectorAll(`header[class*="${fam}_header"]:has(div[class*="${fam}_tabs"])`).length : null;
  });
  say('新建会话页没有标签行，:has() 自限使该改写不匹配任何头部（不波及 hero 页）',
    selfLimit === 0, `matches=${selfLimit} headerH=${hero.header?.h}`);
} else {
  skip('新建会话页自限性检查', '当前"新建会话"仍是会话视图（未回到 hero 页）');
}
await page.screenshot({ path: path.join(SHOTS, 'hero-1280.png') });

// ---- 作用范围：缩到手机宽度后必须交还宿主的两行布局（min-width:768px 门槛） ----
const reentered = await enterSession();
if (!reentered) skip('手机宽度作用范围检查', '没能再进入一个带标签行的会话');
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await sleep(2500);
const narrow = reentered ? await measure() : { found: false, hasTabs: false };
if (!narrow.found) {
  skip('手机宽度作用范围检查', `390px 下没找到 header/titleRow/tabs（hasTabs=${narrow.hasTabs}）——多半是插件的移动端层已接管`);
} else {
  say('390px 下交还宿主两行布局（标签行不在第一行 / 头部未被收窄）',
    narrow.tabsRow !== '1' || narrow.header.h >= 60,
    `row=${narrow.tabsRow} h=${narrow.header.h} cols=${narrow.headerCols}`);
}
await page.screenshot({ path: path.join(SHOTS, 'session-390.png') });

await page.close();
await browser.close();

const failed = rows.filter((r) => !r.ok);
console.log(`\n[header-single-row] 通过 ${rows.length - failed.length}，失败 ${failed.length}，跳过 ${skipRows.length}（${auth.port}）`);
if (!suiteResult({ label: '会话头部单行化', pass: rows.length - failed.length, fail: failed.length, skip: skipRows.length })) {
  console.log('失败项：');
  for (const f of failed) console.log(`  - ${f.name} :: ${f.detail}`);
  process.exitCode = 1;
}
