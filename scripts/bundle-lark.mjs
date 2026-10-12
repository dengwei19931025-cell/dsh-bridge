// dsh-bridge 飞书 SDK 打包：把官方 @larksuite/channel（Channel SDK）与其依赖的
// @larksuiteoapi/node-sdk 一起打成单文件 lib/feishu/lark-bundled.mjs。
//
// 插件发布物只包含 lib/ 目录（见 package.json files），不携带 node_modules，
// 因此这里把运行时真正用到的官方 SDK 预打包进产物。
//
// 导出的符号即 lib/feishu/ 允许使用的全部官方能力：
//   - createLarkChannel 飞书通道（长连接 / 事件归一化 / 出站渲染 / 流式卡片 / 媒体）
//   - registerApp       一键扫码创建应用（OAuth 2.0 Device Authorization Grant）
//   - LarkChannelError  出站/连接错误的稳定错误码类型
//   - Domain            飞书（feishu）/ Lark（lark）域名枚举
//   - LoggerLevel       SDK 日志级别枚举（与插件日志器对接）
import esbuild from 'esbuild'

await esbuild.build({
  stdin: {
    contents: `
      export { createLarkChannel, registerApp, LarkChannelError } from '@larksuite/channel'
      export { Domain, LoggerLevel } from '@larksuiteoapi/node-sdk'
    `,
    resolveDir: process.cwd(),
    sourcefile: 'lark-bundled-entry.mjs',
    loader: 'js',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  banner: {
    js: `
import { createRequire as __createRequire } from 'node:module';
import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __dirnameFunc } from 'node:path';
const require = __createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirnameFunc(__filename);
`,
  },
  outfile: 'lib/feishu/lark-bundled.mjs',
})

console.log('Bundled successfully!')
