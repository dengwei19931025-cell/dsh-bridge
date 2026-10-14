// 手机端会话头部单行化验收：在**真实宿主**的手机视口里量几何。
//
// 为什么必须实测（CSS 文本断言查不出这些）：
//   1. 宿主的头部在手机端真是两行 grid + min-height:76px，标签行真在第二行；
//   2. 单行化后**不能被右上角图标组压住**：headerCorner 自带 margin-inline-end:-16px，
//      两行布局时它压的是空白，单行化后会压到标签行上（桌面版真实踩到过 16px 重叠，
//      靠网格间隔列吸收）——这条只有量 rect 才能发现；
//   3. 标签行要**真的可见**（opacity:1）：皮肤把它设成悬停显形，触屏没有 hover；
//   4. **电脑端必须没被波及**：桌面宽度下仍是宿主两行。这是本次需求的红线。
//
// 用法：node test/browser/mobile-header-single-row.mjs
//       （或 npm run verify:mobile-ui mobile-header-single）
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { suiteResult, launchOptions, shotsDir, connect, openGui } from './helpers.mjs';

const SHOTS = shotsDir('mobile-header-single-row');
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

/**
 * 进入一个**有内容**的会话。
 * 侧边栏的 treeitem 既有工作区分组行、也有会话行；空会话渲染 headerBlank/sessionless
 * （压根没有标签行）。所以不猜"哪一行是会话"，而是按分数逐个点、每轮看标签行出现没有。
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
        if (/分钟|小时|天|刚刚/.test(t)) s += 5;
        if (/修复|安装|开发|插件|界面|缓存/.test(t)) s += 1;
        if (/新会话/.test(t)) s -= 10;
        if (seen.includes(t)) s -= 20;
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
    if (await page.evaluate(() => !!document.querySelector('div[class*="_tabs"]'))) {
      return { text: picked.t.slice(0, 40), attempt };
    }
  }
  return null;
}

/** 量头部几何 + 标签行可见性 + 两个应被隐藏的按钮 */
const measure = () => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const rect = (e) => {
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), h: Math.round(b.height), w: Math.round(b.width) };
  };
  const cs = (e, p) => (e ? getComputedStyle(e)[p] : null);
  const header = q('header[class*="_header"]');
  const titleRow = q('div[class*="_titleRow"]');
  const corner = q('div[class*="_headerCorner"]');
  const tabs = q('div[class*="_tabs"]');
  // 这两个按钮的类名哈希随 DSH 版本变，故按 aria-label 认（中英双语），与源码锚点一致
  const byLabel = (re) => [...document.querySelectorAll('button[aria-label]')]
    .find((b) => re.test(b.getAttribute('aria-label') || '')) || null;
  const jobs = byLabel(/后台任务|background jobs? running/i);
  const fileOpen = byLabel(/用 .{1,12}打开|Open in /);
  const hiddenInfo = (el) => (el ? {
    label: el.getAttribute('aria-label'),
    display: getComputedStyle(el).display,
    visible: el.getBoundingClientRect().height > 0,
  } : null);

  // 残留分隔竖线计数：titleRow 里"仍可见、宽 ≤4px、高 ≥8px、带左边框"的元素。
  // 隐藏 open-in-app 整组时若只藏按钮本体，这里会数到 1 条（实测 1px solid rgba(0,0,0,.16)）。
  const leftoverDividers = titleRow
    ? [...titleRow.querySelectorAll('*')].filter((el) => {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.width > 4 || b.height < 8) return false;
        const cs2 = getComputedStyle(el);
        return cs2.display !== 'none' && cs2.borderLeftStyle !== 'none' && cs2.borderLeftWidth !== '0px';
      }).length
    : null;

  if (!header || !titleRow || !tabs) {
    return {
      found: false,
      hasHeader: !!header,
      hasTitleRow: !!titleRow,
      hasTabs: !!tabs,
      jobs: hiddenInfo(jobs),
      fileOpen: hiddenInfo(fileOpen),
      leftoverDividers,
    };
  }
  const c = rect(corner);
  const t = rect(tabs);
  const tr = rect(titleRow);
  return {
    found: true,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    header: rect(header),
    headerMinHeight: cs(header, 'minHeight'),
    headerCols: cs(header, 'gridTemplateColumns'),
    titleRow: tr,
    corner: c,
    tabs: t,
    tabsOpacity: cs(tabs, 'opacity'),
    tabsColumn: cs(tabs, 'gridColumnStart'),
    tabsRow: cs(tabs, 'gridRowStart'),
    tabsDisplay: cs(tabs, 'display'),
    tabLabels: [...tabs.children].map((b) => (b.textContent || '').trim()),
    overlapCornerTabs: (c && t) ? Math.max(0, Math.min(c.r, t.r) - Math.max(c.l, t.l)) : null,
    cornerToTabsGap: (c && t) ? t.l - c.r : null,
    // 内容右边界 = 视口宽 - 头部右内边距(16px)
    overflowRight: t.r - (window.innerWidth - 16),
    jobs: hiddenInfo(jobs),
    fileOpen: hiddenInfo(fileOpen),
    leftoverDividers,
  };
});

// ---- 手机视口（iPhone 14 Pro Max 尺寸，与需求截图一致）----
await openGui(page, auth, { width: 433, height: 891 });
await page.setViewport({ width: 433, height: 891, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await sleep(4000);

const entered = await enterSession();
console.log('进入会话:', JSON.stringify(entered));

const geo = await measure();
if (!geo.found) {
  skip('手机端头部几何测量', `没同时找到 header/titleRow/tabs（hasHeader=${geo.hasHeader} hasTitleRow=${geo.hasTitleRow} hasTabs=${geo.hasTabs}）`);
} else {
  console.log(`INFO  头部 h=${geo.header.h} min-height=${geo.headerMinHeight} 列=${geo.headerCols}`);
  console.log(`INFO  titleRow=${geo.titleRow.l}..${geo.titleRow.r} corner=${geo.corner?.l}..${geo.corner?.r} tabs=${geo.tabs.l}..${geo.tabs.r}`);

  say('手机端头部已从两行收成一行（< 50px，两行时实测 76px）', geo.header.h < 50, `h=${geo.header.h}`);
  say('网格补出了间隔列 + 标签列（≥4 列）', geo.headerCols.split(' ').length >= 4, geo.headerCols);
  say('标签行与标题行同排（垂直中心差 ≤ 8px）',
    Math.abs((geo.tabs.t + geo.tabs.h / 2) - (geo.titleRow.t + geo.titleRow.h / 2)) <= 8,
    `tabs.c=${geo.tabs.t + geo.tabs.h / 2} titleRow.c=${geo.titleRow.t + geo.titleRow.h / 2}`);
  say('标签行落在第一行最后一列', geo.tabsColumn === '4' && geo.tabsRow === '1', `column=${geo.tabsColumn} row=${geo.tabsRow}`);
  // 本套件最重要的一条：角标带 -16px 外边距，必须被间隔列吸收
  say('右上角图标组没有压住标签行（重叠必须为 0）', geo.overlapCornerTabs === 0, `overlap=${geo.overlapCornerTabs}px gap=${geo.cornerToTabsGap}px`);
  say('角标与标签行之间留有可见间距', (geo.cornerToTabsGap ?? 0) >= 6, `${geo.cornerToTabsGap}px`);
  say('标签行常显（触屏没有 hover，opacity 必须为 1）', geo.tabsOpacity === '1', `opacity=${geo.tabsOpacity}`);
  say('标签行没被藏掉', geo.tabsDisplay !== 'none', geo.tabsDisplay);
  say('标签功能完好（4 个标签一个不少）', geo.tabLabels.length === 4, geo.tabLabels.join('/'));
  say('标签行没有溢出内容右边界', geo.overflowRight <= 0, `overflow=${geo.overflowRight}px`);

  // 手机端必须隐藏的两个"只对电脑有意义"的按钮（按钮不存在时跳过，例如当前没有后台任务）
  if (geo.jobs) {
    say('手机端已隐藏「后台任务」触发器', geo.jobs.display === 'none' && !geo.jobs.visible,
      `display=${geo.jobs.display} visible=${geo.jobs.visible} label=${geo.jobs.label}`);
  } else {
    skip('手机端隐藏「后台任务」触发器', '当前会话没有后台任务，按钮未渲染');
  }
  if (geo.fileOpen) {
    say('手机端已隐藏「用文件资源管理器打开」按钮', geo.fileOpen.display === 'none' && !geo.fileOpen.visible,
      `display=${geo.fileOpen.display} visible=${geo.fileOpen.visible} label=${geo.fileOpen.label}`);
    // 只藏按钮本体是不够的：这一组还带 1px 分隔线，必须整组消失，否则头部残留一条竖线
    say('该按钮所在整组已消失（不残留 1px 分隔竖线）',
      geo.leftoverDividers === 0, `残留分隔线 ${geo.leftoverDividers} 条`);
  } else {
    skip('手机端隐藏「用文件资源管理器打开」按钮', '当前没有可打开的工作区路径，按钮未渲染');
  }
}

await page.screenshot({ path: path.join(SHOTS, 'mobile-433.png') });

// ---- 390px 小屏再确认一次 ----
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await sleep(1500);
const narrow = await measure();
if (!narrow.found) {
  skip('390px 小屏复测', '没找到 header/tabs');
} else {
  say('390px 同样收成一行且不重叠',
    narrow.header.h < 50 && narrow.overlapCornerTabs === 0,
    `h=${narrow.header.h} overlap=${narrow.overlapCornerTabs} gap=${narrow.cornerToTabsGap}`);
}
await page.screenshot({ path: path.join(SHOTS, 'mobile-390.png') });

// ---- 红线：电脑端必须没被波及 ----
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
await sleep(2000);
const desktop = await measure();
if (!desktop.found) {
  skip('电脑端未被波及检查', '桌面宽度下没找到 header/tabs');
} else {
  say('电脑端仍是宿主两行原样（头部 ≥ 60px 且标签行不在第一行）',
    desktop.header.h >= 60 && desktop.tabsRow !== '1',
    `h=${desktop.header.h} row=${desktop.tabsRow} cols=${desktop.headerCols}`);
  // 红线之二：这两个按钮在电脑端必须还在（隐藏只针对手机端）
  if (desktop.jobs) {
    say('电脑端「后台任务」按钮未被隐藏', desktop.jobs.display !== 'none', `display=${desktop.jobs.display}`);
  } else {
    skip('电脑端「后台任务」按钮未被隐藏', '桌面宽度下该按钮未渲染');
  }
  if (desktop.fileOpen) {
    say('电脑端「用文件资源管理器打开」按钮未被隐藏', desktop.fileOpen.display !== 'none', `display=${desktop.fileOpen.display}`);
  } else {
    skip('电脑端「用文件资源管理器打开」按钮未被隐藏', '桌面宽度下该按钮未渲染');
  }
}
await page.screenshot({ path: path.join(SHOTS, 'desktop-1280.png') });

await page.close();
await browser.close();

const failed = rows.filter((r) => !r.ok);
console.log(`\n[mobile-header-single-row] 通过 ${rows.length - failed.length}，失败 ${failed.length}，跳过 ${skipRows.length}（${auth.port}）`);
if (!suiteResult({ label: '手机端头部单行化', pass: rows.length - failed.length, fail: failed.length, skip: skipRows.length })) {
  console.log('失败项：');
  for (const f of failed) console.log(`  - ${f.name} :: ${f.detail}`);
  process.exitCode = 1;
}
