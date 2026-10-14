// iOS 输入框聚焦放大（zoom-to-focus）修复验收。
//
// 为什么不能只靠 test/ios-input-zoom.test.mjs：结构测试只能证明「CSS 文本里有 16px」，
// 证明不了它在真实宿主 DOM 上真的命中 —— 宿主 composer 是 Lexical 的 contenteditable，
// 插件设置页/工作区弹窗用的是 11~13px 的**内联** font-size，而「内联 vs !important」
// 的优先级只有真实引擎能裁决。
//
// ⚠️ 引擎限制（不写清楚这套件就会被误读）：
//   规则外层是 `@supports (-webkit-touch-callout: none)`，该特性只有 iOS WebKit 成立，
//   桌面无头 Chrome 恒不匹配。因此本套件验的是两件**可以在桌面引擎上判定**的事：
//     1) 注入层结构：插件无条件注入了 #dsh-bridge-ios-input-zoom，且带 iOS 门槛；
//     2) 选择器与优先级：把门槛剥掉后注入同一段内层规则，在真实页面 DOM 上验算
//        「哪些控件会变成 16px、哪些绝不能被改」。
//   「iPhone 上点输入框到底还会不会放大」只能在真机 Safari 上确认——那一步本套件
//   替代不了，只能保证规则本身是对的。
//
// 用法：node test/browser/ios-input-zoom.mjs（或 npm run verify:mobile-ui ios-input）
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { suiteResult, launchOptions, shotsDir, connect, openGui } from './helpers.mjs';

const SHOTS = shotsDir('ios-input-zoom');
const auth = connect();
const PORT = auth.port;

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

const browser = await puppeteer.launch(launchOptions());

const page = await browser.newPage();
await openGui(page, auth, { width: 390, height: 844 });
await new Promise((r) => setTimeout(r, 3500));

// ---- 1. 注入层结构：无条件注入 + iOS 门槛 ----
const layer = await page.evaluate(() => {
  const el = document.getElementById('dsh-bridge-ios-input-zoom');
  return { present: !!el, css: el?.textContent || '', owner: el?.dataset?.pluginCss || '' };
});
say('插件注入了独立的 iOS 输入框放大修复层', layer.present, `len=${layer.css.length}`);
say('该层声明了归属标记（避免宿主 claimStyles 认领后误删）', layer.owner === '@wenbin_wb/dsh-bridge/ios-input-zoom', layer.owner);
say('该层带 iOS 门槛 @supports (-webkit-touch-callout: none)', /@supports\s*\(\s*-webkit-touch-callout:\s*none\s*\)/.test(layer.css));
say('该层用 !important 压过内联 font-size（否则压不过设置页的 11~13px 内联）', /font-size:\s*16px\s*!important/.test(layer.css));
say('该层覆盖宿主 composer 的 contenteditable', /\[contenteditable="true"\]/.test(layer.css));

// ---- 2. viewport：不得再限制缩放（iOS 10+ 本就忽略，留着只会挡掉双指缩放） ----
const vp = await page.evaluate(() => {
  const metas = [...document.querySelectorAll('meta[name="viewport"]')].map((m) => m.getAttribute('content') || '');
  return { count: metas.length, first: metas[0] || '', all: metas.join(' | ') };
});
say('页面存在 viewport meta', vp.count > 0, `count=${vp.count}`);
say('首个 viewport meta 不含 maximum-scale', !/maximum-scale/i.test(vp.first), vp.first);
say('首个 viewport meta 不含 user-scalable', !/user-scalable/i.test(vp.first), vp.first);

// ---- 3. 真实宿主 DOM：composer 是否为可编辑控件（若已开对话） ----
const hostComposer = await page.evaluate(() => {
  const el = document.querySelector('[contenteditable="true"]');
  return el ? { present: true, fontSize: getComputedStyle(el).fontSize } : { present: false };
});
if (hostComposer.present) {
  console.log(`INFO  宿主 composer 命中 [contenteditable="true"]，当前 font-size=${hostComposer.fontSize}（iOS 门槛在桌面引擎不生效，故此处不为 16px 属正常）`);
} else {
  skip('宿主 composer contenteditable 探测', '当前页面没有打开对话（新会话页可能无 composer）');
}

// ---- 4. 剥掉 iOS 门槛后注入同一段内层规则，验算选择器与优先级 ----
const cssInner = layer.css.replace(/@supports[^{]*\{/, '').replace(/\}\s*$/, '');
await page.evaluate((css) => {
  document.querySelectorAll('#dshbr-ios-probe').forEach((n) => n.remove());
  const style = document.createElement('style');
  style.id = 'dshbr-ios-probe';
  style.textContent = css;
  document.head.appendChild(style);
  // 探针：覆盖「必须变 16px」与「绝不能被改」两组，其中一个是 11px 内联，
  // 真实复刻工作区弹窗「手动输入路径」输入框的场景。
  const host = document.createElement('div');
  host.id = 'dshbr-ios-probe-host';
  host.setAttribute('style', 'position:fixed;left:-9999px;top:0;width:300px');
  host.innerHTML = [
    '<input id="p-text" type="text">',
    '<input id="p-pwd" type="password">',
    '<input id="p-inline" type="text" style="font-size: 11px">',
    '<textarea id="p-area"></textarea>',
    '<select id="p-select"><option>a</option></select>',
    '<div id="p-edit" contenteditable="true"></div>',
    '<input id="p-check" type="checkbox">',
    '<input id="p-radio" type="radio">',
    '<input id="p-range" type="range">',
  ].join('');
  document.body.appendChild(host);
}, cssInner);

const probes = await page.evaluate(() => {
  const fs = (id) => {
    const el = document.getElementById(id);
    return el ? getComputedStyle(el).fontSize : null;
  };
  return {
    text: fs('p-text'),
    pwd: fs('p-pwd'),
    inline: fs('p-inline'),
    area: fs('p-area'),
    select: fs('p-select'),
    edit: fs('p-edit'),
    check: fs('p-check'),
    radio: fs('p-radio'),
    range: fs('p-range'),
  };
});

say('文本 input 命中 16px', probes.text === '16px', String(probes.text));
say('密码 input 命中 16px', probes.pwd === '16px', String(probes.pwd));
say('11px 内联 font-size 被 !important 覆盖（复刻工作区弹窗路径输入框）', probes.inline === '16px', String(probes.inline));
say('textarea 命中 16px', probes.area === '16px', String(probes.area));
say('select 命中 16px', probes.select === '16px', String(probes.select));
say('contenteditable 命中 16px（宿主 composer 属这一类）', probes.edit === '16px', String(probes.edit));
say('checkbox 未被误伤（必须保持非 16px）', probes.check !== '16px', String(probes.check));
say('radio 未被误伤（必须保持非 16px）', probes.radio !== '16px', String(probes.radio));
say('range 未被误伤（必须保持非 16px）', probes.range !== '16px', String(probes.range));

await page.evaluate(() => {
  document.querySelectorAll('#dshbr-ios-probe, #dshbr-ios-probe-host').forEach((n) => n.remove());
});
await page.screenshot({ path: path.join(SHOTS, '390x844.png') });
await page.close();
await browser.close();

const failed = rows.filter((r) => !r.ok);
console.log(`\n[ios-input-zoom] 通过 ${rows.length - failed.length}，失败 ${failed.length}，跳过 ${skipRows.length}（${PORT}）`);
if (!suiteResult({ label: 'iOS 输入框聚焦放大修复', pass: rows.length - failed.length, fail: failed.length, skip: skipRows.length })) {
  console.log('失败项：');
  for (const f of failed) console.log(`  - ${f.name} :: ${f.detail}`);
  process.exitCode = 1;
}
