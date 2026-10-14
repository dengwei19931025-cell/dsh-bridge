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
  const more = byLabel(/更多操作|More actions/i);
  const fold = document.querySelector('.dsh-header-fold-btn');
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
  const cluster = rect(document.querySelector('div[class*="_titleCluster"]'));
  const foldBox = rect(fold);
  const moreInfo = hiddenInfo(more);

  // 模式胶囊（创造模式/标准模式）：它只有 title 没有 aria-label，故先按 title 认，再按 *_label 兜底
  const modeLabel = (() => {
    const scope = header;
    const byTitle = [...scope.querySelectorAll('[title]')]
      .find((el) => /用对话定制|Customize DSH/i.test(el.getAttribute('title') || ''));
    if (byTitle) return byTitle;
    return [...scope.querySelectorAll('span')].find((el) => typeof el.className === 'string'
      && /(^|\s)[A-Za-z0-9_-]+_label(\s|$)/.test(el.className)
      && (el.textContent || '').trim().length <= 8) || null;
  })();
  const modeInfo = hiddenInfo(modeLabel);

  // "合成一条连续胶囊"：三段同底色同高、首尾相接无空隙、只有最外侧留圆角
  const seg = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    return {
      l: Math.round(b.left), r: Math.round(b.right), h: Math.round(b.height),
      bg: s.backgroundColor, radius: s.borderRadius,
    };
  };
  const segs = { utilities: seg(document.querySelector('div[class*="_headerUtilities"]')), tabs: seg(tabs), corner: seg(corner) };
  const sameBar = !!(segs.utilities && segs.tabs && segs.corner)
    && segs.utilities.bg === segs.tabs.bg && segs.corner.bg === segs.tabs.bg
    && segs.utilities.h === segs.tabs.h && segs.corner.h === segs.tabs.h;
  const contiguous = !!(segs.utilities && segs.tabs && segs.corner)
    && Math.abs(segs.utilities.r - segs.tabs.l) <= 1 && Math.abs(segs.tabs.r - segs.corner.l) <= 1;

  // 居中：整条胶囊的中心 vs 头部内容区中心
  const hb = header.getBoundingClientRect();
  const hcs = getComputedStyle(header);
  const contentCenter = (hb.left + parseFloat(hcs.paddingLeft) + hb.right - parseFloat(hcs.paddingRight)) / 2;
  const barL = Math.min(segs.utilities?.l ?? Infinity, segs.tabs?.l ?? Infinity, segs.corner?.l ?? Infinity);
  const barR = Math.max(segs.utilities?.r ?? -Infinity, segs.tabs?.r ?? -Infinity, segs.corner?.r ?? -Infinity);
  const barCenter = (barL + barR) / 2;
  return {
    found: true,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    header: rect(header),
    headerMinHeight: cs(header, 'minHeight'),
    headerCols: cs(header, 'gridTemplateColumns'),
    titleRow: tr,
    titleRowDisplay: cs(titleRow, 'display'),
    cluster,
    fold: foldBox,
    foldDisplay: cs(fold, 'display'),
    corner: c,
    tabs: t,
    tabsOpacity: cs(tabs, 'opacity'),
    tabsColumn: cs(tabs, 'gridColumnStart'),
    tabsRow: cs(tabs, 'gridRowStart'),
    tabsDisplay: cs(tabs, 'display'),
    tabLabels: [...tabs.children].map((b) => (b.textContent || '').trim()),
    overlapCornerTabs: (c && t) ? Math.max(0, Math.min(c.r, t.r) - Math.max(c.l, t.l)) : null,
    cornerToTabsGap: (c && t) ? t.l - c.r : null,
    cornerAfterTabs: (c && t) ? c.l >= t.r - 1 : null,
    // 内容右边界 = 视口宽 - 头部右内边距(16px)
    overflowRight: t.r - (window.innerWidth - 16),
    more: moreInfo,
    jobs: hiddenInfo(jobs),
    fileOpen: hiddenInfo(fileOpen),
    leftoverDividers,
    mode: modeInfo,
    segs,
    sameBar,
    contiguous,
    barCenter: Math.round(barCenter),
    contentCenter: Math.round(contentCenter),
    centeringOffset: Math.round(barCenter - contentCenter),
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
  say('网格补出了标题簇/工具组/标签组/角标四列（共 5 轨）',
    geo.headerCols.split(' ').length >= 5, geo.headerCols);
  // 注：titleRow 现在是 display:contents（没有自己的盒子），所以"与 titleRow 同排"不再可测；
  // 改为直接断言三个子元素与标签行都在第 1 行（见下面那条）。
  say('标签行落在第一行第四列', geo.tabsColumn === '4' && geo.tabsRow === '1', `column=${geo.tabsColumn} row=${geo.tabsRow}`);
  say('标签行常显（触屏没有 hover，opacity 必须为 1）', geo.tabsOpacity === '1', `opacity=${geo.tabsOpacity}`);
  say('标签行没被藏掉', geo.tabsDisplay !== 'none', geo.tabsDisplay);
  say('标签功能完好（4 个标签一个不少）', geo.tabLabels.length === 4, geo.tabLabels.join('/'));
  say('标签行没有溢出内容右边界', geo.overflowRight <= 0, `overflow=${geo.overflowRight}px`);
  say('右侧边栏开关已排到「编队」之后', geo.cornerAfterTabs === true,
    `tabs.r=${geo.tabs.r} corner.l=${geo.corner?.l} gap=${geo.cornerToTabsGap}px`);
  say('角标与标签组没有重叠', geo.overlapCornerTabs === 0, `overlap=${geo.overlapCornerTabs}px`);
  // 三段 [⌄][标签组][▯] 必须真的连成一条（同底色同高 + 首尾相接 + 只有外侧圆角）
  say('三段 [⌄|标签组|▯] 同底色同高（同一条胶囊）', geo.sameBar,
    `utils=${JSON.stringify(geo.segs?.utilities)} tabs=${JSON.stringify(geo.segs?.tabs)} corner=${JSON.stringify(geo.segs?.corner)}`);
  say('三段首尾相接、无空隙', geo.contiguous,
    `utils.r=${geo.segs?.utilities?.r} tabs.l=${geo.segs?.tabs?.l} tabs.r=${geo.segs?.tabs?.r} corner.l=${geo.segs?.corner?.l}`);
  say('只有最外侧留圆角、中段为直角',
    /^7px 0px 0px 7px$/.test(geo.segs?.utilities?.radius || '') && /^0px$/.test(geo.segs?.tabs?.radius || '')
      && /^0px 7px 7px 0px$/.test(geo.segs?.corner?.radius || ''),
    `utils=${geo.segs?.utilities?.radius} tabs=${geo.segs?.tabs?.radius} corner=${geo.segs?.corner?.radius}`);
  say('整条胶囊水平居中（中心与头部内容区中心误差 ≤ 2px）',
    Math.abs(geo.centeringOffset) <= 2,
    `barCenter=${geo.barCenter} contentCenter=${geo.contentCenter} offset=${geo.centeringOffset}px`);
  if (geo.mode) {
    say('手机端已隐藏头部「模式胶囊」（创造模式/标准模式）', geo.mode.display === 'none' && !geo.mode.visible,
      `display=${geo.mode.display} visible=${geo.mode.visible}`);
  } else {
    skip('手机端隐藏头部「模式胶囊」', '当前会话没有渲染该胶囊');
  }
  say('titleRow 已让位（display:contents），三个子元素都排在第 1 行',
    geo.titleRowDisplay === 'contents'
      && [geo.cluster, geo.fold, geo.tabs, geo.corner].every((b) => b && Math.abs(b.t - geo.tabs.t) <= 10),
    `titleRow.display=${geo.titleRowDisplay} cluster.t=${geo.cluster?.t} fold.t=${geo.fold?.t} tabs.t=${geo.tabs.t} corner.t=${geo.corner?.t}`);
  say('⌄（输入框折叠按钮）被保留', !!geo.fold && geo.foldDisplay !== 'none',
    `display=${geo.foldDisplay} rect=${geo.fold ? geo.fold.l + '..' + geo.fold.r : 'null'}`);
  if (geo.more) {
    say('手机端已隐藏「更多操作」(⋯)', geo.more.display === 'none' && !geo.more.visible,
      `display=${geo.more.display} visible=${geo.more.visible}`);
  } else {
    skip('手机端隐藏「更多操作」(⋯)', '当前宿主没有渲染该按钮');
  }

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
  say('390px 同样收成一行、角标在标签之后且不重叠',
    narrow.header.h < 50 && narrow.overlapCornerTabs === 0 && narrow.cornerAfterTabs === true,
    `h=${narrow.header.h} overlap=${narrow.overlapCornerTabs} cornerAfterTabs=${narrow.cornerAfterTabs}`);
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
  if (desktop.more) {
    say('电脑端「更多操作」(⋯) 未被隐藏', desktop.more.display !== 'none', `display=${desktop.more.display}`);
  } else {
    skip('电脑端「更多操作」(⋯) 未被隐藏', '桌面宽度下该按钮未渲染');
  }
  if (desktop.mode) {
    say('电脑端「模式胶囊」未被隐藏（宿主自己的容器查询在桌面宽度下是"显示"）',
      desktop.mode.display !== 'none', `display=${desktop.mode.display}`);
  } else {
    skip('电脑端「模式胶囊」未被隐藏', '桌面宽度下该胶囊未渲染');
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
