# 一键创建飞书智能体应用

飞书开放平台提供 **一键创建飞书智能体应用** 能力，帮助 OpenClaw、Hermes 等 AI Agent 快速接入飞书、与用户在飞书中进行交互。

## 适用场景

当你开发了一个 AI Agent（如基于 OpenClaw、Hermes 构建的智能体），想让它进入飞书、与用户在飞书中进行交互——接收和发送消息、传输文件等。

传统流程中，用户需要进入飞书开发者后台手动创建应用、配置权限与事件订阅，操作繁琐且门槛高。

通过本 SDK，AI Agent 可以帮助用户一键完成飞书应用的创建，自动预置所有必要的权限和事件订阅（参考[附录](https://open.feishu.cn/document/mcp_open_tools/integrating-agents-with-feishu/overview#4cb6e715)），用户只需扫码确认，即可获取 App ID 和 App Secret，直接投入使用。

## 使用效果

接入 SDK 后，用户通过以下三步完成飞书应用创建：

**第一步：用户打开应用创建链接或二维码**

示例链接：
```json 
https://open.feishu.cn/page/launcher?user_code=XXXX-XXXX&from=sdk&source=node-sdk&tp=sdk  
``` 
> 链接在十分钟内有效，仅支持一位用户点击或扫码使用。

**第二步：创建应用，可选择已有应用/新增应用**
支持通过 SDK 参数传入 **应用头像**、**名称**、**描述**，并通过 `addons.preset` 参数控制是否基于「智能体应用配置清单」 所包含的 **权限**、**事件订阅** 与 **回调** 清单来创建应用。

![image.png](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/89c7b37affc03d2b87c903342cf3ac14_saJkI1xwFf.png?height=840&lazyload=true&maxWidth=350&width=988)

**第三步：创建完成，获取应用凭证**

应用创建成功后，自动返回 App ID 和 App Secret，所有权限与事件订阅已预置完毕，可直接用于调用飞书 API。

![img_v3_0210v_eb6ed579-35d0-4f11-a58a-990b87c9129h.jpg](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/78940de345bac2a77b20ce96de4f5faf_GMNWcrFObf.jpg?height=542&lazyload=true&maxWidth=350&width=828)

## 接入方式

- **Node.js SDK**：[扫码一键创建应用（NodeJS）](https://open.feishu.cn/document/mcp_open_tools/integrating-agents-with-feishu/scan-to-create-an-app-in-one-click-nodejs)
- **Python SDK**：[扫码一键创建应用（Python）](https://open.feishu.cn/document/mcp_open_tools/scan-to-create-an-app-in-one-click)
- **JAVA SDK**：[扫码一键创建应用（JAVA）](https://open.feishu.cn/document/mcp_open_tools/integrating-agents-with-feishu/create-an-app-in-one-click-java)
- **Go SDK**：[扫码一键创建应用（Go）](https://open.feishu.cn/document/mcp_open_tools/integrating-agents-with-feishu/create-an-app-in-one-click-go)

## 附录：智能体应用配置清单

创建的飞书应用默认包含以下权限和事件订阅，覆盖 AI 智能体的常用场景，包括在单聊、群聊中接受、发送消息；在文档评论中 at 智能体，智能体可回复文档评论。

### 应用能力

机器人

### 权限管理

- **应用身份权限**

| 权限名称                   | 权限标识                                         |
| ---------------------- | -------------------------------------------- |
| 管理应用自身资源               | application:application:self_manage          |
| 创建、更新、删除机器人菜单          | application:bot.menu:write                   |
| 获取卡片信息                 | cardkit:card:read                            |
| 创建与更新卡片                | cardkit:card:write                           |
| 获取通讯录基本信息              | contact:contact.base:readonly                |
| 添加、回复文档中的评论            | docs:document.comment:create                 |
| 删除云文档中的评论              | docs:document.comment:delete                 |
| 获取云文档中的评论              | docs:document.comment:read                   |
| 修改云文档中的评论              | docs:document.comment:update                 |
| 回复、修改、删除云文档中的评论        | docs:document.comment:write_only           |
| 转换文本为云文档块              | docx:document.block:convert                  |
| 查看新版文档                 | docx:document:readonly                       |
| 编辑新版文档                 | docx:document:write_only                     |
| 查看云空间中文件元数据            | drive:drive.metadata:readonly                |
| 订阅机器人进、出群事件            | im:chat.members:bot_access                   |
| 查看群信息                  | im:chat:read                                 |
| 更新群信息                  | im:chat:update                               |
| 创建群                  | im:chat:create                               |
| 获取群组中其他机器人和用户@当前机器人的消息 | im:message.group_at_msg.include_bot:readonly |
| 获取群组中用户@机器人消息          | im:message.group_at_msg:readonly             |
| 读取用户发给机器人的单聊消息         | im:message.p2p_msg:readonly                  |
| 查看 Pin 消息              | im:message.pins:read                         |
| 添加、取消 Pin 消息           | im:message.pins:write_only                   |
| 查看消息表情回复               | im:message.reactions:read                    |
| 发送、删除消息表情回复            | im:message.reactions:write_only              |
| 获取单聊、群组消息              | im:message:readonly                          |
| 以应用的身份发消息              | im:message:send_as_bot                       |
| 给多个用户批量发消息             | im:message:send_multi_users                  |
| 发送特定模板系统消息             | im:message:send_sys_msg                      |
| 更新消息                   | im:message:update                            |
| 获取与上传图片或文件资源           | im:resource
| 获取机器人的基本信息      | application:bot.basic_info:read |
| 查看知识空间节点信息    | wiki:node:read |
| 查询 Slash Command    | application:app_slash_command:read |
| 编辑 Slash Command    | application:app_slash_command:write |

- **用户身份权限**

| 权限名称       | 权限标识                                |
| ---------- | ----------------------------------- |
| 持续访问已授权的数据 | offline_access

- **开发者后台的权限导入清单参考**

```json 
{
  "scopes": {
    "tenant": [
      "contact:contact.base:readonly",
      "im:chat:create",
      "im:chat:read",
      "im:chat:update",
      "im:message.group_at_msg:readonly",
      "im:message.p2p_msg:readonly",
      "im:message.pins:read",
      "im:message.pins:write_only",
      "im:message.reactions:read",
      "im:message.reactions:write_only",
      "im:message:readonly",
      "im:message:send_as_bot",
      "im:message:send_multi_users",
      "im:message:send_sys_msg",
      "im:message:update",
      "im:resource",
      "im:message.group_at_msg.include_bot:readonly",
      "application:bot.basic_info:read",
      "application:application:self_manage",
      "cardkit:card:write",
      "cardkit:card:read",
      "application:bot.menu:write",
      "im:chat.members:bot_access",
      "drive:drive.metadata:readonly",
      "docs:document.comment:create",
      "docs:document.comment:delete",
      "docs:document.comment:read",
      "docs:document.comment:update",
      "docs:document.comment:write_only",
      "docx:document:readonly",
      "docx:document:write_only",
      "wiki:node:read",
      "docx:document.block:convert",
      "application:app_slash_command:read",
      "application:app_slash_command:write"
    ],
    "user": [
      "offline_access"
    ]
  }
}
``` 

### 事件订阅
事件与回调默认采用 **WebSocket** **长连接** 订阅方式，详情参考[使用长连接接收事件](https://open.feishu.cn/document/ukTMukTMukTM/uYDNxYjL2QTM24iN0EjN/event-subscription-configure-/request-url-configuration-case)、[使用长连接接收回调](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/event-subscription-guide/callback-subscription/configure-callback-request-address)。

- **事件配置**

以下事件均以应用身份订阅。

| 事件名称           | 订阅类型 | 事件标识                           |
| -------------- | ---- | ------------------------------ |
| 接收消息           | 应用身份 | im.message.receive_v1          |
| 消息被 reaction   | 应用身份 | im.message.reaction.created_v1 |
| 消息被取消 reaction | 应用身份 | im.message.reaction.deleted_v1 |
| 机器人进群          | 应用身份 | im.chat.member.bot.added_v1    |
| 机器人被移出群        | 应用身份 | im.chat.member.bot.deleted_v1  |
| 有新文档评论或回复通知    | 应用身份 | drive.notice.comment_add_v1    |

- **回调配置**

| 回调名称   | 回调标识                |
| ------ | ------------------- |
| 卡片回传交互 | card.action.trigger

