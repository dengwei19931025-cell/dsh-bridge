// iOS 输入框聚焦自动放大（WebKit zoom-to-focus）修复的结构守卫。
//
// 背景：iOS Safari 自 iOS 10 起，聚焦 font-size < 16px 的可编辑控件会把整页强行放大，
// 且失焦不还原；它与 viewport 的 maximum-scale / user-scalable 无关，也与屏幕宽度无关
// （横屏 iPhone 844px、iPad 768px+ 一样放大）。唯一解法是让控件自己 ≥16px。
//
// 本文件只做**廉价的结构第一道**（真实命中与优先级由 test/browser/ios-input-zoom.mjs
// 在真实宿主 DOM 上验证）。它守的是三件最容易被人"顺手优化掉"的事：
//   1. 修复层必须**无条件注入**，不能挂回 @media (max-width: 767px) + 移动端让位；
//   2. 必须覆盖宿主 composer 的 contenteditable（DSH 0.2.0 的输入框不是 textarea）；
//   3. 必须排除 checkbox/radio/range 等不触发放大的控件，且不得夹带其它布局改动。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IOS_INPUT_ZOOM_CSS } from '../client/ios-input-zoom.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(resolve(repoRoot, f), 'utf8');

const indexSource = read('client/index.js');
const mobileStyles = read('client/mobile-styles.js');
const rawBundle = read('client/client.js');
const hostIndex = read('lib/index.js');
const loginTemplate = read('lib/auth/login-template.js');

const css = IOS_INPUT_ZOOM_CSS;
/** 去掉注释后的 CSS（占位符/正则断言都基于它，免得注释里的词命中） */
const cssNoComment = css.replace(/\/\*[\s\S]*?\*\//g, '');

test('iOS 门槛：用 @supports (-webkit-touch-callout: none) 而不是 UA 判断', () => {
  assert.match(css, /@supports\s*\(\s*-webkit-touch-callout:\s*none\s*\)/,
    '必须用 iOS 独有的 -webkit-touch-callout 做 CSS 门槛（桌面 Safari / Chrome / Android 均不匹配）');
  assert.doesNotMatch(css, /@media/,
    '不得再套任何宽度断点：横屏 iPhone / iPad 会落在 max-width:767px 外面，放大依旧');
  assert.ok(/^\s*@supports/.test(cssNoComment.trim()),
    '@supports 必须是最外层规则（套在别的块里会跟着那个块一起生效/失效）');
});

test('16px：字号必须 16px 且带 !important（压过插件自身的内联 11~13px）', () => {
  assert.match(cssNoComment, /font-size:\s*16px\s*!important/,
    '必须是 16px + !important：设置页 s.input 与工作区弹窗用的是内联 fontSize，非 !important 压不过');
});

test('选择器：覆盖会触发放大的四类控件（含宿主 composer 的 contenteditable）', () => {
  const selectorPart = cssNoComment.slice(cssNoComment.indexOf('{') + 1);
  const selectors = selectorPart.slice(0, selectorPart.indexOf('{'));
  assert.match(selectors, /(^|[\s,])textarea([\s,]|$)/, '必须覆盖 textarea');
  assert.match(selectors, /(^|[\s,])select([\s,]|$)/, '必须覆盖 select');
  assert.match(selectors, /\[contenteditable="true"\]/,
    '必须覆盖 contenteditable：DSH 0.2.0 的宿主对话输入框是 Lexical 的 contenteditable div，不是 textarea');
  assert.match(selectors, /(^|[\s,])input:not\(/,
    '必须覆盖 input（并对非文本类型做 :not 排除）');
});

test('误伤：checkbox/radio/range 等不触发放大的控件必须排除', () => {
  for (const type of ['checkbox', 'radio', 'range', 'color', 'file', 'button', 'submit', 'reset', 'image']) {
    assert.match(cssNoComment, new RegExp(`:not\\(\\[type="${type}"\\]\\)`),
      `必须排除 [type="${type}"]：它不触发 zoom-to-focus，强改 16px 会把控件撑坏`);
  }
});

test('改动面：这条规则只准改 font-size，不得夹带其它布局/排版改动', () => {
  const blocks = [...cssNoComment.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);
  assert.equal(blocks.length, 1, '应当只有一条内层声明块');
  const decls = blocks[0].split(';').map((d) => d.trim()).filter(Boolean);
  assert.deepEqual(decls, ['font-size: 16px !important'],
    `该层必须只做字号修复，实际声明：${JSON.stringify(decls)}`);
});

test('注入路径：必须无条件注入，不得挂回移动端让位开关或宽度断点层', () => {
  assert.match(indexSource, /import \{ IOS_INPUT_ZOOM_CSS \} from '\.\/ios-input-zoom\.js'/,
    'client/index.js 必须导入该 CSS 模块');
  assert.match(indexSource, /injectIosInputZoom\(\);/, 'apply() 里必须调用注入函数');

  const fn = indexSource.match(/function injectIosInputZoom\(\)\s*\{[\s\S]*?\n\}/);
  assert.ok(fn, '必须存在独立的 injectIosInputZoom() 注入函数');
  assert.doesNotMatch(fn[0], /shouldYield/,
    '注入不得经过 shouldYieldMobileStyles / shouldYieldAllPageTweaks：__TAURI__/__DSH_DESKTOP__/'
    + '第三方响应式插件接管时会被一起让掉，而 iOS 放大与该层无关');
  assert.match(fn[0], /document\.getElementById\('dsh-bridge-ios-input-zoom'\)/,
    '注入必须幂等（按 id 复用节点）');
  assert.match(fn[0], /dataset\.pluginCss = '@wenbin_wb\/dsh-bridge\/ios-input-zoom'/,
    '必须声明归属标记，避免宿主 claimStyles 认领后在 HMR 重载时误删');

  // 反向守卫：不许有人把这个修复"搬回"移动端样式层（那层是 max-width:767px + 可让位）
  assert.doesNotMatch(mobileStyles, /-webkit-touch-callout/,
    'client/mobile-styles.js 里不得出现 iOS 门槛：该层被宽度断点与让位开关双重限制，搬回去就复发');
});

test('产物同步：client.js 里必须带上该层（否则跑 npm run build:client）', () => {
  assert.match(rawBundle, /dsh-bridge-ios-input-zoom/,
    '产物缺少 iOS 修复层注入，请运行 npm run build:client');
  assert.match(rawBundle, /-webkit-touch-callout/,
    '产物缺少 iOS 门槛规则，请运行 npm run build:client');
});

test('门禁登录页：密码框固定 16px（独立页面，不走注入层）', () => {
  const rule = loginTemplate.match(/input\[type="password"\],\s*input\[type="text"\]\s*\{[\s\S]*?\n\s*\}/);
  assert.ok(rule, '登录页必须有 input 样式规则');
  assert.match(rule[0], /font-size:\s*16px/,
    '登录页密码框必须 ≥16px：它是远程访问第一屏，15px 会在 iOS 上一点就放大');
  assert.doesNotMatch(rule[0], /font-size:\s*1[0-5](\.\d+)?px/, '不得留下任何 <16px 的字号');
});

test('viewport：不得再用 maximum-scale / user-scalable 限制缩放', () => {
  // 断言只看 <meta name="viewport"> 的 content 本身：源码注释里提到这两个词属正常
  // （说明"它挡不住 focus zoom"），按整文件否定会把注释一起误判。
  const loginViewport = loginTemplate.match(/<meta name="viewport" content="([^"]*)">/);
  assert.ok(loginViewport, '登录页必须有 viewport meta');
  assert.doesNotMatch(loginViewport[1], /maximum-scale|user-scalable/,
    '登录页 viewport 不得限制缩放（iOS 10+ 本就忽略，留着只会挡掉双指缩放的可访问性）');
  assert.match(loginViewport[1], /width=device-width/);

  const head = hostIndex.match(/const HTML_HEAD_ASSETS = `([\s\S]*?)`;/);
  assert.ok(head, '必须能取到 HTML_HEAD_ASSETS');
  const hostViewport = head[1].match(/<meta name="viewport" content="([^"]*)">/);
  assert.ok(hostViewport, '宿主页注入片段必须有 viewport meta');
  assert.doesNotMatch(hostViewport[1], /maximum-scale|user-scalable/,
    '宿主页注入的 viewport 不得限制缩放（它插在 <head> 最前，是浏览器采用的那一条）');
  assert.equal(hostViewport[1], 'width=device-width, initial-scale=1.0, viewport-fit=cover',
    'viewport 应只保留 width/initial-scale/viewport-fit');
});
