// 守卫：本插件**不提供远端更新**。
//
// 背景（产品决策）：插件只按"本地这一版"运行，不再检查 npm 上的新版本，也不提供
// 一键升级插件 / 一键升级 DSH。原实现散布在宿主（checkVersion/upgradePlugin/upgradeDsh）、
// RPC 端点与客户端面板三处，本文件把它钉死，防止后续改动把这条链路又接回来。
//
// 判定口径（都是"负向断言"，与实现细节解耦）：
//   1. RPC 常量里不得再有这三个端点；
//   2. 宿主不得再向 npm registry 查询本插件/DSH 的版本；
//   3. 宿主不得再存在 upgradePlugin / upgradeDsh / _probeDshUpgrade 这些升级实现；
//   4. 客户端不得再出现"检查更新 / 一键升级"文案与对应端点调用；
//   5. 本地版本显示必须保留 —— getStatus 仍要返回 version 与 dshVersion。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRIDGE_ENDPOINTS } from '../lib/bridge-rpc-constants.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(resolve(repoRoot, f), 'utf8');

/**
 * 去掉注释后再判定：本文件守的是**功能不再存在**，而不是"不许提这段历史"——
 * 源码里保留"原 checkVersion / 一键升级已移除"这类说明注释是有价值的。
 * （行注释只在 `//` 不是 URL 里那种 `://` 时才剥）
 */
const stripComments = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const hostIndex = stripComments(read('lib/index.js'));
const rpc = stripComments(read('lib/bridge-rpc.js'));
const constants = stripComments(read('lib/bridge-rpc-constants.js'));
const clientSource = stripComments(read('client/index.js'));
const clientSourceRaw = read('client/index.js');
const rawBundle = stripComments(read('client/client.js'));

test('RPC 常量：checkVersion / upgradePlugin / upgradeDsh 三个端点必须已移除', () => {
  for (const removed of ['checkVersion', 'upgradePlugin', 'upgradeDsh']) {
    assert.equal(BRIDGE_ENDPOINTS[removed], undefined,
      `端点 ${removed} 必须已移除（远端更新功能已整体删除）`);
    assert.doesNotMatch(constants, new RegExp(`\\b${removed}\\b`),
      `bridge-rpc-constants.js 不得再出现 ${removed}`);
    assert.doesNotMatch(rpc, new RegExp(`BRIDGE_ENDPOINTS\\.${removed}\\b`),
      `bridge-rpc.js 不得再分发 ${removed}`);
  }
});

test('宿主：不得再向 npm registry 查版本，也不得再有升级实现', () => {
  // 只针对"本插件/DSH 的版本查询"；网络诊断里探测 npmmirror 镜像源连通性是另一回事，保留
  assert.doesNotMatch(hostIndex, /registry\.(npmmirror\.com|npmjs\.org)\/@(wenbin_wb\/dsh-bridge|deepseek-ai\/dsh)/,
    '宿主不得再查询本插件/DSH 的远端版本');
  for (const gone of ['async checkVersion', 'async upgradePlugin', 'async upgradeDsh', '_probeDshUpgrade', '_versionCheckCache']) {
    assert.ok(!hostIndex.includes(gone), `宿主不得再保留 ${gone}（远端更新实现应已整体删除）`);
  }
});

test('客户端：不得再有「检查更新 / 一键升级」入口与端点调用', () => {
  for (const text of ['检查更新', '一键升级']) {
    assert.ok(!clientSource.includes(text), `client/index.js 不得再出现「${text}」`);
    assert.ok(!rawBundle.includes(text), `产物里不得再出现「${text}」（需要 npm run build:client）`);
  }
  for (const ep of ['checkVersion', 'upgradePlugin', 'upgradeDsh']) {
    assert.ok(!clientSource.includes(ep), `客户端不得再调用 ${ep}`);
  }
  assert.doesNotMatch(clientSource, /BRIDGE_ENDPOINTS\.(checkVersion|upgradePlugin|upgradeDsh)\b/,
    '客户端不得再引用已移除的端点常量');
});

test('保留项：本地版本仍要能显示（getStatus 提供 version / dshVersion）', () => {
  assert.match(hostIndex, /async getDshVersion\(\)/, '本地 DSH 版本探测必须保留（面板显示用）');
  assert.match(hostIndex, /version:\s*VERSION/, 'getStatus 必须继续返回插件本地版本');
  assert.match(hostIndex, /dshVersion:\s*await this\.getDshVersion\(\)/, 'getStatus 必须继续返回本地 DSH 版本');
  assert.match(clientSource, /function LocalVersionRow\(/, '客户端必须保留"本地版本行"组件');
  assert.match(clientSource, /BRIDGE_ENDPOINTS\.getStatus/, '本地版本行走现有的 getStatus（不新增端点、不联网）');
  // 重启功能与远端更新无关，必须保留
  assert.match(hostIndex, /async restartDsh\(/, '重启功能必须保留');
  assert.equal(BRIDGE_ENDPOINTS.restartDsh, 'restartDsh', 'restartDsh 端点必须保留');
  // 说明注释要留着：让"为什么不再有远端更新"这个决策在代码里可见
  assert.match(clientSourceRaw, /不提供远端更新/, '客户端必须保留"本插件不提供远端更新"的说明注释');
  assert.match(read('lib/bridge-rpc-constants.js'), /已移除/, 'RPC 常量文件必须保留"端点已移除"的说明注释');
});
