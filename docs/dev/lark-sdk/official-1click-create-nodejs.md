# 一键创建应用（NodeJS）

Node SDK 提供了 `registerApp` 方法，基于 OAuth 2.0 Device Authorization Grant（RFC 8628）协议实现一键创建应用。

调用该方法会返回一个验证链接，用户在飞书或 Lark 中打开该链接（或扫码）完成授权后，即可自动注册应用并获取凭据（App ID 和 App Secret），无需手动前往开发者后台创建。

查看源码：[node-sdk](https://github.com/larksuite/node-sdk/blob/main/README.zh.md#%E4%B8%80%E9%94%AE%E5%88%9B%E5%BB%BA%E5%BA%94%E7%94%A8)

## 前提条件

- 安装 `@larksuiteoapi/node-sdk`，且 SDK 版本为 1.61.1 及以上。

```shell
  npm install @larksuiteoapi/node-sdk
  ```

## 快速开始示例  

```typescript
import * as lark from '@larksuiteoapi/node-sdk';

try {
    const result = await lark.registerApp({
        onQRCodeReady(info) {
            console.log(`请扫码: ${info.url}`);
            console.log(`链接将在 ${info.expireIn} 秒后过期`);
        },
        onStatusChange(info) {
            // 处理状态变化：'polling' | 'slow_down' | 'domain_switched'
        },
    });

console.log('App ID:', result.client_id);
    console.log('App Secret:', result.client_secret);

// 用获取到的凭据初始化 Client
    const client = new lark.Client({
        appId: result.client_id,
        appSecret: result.client_secret,
    });
} catch (e) {
    // e.code: 'access_denied' | 'expired_token' | 'abort' | ...
    // e.description: 错误描述
    console.error(e.code, e.description);
}
```

## 自定义权限/事件/回调（addons）与更新已有应用

创建应用时，可通过 `addons` 在平台基础模板上**增量**申请权限、事件订阅和回调，这些配置会预填到用户扫码后的确认页中，用户确认后生效：

```typescript
// 创建：增量申请权限/事件/回调，且只允许创建新应用（不可选择已有应用）
const result = await lark.registerApp({
    addons: {
        scopes: { tenant: ['im:message:send_as_bot'], user: ['calendar:calendar:read'] },
        events: { items: { tenant: ['im.message.receive_v1'] } },
        callbacks: { items: ['card.action.trigger'] },
    },
    createOnly: true,
    onQRCodeReady(info) { /* ... */ },
});

// 更新：传入已有应用的 appId，让用户重新扫码确认，为该应用增量开通权限
await lark.registerApp({
    appId: 'cli_xxx',
    addons: { scopes: { tenant: ['drive:drive.metadata:readonly'] } },
    onQRCodeReady(info) { /* ... */ },
});

// 最小基座：丢弃默认模板（仅保留机器人能力，无业务权限），仅展示显式声明的配置项。
// 传入 `preset: false` 时，即使 addons 没有其他配置项也是合法的。
await lark.registerApp({
    addons: {
        preset: false,
        scopes: { tenant: ['im:message:send_as_bot'] },
    },
    onQRCodeReady(info) { /* ... */ },
});
```

- `addons.preset` 用于选择模板基座：`true` / 不传表示保留平台默认模板，并在其上叠加声明的配置项（增量，默认行为）；`false` 表示丢弃默认模板，从最小基座（仅机器人能力，无业务权限）开始，仅展示显式声明的配置项。仅当 `preset: false` 时 `addons` 可以不含其他配置项（最小基座、零增量），否则至少需包含一个权限、事件或回调。
- `addons` 仅支持在基础模板上**增量叠加**，不支持删减基础权限。
- 仅支持 5 类公开配置（应用/用户身份权限、应用/用户身份事件、回调）。敏感配置（事件订阅方式与回调地址、`security.*`、加密 key 等）不能通过 `addons` 传入，需调用[更新应用开发配置 OpenAPI](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/application-v7/application-v7/application-config/patch)。
- SDK 只校验数据形状，不校验权限点/事件/回调名称是否存在；平台目录中不存在的名称会被确认页忽略。
- 
## registerApp 参数

| 参数             | 描述          | 类型          | 必须 | 默认                       |
| --------- | ------------ | ----------- | -- | ----------- |
| domain         | 自定义认证域名（仅 host 部分）                                                                       | string      | 否  | `accounts.feishu.cn`     |
| larkDomain     | 自定义 Lark 认证域名（仅 host 部分），检测到 Lark 租户时自动切换                                                | string      | 否  | `accounts.larksuite.com` |
| source         | 来源标识，拼入二维码 URL 的 `from` 参数，格式为 `node-sdk/{source}`                                       | string      | 否  | -                        |
| signal         | 用于取消轮询的 `AbortSignal`                                                                    | AbortSignal | 否  | -                        |
| onQRCodeReady  | 验证链接就绪时的回调，参数为 `{ url, expireIn }`。可将 URL 渲染为二维码供用户扫码，或直接作为链接展示                          | function    | 是  | -                        |
| onStatusChange | 轮询状态变化时的回调，参数为 `{ status, interval? }`。status 取值：`polling`、`slow_down`、`domain_switched` | function    | 否  | -                        |
| appPreset      | 预设应用信息（头像、名称、描述）。所有字段都是可选的，用户扫码后仍可在页面手动修改                                                  | AppPreset   | 否  | -                        |
| appPreset.avatar | 应用头像 URL，支持 1-6 个；传多个时默认选中第一个。支持 png / jpg / jpeg / webp / gif（gif 自动取一帧，不保留动图）           | string \| string[] | 否  | -                |
| appPreset.name | 应用名称，支持 `{user}` 占位符（替换为扫码用户名称）                                                              | string      | 否  | -                        |
| appPreset.desc | 应用描述，支持 `{user}` 占位符                                                                          | string      | 否  | -                        |
| addons         | 增量权限/事件/回调配置，预填到扫码后的确认页，用户确认后生效。详见上方「自定义权限/事件/回调」                                              | AppAddons   | 否  | -                        |
| addons.preset  | 模板基座选择。`true`/不传：保留平台默认模板，在其上叠加声明的配置项；`false`：丢弃默认模板，使用最小基座（仅机器人能力，无业务权限）。传 `false` 时 `addons` 可不含其他配置项       | boolean     | 否  | `true`                   |
| addons.scopes.tenant | 应用身份权限列表，如 `im:message:send_as_bot`                                                          | string[]    | 否  | -                        |
| addons.scopes.user | 用户身份权限列表，如 `calendar:calendar:read`                                                            | string[]    | 否  | -                        |
| addons.events.items.tenant | 应用身份事件列表，如 `im.message.receive_v1`                                                      | string[]    | 否  | -                        |
| addons.events.items.user | 用户身份事件列表，如 `calendar.calendar.event.changed_v4`                                           | string[]    | 否  | -                        |
| addons.callbacks.items | 回调列表，如 `card.action.trigger`                                                                  | string[]    | 否  | -                        |
| createOnly     | 为 `true` 时落地页仅允许创建新应用，隐藏「选择已有应用」入口，避免误选已有应用导致其配置被覆盖。与 `appId` 同时传入时优先级更高                          | boolean     | 否  | -                        |
| appId          | 已有应用的 App ID（`cli_` 开头）。传入后流程变为更新该应用的配置：确认页展示 `addons` 带来的权限 diff，用户确认后生效。`createOnly` 为 `true` 时被忽略，仍走创建新应用流程 | string      | 否  | -                        |

## 返回值

| 字段 | 类型 | 描述 |
| --- | --- | --- |
| client_id | string | 应用的 App ID |
| client_secret | string | 应用的 App Secret |
| user_info | object（可选） | 扫码授权的用户信息 |
| user_info.open_id | string（可选） | 扫码用户的 open_id |
| user_info.tenant_brand | string（可选） | 租户品牌，取值为 `"feishu"` 或 `"lark"` |

## 错误处理

抛出的错误对象包含 `code` 和 `description` 字段：

| code | 描述 |
| --- | --- |
| `access_denied` | 用户拒绝了授权 |
| `expired_token` | 二维码过期或轮询超时 |
| `abort` | 通过 AbortSignal 取消操作|
