// dsh-bridge 移动端 UI 预览生成器
//
// 目的：在没有 DSH 宿主的情况下，把插件真实的 client/mobile-styles.js（经
// host-families.js 的占位符渲染）注入一个**仿真的宿主 DOM**，让移动端 UI
// 可以被直接看到、点开、切页。
//
// 关键：插件样式全靠 @media (max-width:767px) / (max-width:480px) 这类**视口**
// 断点，所以必须用真实的手机尺寸视口打开（见 shoot.mjs 的 --window-size=390,844），
// 把"手机"画成桌面上的一个 div 是无效的。
//
// 做法：
//   1) import 真实的 MOBILE_STYLES_CSS / THEME_TOKENS_CSS；
//   2) 用 0.2.0 基线前缀把 __F_SLOT__ 占位符渲染成真实选择器 —— 与插件运行时
//      走的是同一条路径（renderMobileStyles + resolveHostFamilies）；
//   3) 仿真 DOM 的类名就用这些前缀拼出来，保证选择器真能命中。
//
// 场景：?scene=chat|drawer|settings|settings-detail|collapsed|login
// 用法：node preview/build-preview.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MOBILE_STYLES_CSS } from '../client/mobile-styles.js';
import { THEME_TOKENS_CSS } from '../client/theme-tokens.js';
import { FAMILY_SLOTS, renderMobileStyles } from '../client/host-families.js';

const here = dirname(fileURLToPath(import.meta.url));

// 选 0.2.0 宿主（known 的首项 = 新版优先，与插件运行时优先级一致）
const F = Object.fromEntries(
  Object.entries(FAMILY_SLOTS).map(([slot, spec]) => [slot, spec.known[0]]),
);
// 注意尾部下划线：占位符渲染后选择器形如 [class*="wCInkW_content_"]，
// 仿真类名必须与宿主真实类名完全一致（含 Vite 的尾部下划线），否则一条都命中不了。
const fam = (slot, local) => `${F[slot]}_${local}_`;

const css = [
  THEME_TOKENS_CSS,
  renderMobileStyles(MOBILE_STYLES_CSS, F),
].join('\n');

const CATS = [
  ['远程访问', '📡'],
  ['外观', '🎨'],
  ['模型', '🧠'],
  ['代理', '🔌'],
  ['插件市场', '🧩'],
  ['关于', 'ℹ️'],
];

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#1e1e2e">
<title>dsh-bridge · 移动端 UI 预览</title>
<style>
  /* ============================================================
     A. 宿主基础样式（仿真 DSH Web 外观 —— 非插件 CSS，仅为让插件规则有东西可命中）
     ============================================================ */
  :root {
    --dsw-alias-bg-layer-1: #ffffff;
    --dsw-alias-bg-layer-2: #f4f4f7;
    --dsw-alias-bg-layer-3: #ebebef;
    --dsw-alias-border-l2: #e5e7eb;
    --dsw-alias-label-primary: #111827;
    --dsw-alias-label-secondary: #6b7280;
    --dsw-alias-label-tertiary: #9ca3af;
    --dsw-alias-interactive-bg-hover: rgba(0, 0, 0, 0.05);
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
    background: var(--dsw-alias-bg-layer-1);
    color: var(--dsw-alias-label-primary);
    font-size: 15px; line-height: 1.55;
    overscroll-behavior-y: none; -webkit-overflow-scrolling: touch;
  }
  button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; }

  /* 侧边栏（仿真宿主） */
  .${fam('SIDEBAR', 'root')} { display: flex; flex-direction: column; height: 100%; }
  .${fam('SIDEBAR', 'logoRow')} { display: flex; align-items: center; padding: 12px 14px 8px; font-weight: 700; gap: 8px; }
  .${fam('SIDEBAR', 'logoRow')} .tag { font-size: 9px; background: #111; color: #fff; padding: 1px 5px; border-radius: 4px; }
  .${fam('SIDEBAR', 'toggle')} { margin-left: auto; width: 32px; height: 32px; border-radius: 8px; color: var(--dsw-alias-label-secondary); }
  .${fam('SIDEBAR', 'newSession')} { margin: 4px 12px 10px; padding: 9px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; text-align: center; font-size: 14px; }
  .${fam('SIDEBAR', 'regionArea')} { padding: 0 8px; overflow-y: auto; }
  .ws-rail { font-size: 11px; color: var(--dsw-alias-label-tertiary); padding: 8px 6px 4px; }
  .ws-row { font-size: 13.5px; padding: 8px 9px; border-radius: 8px; display: flex; gap: 7px; align-items: center; }
  .ws-row.active { background: var(--dsw-alias-bg-layer-2); }
  .ws-row .meta { margin-left: auto; font-size: 11px; color: var(--dsw-alias-label-tertiary); }

  /* 对话区。类名必须与插件选择器 div[class*="_centerCol"] 完全一致（无尾下划线） */
  ._centerCol { display: flex; flex-direction: column; min-width: 0; background: var(--dsw-alias-bg-layer-1); }
  .${fam('CONV', 'header')} { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .${fam('CONV', 'crumbs')} { font-size: 13px; color: var(--dsw-alias-label-secondary); }
  .${fam('CONV', 'headerActions')} { display: inline-flex; gap: 4px; }
  .${fam('CONV', 'headerUtilities')} { display: inline-flex; margin-left: 4px; }
  .${fam('PRESET', 'seat')} { font-size: 11.5px; background: rgba(0,0,0,.04); padding: 4px 9px; border-radius: 13px; }
  .${fam('LOG', 'sessionLogButton')} { }
  .${fam('CONV', 'viewArea')} {
    flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px 16px;
  }
  .${fam('CONV', 'composerSeat')} { flex: 0 0 auto; }
  /* min-width:0：flex/grid 子项默认 min-width:auto，长句不换行会撑破容器 */
  .msg { margin-bottom: 14px; min-width: 0; overflow-wrap: anywhere; }
  .msg .who { font-size: 11px; color: var(--dsw-alias-label-tertiary); margin-bottom: 3px; }
  .msg ul { margin: 6px 0; padding-left: 20px; }
  .msg li { margin: 3px 0; }
  .msg table { border-collapse: collapse; }

  /* 输入座 */
  .${fam('COMPOSER', 'card')} textarea { width: 100%; border: none; background: none; resize: none; font: inherit; outline: none; height: 38px; color: inherit; }
  .${fam('COMPOSER', 'row')} { display: flex; align-items: center; gap: 6px; }
  .${fam('COMPOSER', 'tools')} { display: flex; gap: 6px; }
  .${fam('COMPOSER', 'trailing')} { display: flex; align-items: center; gap: 6px; }
  .circle-btn { width: 28px; height: 28px; border-radius: 50%; background: rgba(0,0,0,.05); display: inline-flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0; }
  .${fam('MODEL', 'root')} { display: inline-flex; }
  .${fam('MODEL', 'trigger')} { font-size: 12px; background: rgba(0,0,0,.05); padding: 5px 9px; border-radius: 10px; display: inline-flex; }
  .${fam('MODEL', 'triggerLabel')} { }
  .send-btn { width: 32px; height: 32px; border-radius: 50%; background: #93a5f5; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }

  /* 设置中心（仿真宿主） */
  .${fam('SETTINGS', 'navList')} { display: flex; }
  .${fam('SETTINGS', 'navTitle')} { }
  .${fam('SETTINGS', 'options')} > .row { }
  .${fam('SETTINGS', 'rowText')} { }
  .${fam('SETTINGS', 'header')} > span { }

  /* 折叠条：宿主不提供，由预览注入（样式来自插件 CSS） */
  .dsh-composer-collapsed-bar { cursor: pointer; }

  /* ============================================================
     B. 插件真实 CSS —— mobile-styles.js 占位符已渲染（+ 深色令牌）
     ============================================================ */
${css}
</style>
</head>
<body>
<div id="root" data-slot="root">
  <div class="_frame_">

    <!-- 侧边栏：被插件抽屉化为 fixed -->
    <div id="sidebar" class="_sidebarCol">
      <div class="${fam('SIDEBAR', 'root')}">
        <div class="${fam('SIDEBAR', 'logoRow')}">
          <span>🐋 deepseek</span><span class="tag">HARNESS</span>
          <button class="${fam('SIDEBAR', 'toggle')}" title="收起侧边栏">⟨</button>
        </div>
        <button class="${fam('SIDEBAR', 'newSession')}" aria-label="新建会话">⊕ 新会话</button>
        <div class="${fam('SIDEBAR', 'regionArea')}">
          <div class="ws-rail">工作区</div>
          <div class="ws-row">📁 <span>dsh-bridge</span></div>
          <div class="ws-row active"><span>你好，请介绍一下 dsh-…</span><span class="meta">刚刚</span></div>
          <div class="ws-row"><span>用 plan 模式重构鉴权模块</span><span class="meta">10 分钟前</span></div>
          <div class="ws-row"><span>飞书机器人接入联调</span><span class="meta">1 小时前</span></div>
          <div class="ws-rail">未分组</div>
          <div class="ws-row"><span>随手记：隧道配置备忘</span><span class="meta">昨天</span></div>
        </div>
      </div>
    </div>

    <!-- 对话区 -->
    <div id="center" class="_centerCol">
      <header class="${fam('CONV', 'header')}">
        <nav class="${fam('CONV', 'crumbs')}" aria-label="会话层级">
          <span class="crumbSeg_"><span class="crumbCurrent_">你好，请介绍一下 dsh-bridge</span></span>
        </nav>
        <div class="${fam('CONV', 'headerActions')}"><button class="${fam('PRESET', 'seat')}">🤖 智能体</button></div>
        <div class="${fam('CONV', 'headerUtilities')}">
          <button class="${fam('LOG', 'sessionLogButton')}"><span>Session Log</span>⇩</button>
          <button class="dsh-header-fold-btn" title="折叠/展开输入框">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="18" x2="21" y2="18"></line><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
        </div>
      </header>

      <div class="${fam('CONV', 'viewArea')}" data-conversation-scroll>
        <div class="msg"><div class="who">你</div><div>请介绍一下 dsh-bridge</div></div>
        <div class="msg"><div class="who">deepseek</div><div>
          <p>dsh-bridge 是 DeepSeek Harness 的远程连接插件，核心能力：</p>
          <ul>
            <li>局域网扫码直连 + 多网卡智能切换</li>
            <li>Cloudflare 公网隧道（临时 / 固定域名）</li>
            <li>移动端交互与 PWA 全屏 App</li>
          </ul>
          <pre><code>dsh plugin --profile web add @wenbin_wb/dsh-bridge</code></pre>
        </div></div>
      </div>

      <div class="${fam('CONV', 'composerSeat')}">
        <div class="${fam('COMPOSER', 'card')}">
          <textarea placeholder="给智能体发消息"></textarea>
          <div class="${fam('COMPOSER', 'row')}">
            <div class="${fam('COMPOSER', 'tools')}">
              <button class="circle-btn">＋</button><button class="circle-btn">⧉</button>
            </div>
            <div class="${fam('COMPOSER', 'trailing')}">
              <div class="${fam('MODEL', 'root')}"><button class="${fam('MODEL', 'trigger')}"><span class="${fam('MODEL', 'triggerLabel')}">deepseek-v4-flash</span>⌄</button></div>
              <button class="send-btn">↑</button>
            </div>
          </div>
        </div>
      </div>
      <div class="dsh-composer-collapsed-bar">💬 给智能体发消息（点击展开）</div>
    </div>

    <!-- 右侧栏：默认折叠（第 3 列 0px）。宿主在 <768px 点开时才注入
         data-sidebar-right-panel="fullscreen" 属性，插件据此把它顶到顶栏下方。
         预览里用 scene=rightpanel 模拟这个状态。 -->
    <div class="_rightbarCol">
      <div id="rightPanel">
        <b style="font-size:14px">右侧栏面板</b>
        <p style="font-size:13px;color:#6b7280">官方右侧栏在 &lt;768px 自动全屏，插件把它顶到移动端顶栏下方（top:52px）。</p>
      </div>
    </div>

    <div class="_overlayLayer_"></div>
  </div>
</div>

<div id="settingsMount"></div>
<div id="loginMount"></div>

<script>
(function () {
  const body = document.body;
  const root = document.documentElement;
  const scene = new URLSearchParams(location.search).get('scene') || 'chat';
  const S = ${JSON.stringify(F.SETTINGS)};
  const q = (n) => document.querySelector(n);

  /* ---------- 1. 插件：注入移动端顶栏（对应 setupMobileExperience） ---------- */
  let header = q('.dsh-mobile-app-header');
  if (!header) {
    header = document.createElement('header');
    header.className = 'dsh-mobile-app-header';
    header.innerHTML =
      '<button class="dsh-header-menu-btn" title="打开侧边栏">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">' +
        '<line x1="3" y1="8" x2="21" y2="8"></line><line x1="3" y1="15" x2="14" y2="15"></line></svg></button>' +
      '<div class="dsh-mobile-header-title">新会话</div>' +
      '<button class="dsh-header-new-btn" title="新建会话">' +
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
        '<circle cx="12" cy="12" r="9.5"></circle><line x1="12" y1="8" x2="12" y2="16"></line>' +
        '<line x1="8" y1="12" x2="16" y2="12"></line></svg></button>';
    body.appendChild(header);
  }
  const backdrop = document.createElement('div');
  backdrop.className = 'dsh-mobile-backdrop';
  body.appendChild(backdrop);

  const openDrawer = (on) => body.classList.toggle('dsh-drawer-open', on);
  header.querySelector('.dsh-header-menu-btn').onclick = () => openDrawer(!body.classList.contains('dsh-drawer-open'));
  header.querySelector('.dsh-header-new-btn').onclick = () => openDrawer(false);
  backdrop.onclick = () => openDrawer(false);

  /* ---------- 2. 插件：标题同步（对应 readHostSessionTitle） ---------- */
  const titleEl = header.querySelector('.dsh-mobile-header-title');
  const crumbs = q('.${fam('CONV', 'crumbs')} .crumbCurrent_');
  if (crumbs) titleEl.innerText = (crumbs.textContent || '').trim();

  /* ---------- 3. 插件：边缘滑动手势 ---------- */
  let sx = 0, sy = 0;
  document.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0 && sx <= 35) openDrawer(true);
      else if (dx < 0) openDrawer(false);
    }
  }, { passive: true });

  /* ---------- 4. 插件：composer 折叠 ---------- */
  const foldBtn = q('.dsh-header-fold-btn');
  if (foldBtn) foldBtn.onclick = () => body.classList.toggle('dsh-composer-collapsed');
  const bar = q('.dsh-composer-collapsed-bar');
  if (bar) bar.onclick = () => body.classList.remove('dsh-composer-collapsed');

  /* ---------- 5. 仿真：DSH 设置中心（对应宿主的弹窗 DOM） ---------- */
  const CATS = ${JSON.stringify(CATS)};
  const OPTIONS = {
    '远程访问': [
      ['局域网网卡 / IP 选择', '192.168.1.23（推荐 · Wi-Fi）'],
      ['Cloudflare 隧道', '未开启'],
      ['IM 机器人', '微信 / QQ / 飞书 / Telegram'],
      ['访问认证模式', '扫码免密 + 密码认证'],
    ],
    '外观': [['主题', '浅色'], ['字号', '默认'], ['深色模式', '跟随系统']],
    '模型': [['默认模型', 'deepseek-v4-flash'], ['智能路由', '开启']],
    '代理': [['API 端点', 'https://api.deepseek.com'], ['超时', '60s']],
    '插件市场': [['已安装', '12 个'], ['更新', '1 个可用']],
    '关于': [['版本', '2.14.0'], ['Node.js', 'v24.16.0']],
  };

  function contentHTML(cat) {
    const cn = (n) => S + '_' + n + '_';
    const rows = (OPTIONS[cat] || []).map(function (r) {
      return '<div class="row"><div class="' + cn('rowText') + '"><div>' + r[0] + '</div>' +
        '<div style="font-size:12.5px;color:#9ca3af">' + r[1] + '</div></div></div>';
    }).join('');
    return '<div class="' + cn('content') + '">' +
      '<div class="' + cn('header') + '"><span>' + cat + '</span>' +
      '<button class="' + cn('close') + '" onclick="window.__closeSettings()">✕</button></div>' +
      '<div class="' + cn('options') + '">' + rows + '</div></div>';
  }

  function buildSettings(view) {
    const cn = (n) => S + '_' + n + '_';
    document.getElementById('settingsMount').innerHTML =
      '<div class="' + cn('overlay') + '" data-open="1">' +
      '<div class="' + cn('panel') + '"' + (view === 'detail' ? ' data-dshbr-settings-view="detail"' : '') + '>' +
        '<nav class="' + cn('nav') + '">' +
          '<div class="' + cn('navTitle') + '">' + (view === 'detail' ? CATS[0][0] : '设置') + '</div>' +
          '<div class="' + cn('navList') + '"' + (view === 'detail' ? '>' : ' style="display:flex;flex-direction:column;gap:2px">') +
            (view === 'detail' ? '' :
              CATS.map(function (c, i) { return '<button class="' + cn('navCell') + '" onclick="window.__drill(' + i + ')">' +
                '<span>' + c[1] + '</span><span class="' + cn('navLabel') + '">' + c[0] + '</span></button>'; }).join('')) +
          '</div></nav>' +
        contentHTML(CATS[0][0]) +
      '</div></div>';
  }
  window.__drill = function (i) {
    const cn = (n) => S + '_' + n + '_';
    const panel = q('.' + cn('panel'));
    panel.setAttribute('data-dshbr-settings-view', 'detail');
    panel.querySelector('.' + cn('navTitle')).textContent = CATS[i][0];
    panel.querySelector('.' + cn('options')).innerHTML =
      (OPTIONS[CATS[i][0]] || []).map(function (r) {
        return '<div class="row"><div class="' + cn('rowText') + '"><div>' + r[0] + '</div>' +
          '<div style="font-size:12.5px;color:#9ca3af">' + r[1] + '</div></div></div>';
      }).join('');
  };
  window.__closeSettings = function () { document.getElementById('settingsMount').innerHTML = ''; };

  /* ---------- 6. 插件：设置中心两级钻取门控（对应 setupSettingsDrilldown） ---------- */
  if (typeof window.matchMedia === 'function') {
    const cn = (n) => S + '_' + n + '_';
    const mq = window.matchMedia('(max-width: 480px)');
    if (mq.matches) root.setAttribute('data-dshbr-drilldown', 'ready');
    document.addEventListener('click', (e) => {
      if (!e.target.closest) return;
      const nav = e.target.closest('.' + cn('nav'));
      if (!nav) return;
      const panel = nav.closest('.' + cn('panel'));
      if (e.target.closest('.' + cn('navCell'))) return;  // 宿主自身 onClick 负责切换；预览直接调 __drill
      if (panel.getAttribute('data-dshbr-settings-view') === 'detail') panel.removeAttribute('data-dshbr-settings-view');
    });
  }

  /* ---------- 7. 远程认证登录页（取自 lib/auth/login-template.js 的真实配色） ---------- */
  if (scene === 'login') {
    body.innerHTML =
      '<div style="position:fixed;inset:0;background:#121413;color:#f3f4f6;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,PingFang SC,sans-serif">' +
      '<div style="width:100%;max-width:400px">' +
      '<div style="text-align:center;font-size:22px;font-weight:700;margin-bottom:6px">DeepSeek Harness</div>' +
      '<div style="text-align:center;color:#9ca3af;font-size:13px;margin-bottom:22px">远程安全访问认证</div>' +
      '<div style="background:rgba(26,29,27,.85);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:18px">' +
      '<input type="password" placeholder="请输入访问密码" style="width:100%;padding:11px 13px;border-radius:10px;background:rgba(18,20,19,.7);border:1px solid rgba(255,255,255,.12);color:#f3f4f6;font-size:15px;box-sizing:border-box">' +
      '<button style="width:100%;margin-top:12px;padding:12px;border:none;border-radius:10px;background:#22c55e;color:#052e16;font-size:15px;font-weight:600">登录</button>' +
      '<div style="margin-top:14px;text-align:center;color:#9ca3af;font-size:12.5px">❓ 忘记密码？</div>' +
      '</div></div></div>';
  }

  /* ---------- 8. 初始场景 ---------- */
  if (scene === 'drawer') openDrawer(true);
  if (scene === 'rightpanel') q('#rightPanel').setAttribute('data-sidebar-right-panel', 'fullscreen');
  if (scene === 'settings') buildSettings('list');
  if (scene === 'settings-detail') buildSettings('detail');
  if (scene === 'collapsed') body.classList.add('dsh-composer-collapsed');

  /* 初始滚到底部 */
  const va = q('.${fam('CONV', 'viewArea')}');
  if (va) requestAnimationFrame(() => { va.scrollTop = va.scrollHeight; });
})();
</script>
</body>
</html>`;

mkdirSync(here, { recursive: true });
const file = resolve(here, 'mobile-preview.html');
writeFileSync(file, html, 'utf8');
console.log('Wrote', file);