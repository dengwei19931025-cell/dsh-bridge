// 用 puppeteer-core 在**真实手机视口**下给预览页截图。
//
// 为什么不用 --screenshot + --window-size：headless Chrome 会忽略 --window-size，
// 视口固定 500px（实测），断点就全错了。必须走 CDP 的
// Emulation.setDeviceMetricsOverride，puppeteer 的 setViewport 正是这么做的。
//
// node preview/shoot.mjs
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, 'shots');
mkdirSync(outDir, { recursive: true });

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = 'file:///' + resolve(here, 'mobile-preview.html').replace(/\\/g, '/');

// [名称, scene, 宽, 高]
const SHOTS = [
  ['01-chat', 'chat', 390, 844],
  ['02-drawer', 'drawer', 390, 844],
  ['03-settings-list', 'settings', 390, 844],
  ['04-settings-detail', 'settings-detail', 390, 844],
  ['05-collapsed', 'collapsed', 390, 844],
  ['06-login', 'login', 390, 844],
  ['07-rightpanel', 'rightpanel', 390, 844],
  ['08-tablet-768', 'chat', 768, 1024],
  ['09-landscape', 'chat', 844, 390],
  ['10-small-360', 'settings', 360, 640],
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2'],
});

for (const [name, scene, w, h] of SHOTS) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(`${url}?scene=${scene}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 350));
  await page.screenshot({ path: resolve(outDir, name + '.png') });
  await page.close();
  console.log('✓', name, `${w}×${h}`);
}

await browser.close();