# 飞书智能体支持 Slash Command

Slash Command 是一种允许用户在飞书聊天框中通过输入 `/` 快速触发机器人服务的交互方式。开发者可以通过 OpenAPI 为自己的机器人应用注册一组自定义指令，这些指令会以列表形式展示在用户输入 `/` 后弹出的指令面板中，从而实现更直观、便捷的能力发现与调用。

## 适用场景

Slash Command 适用于以下场景：

- **高频快捷操作**：将应用中最常用、最核心的功能注册为指令，如 `/todo 创建任务`、`/meeting 预定会议`，用户无需离开聊天窗口即可完成操作。

- **信息查询与检索**：提供快速的信息查询入口，如 `/stock 查询股价`、`/weather 查询天气`，简化信息获取流程。

- **复杂任务引导**：作为复杂工作流的起点，例如 `/approval 发起审批`，触发后机器人可以发送卡片消息，引导用户完成后续的多步操作。

- **开发者与运维工具**：为开发和运维人员提供便捷的命令行工具，如 `/deploy 发布服务`、`/log 查看日志`，将飞书客户端转变为一个轻量级的运维入口。

## 前提条件

在开始接入 Slash Command 之前，请确保你已完成以下准备工作：

- **飞书客户端版本要求**：PC 端 **7.70** 及以上版本，移动端 **7.71** 及以上版本。

- **创建并发布应用**：你需要在 [飞书开放平台](https://open.feishu.cn/app) 创建一个企业自建应用或商店应用。

- **启用机器人能力**：进入应用详情页，在“应用能力”下添加并启用“机器人”能力。应用需要发布后，机器人才能被用户搜索和使用。

- **获取 OpenAPI 调用凭证**：了解如何获取和使用 `tenant_access_token` 或 `user_access_token`，详情参考[获取访问凭证](https://open.feishu.cn/document/ukTMukTMukTM/uMTNz4yM1MjLzUzM)。
**配置生效延迟**：

由于客户端存在缓存策略，通过 OpenAPI 对 Slash Command 进行创建、更新或删除后，配置的变更将在客户端上**有约 5 分钟的生效延迟**。完成操作后，请耐心等待或尝试重启飞书客户端以查看最新效果。

## 快速开始

本章节将引导你快速完成对 Slash Command 的创建、查询、更新和删除操作。所有接口均使用统一的复数形式路径。

### 接口与权限

开发者需要通过调用以下四个 OpenAPI 来管理应用的 Slash Command。

|**操作**|**HTTP 方法**|**接口路径**|**所需权限 (Scope)**|
|---|---|---|---|
|创建指令|POST|/open\-apis/application/v7/app\_slash\_commands|`application:app_slash_command:write`|
|查询指令列表|GET|/open\-apis/application/v7/app\_slash\_commands|`application:app_slash_command:read`|
|更新指令|PATCH|/open\-apis/application/v7/app\_slash\_commands/:command\_id|`application:app_slash_command:write`|
|删除指令|DELETE|/open\-apis/application/v7/app\_slash\_commands/:command\_id|`application:app_slash_command:write`|

在调用接口前，请确保你的应用已在“权限管理”页面申请并开通了上述权限。

### 请求示例

以下 `curl` 命令展示了如何完成一次完整的指令生命周期管理。请将 `YOUR_TENANT_ACCESS_TOKEN` 替换为你自己的访问凭证。`icon_key`可选列表参考 「Slash Command Icon Key 说明」章节。

#### 1. 创建一条指令
**指令数量上限**：每个应用可创建的 Slash Command 存在数量上限（当前为 100 条）。

创建一个名为 `/greet` 的指令。

```Bash
curl --location --request POST 'https://open.feishu.cn/open-apis/application/v7/app_slash_commands' \
--header 'Authorization: Bearer YOUR_TENANT_ACCESS_TOKEN' \
--header 'Content-Type: application/json; charset=utf-8' \
--data-raw '{
    "command": "greet",
    "description": {
        "default_value": "发送一句问候",
        "i18n": {
            "en_us": "Send a greeting",
            "zh_cn": "发送一句问候"
        },
        "icon": {
          "icon_key": "skill_outlined"
        }
    }
}'

```

**成功响应：**

```JSON
{
    "code": 0,
    "msg": "success",
    "data": {
        "command_id": "7374693847629398036"
    }
}

```

- **必填字段**: `command` \(指令名称，不含 `/`\) 和 `description` \(指令描述\)。`description` 内部必须包含 `default_value` 作为兜底文案。

- **可选字段：**`icon`（指令 icon key），`icon_key` 可选列表参考「Slash Command Icon Key 说明」章节。

- **记录**`command_id`: **请务必记录**成功响应中返回的 `command_id`，这是后续更新和删除该指令的唯一标识。

#### 2. 查询指令列表

查询当前应用下的所有指令。

```Bash
curl --location --request GET 'https://open.feishu.cn/open-apis/application/v7/app_slash_commands' \
--header 'Authorization: Bearer YOUR_TENANT_ACCESS_TOKEN'

```

**成功响应：**

```JSON
{
    "code": 0,
    "msg": "success",
    "data": {
        "items": [
            {
                "command_id": "7374693847629398036",
                "command": "greet",
                "description": {
                    "default_value": "发送一句问候",
                    "i18n": {
                        "en_us": "Send a greeting",
                        "zh_cn": "发送一句问候"
                    }
                },
               "icon": {
                   "icon_key": "skill_outlined"
                },
                "update_time": "1716963953"
            }
        ]
    }
}

```

#### 3. 更新一条指令

使用 `command_id` 更新指定指令的描述和 icon。

```Bash
curl --location --request PATCH 'https://open.feishu.cn/open-apis/application/v7/app_slash_commands/7374693847629398036' \
--header 'Authorization: Bearer YOUR_TENANT_ACCESS_TOKEN' \
--header 'Content-Type: application/json; charset=utf-8' \
--data-raw '{
    "description": {
        "default_value": "发送一句更加热情的问候",
        "i18n": {
            "en_us": "Send a more enthusiastic greeting",
            "zh_cn": "发送一句更加热情的问候"
        },
        "icon": {
          "icon_key": "skill_outlined"
        }
    }
}'

```

**成功响应：**

```JSON
{
    "code": 0,
    "msg": "success",
    "data": {}
}

```

#### 4. 删除一条指令

使用 `command_id` 删除指定指令。

```Bash
curl --location --request DELETE 'https://open.feishu.cn/open-apis/application/v7/app_slash_commands/7374693847629398036' \
--header 'Authorization: Bearer YOUR_TENANT_ACCESS_TOKEN'

```

**成功响应：**

```JSON
{
    "code": 0,
    "msg": "success",
    "data": {}
}

```

### 典型错误码

在调用过程中，你可能会遇到以下典型错误，可根据错误码和提示信息进行排查。

|**错误码**|**HTTP 状态码**|**含义**|**可能原因及解决方案**|
|---|---|---|---|
|99991661|400|缺少 Token|请求头未携带 `Authorization`。请检查并添加 `Authorization: Bearer YOUR_TENANT_ACCESS_TOKEN`。|
|99991663|400|Token 无效|`Authorization` 中携带的 Token 已过期、被伪造或不属于当前应用。请重新获取有效的访问凭证。|
|99992402|400|参数校验失败|请求体中缺少必填字段，如 `command` 或 `description`。请根据响应中的 `field_violations` 提示补充字段。|
|9499|400|请求体格式错误|请求体 JSON 结构不合法，或字段类型错误（例如 `description.i18n` 应为对象而非字符串）。请检查 JSON 格式。|
|40000000|200|业务逻辑错误|通常由业务约束导致，如 `command already exists` \(指令重名\) 或 `command_id not found` \(指令不存在\)。请根据 `msg` 排查。|
|40000031|200|`icon_key`错误|`icon_key` 必须是「Slash Command Icon Key 说明」章节中的可用 `icon_key`。|

## 接入流程

一个完整的 Slash Command 接入与管理流程包含以下步骤：

**第 1 步：应用创建与权限配置**

1. 访问 [飞书开放平台](https://open.feishu.cn/app)，创建一个新的企业自建应用，或选择一个已有的应用。

2. 在应用详情页的 **应用能力** 中，确保已添加并启用 **机器人** 能力。

3. 在 **权限管理** 页面，搜索并开通 `application:app_slash_command:write` 和 `application:app_slash_command:read` 权限。

4. 完成上述配置后，**创建并发布一个新的应用版本**，使权限和机器人能力生效。

**第 2 步：获取 Access Token**

调用 Slash Command 相关接口需要应用的访问凭证 (`tenant_access_token`)。请参考 [自建应用获取 tenant_access_token](https://open.feishu.cn/document/ukTMukTMukTM/ukDNz4SO0MjL5QzM/auth-v3/auth/tenant_access_token_internal)，编写获取和刷新 Token 的逻辑。

**第 3 步：注册指令 (Create\)**

调用 `POST /open-apis/application/v7/app_slash_commands` 接口，为你希望暴露给用户的每一个功能注册一条指令。

- **一次性注册**：建议在你的服务启动或初始化阶段，将所有需要支持的指令一次性批量注册。

- **记录 ID**：将成功创建后返回的 `command_id` 与你的业务逻辑（例如功能模块、函数名）进行映射，并持久化存储，以便后续更新或删除。

**第 4 步：客户端生效与查询 (List)**

1. **等待生效**：指令注册成功后，由于客户端缓存机制，**需要等待约 5 分钟**才能在聊天输入框中看到。你可以尝试重启飞书客户端来加速缓存刷新。

2. **验证**：在与你的机器人单聊的对话框中，输入 `/`，查看弹出的指令面板中是否包含你刚刚注册的指令。

3. **程序查询**：随时可以调用 `GET /open-apis/application/v7/app_slash_commands` 接口，从服务端视角查询当前应用已成功注册的所有指令列表，从而核对或同步你的本地指令状态。
**客户端缓存与延迟的影响**：

客户端为了提升性能，会对应用的 Slash Command 列表进行缓存，**缓存有效期约为 3 分钟**。这意味着：

- **创建/更新**：新的指令或对现有指令的修改，最长可能需要 `注册延迟(5分钟) + 缓存刷新(3分钟)` 才能在所有用户端可见。

- **删除**：已删除的指令，可能在用户的指令面板中继续“残留”最多 3 分钟，直到下一次缓存过期并重新拉取。

因此，在进行管理操作后，请给予系统足够的同步时间。

**第 5 步：更新与删除 (Update & Delete)**

- **更新**：当你需要修改某个指令的描述（例如，文案优化、功能变更说明）时，使用创建时保存的 `command_id` 调用 `PATCH /open-apis/application/v7/app_slash_commands/:command_id` 接口。

- **删除**：当某个功能下线或不再希望通过 Slash Command 暴露时，使用对应的 `command_id` 调用 `DELETE /open-apis/application/v7/app_slash_commands/:command_id` 接口。

**第 6 步：回滚与清理**

- **回滚**：如果一次发布后希望撤销某条指令，本质上就是**删除**操作。

- **重建**：**指令的 ****`command`**** 名称在被删除后即可再次使用**。如果你误删了一条指令，可以立即使用相同的 `command` 和 `description` 重新调用创建接口。服务端会生成一个全新的 `command_id`，实现“原地重建”。

- **全量清理**：在下线整个应用或重构指令体系时，你可以先通过 `GET` 接口拉取所有指令的 `command_id`，然后遍历列表，逐一调用 `DELETE` 接口，完成所有指令的清理工作。

## 最佳实践

遵循以下实践，可以帮助你更稳定、高效地使用 Slash Command OpenAPI。

### 命名规范

- **使用业务前缀**：为了避免不同应用或应用内不同模块之间的指令冲突，建议为 `command` 名称添加有意义的前缀。例如，如果你的应用名为 “订单助手”，可以命名为 `order_create`、`order_query`。

- **动词优先**：采用 `动词-名词` 的格式，如 `create-task`、`search-file`，使指令意图更加清晰。

- **简洁明了**：指令名称应简短易记，避免使用过长或复杂的单词。

### 并发与幂等

- **创建操作的幂等性**：`POST` 创建接口本身不是幂等的，但服务端对 `command` 名称做了唯一性约束。如果短时间内使用相同的 ****`command`**** 名称发起多次创建请求，只有第一次会成功（返回 ****`code: 0`****），后续请求将失败并返回 ****`code: 40000000`**** 及 **`msg: "command already exists"`**。因此，调用方无需在客户端实现复杂的创建防重逻辑，只需判断响应码即可。

- **更新/删除操作的幂等性**：`PATCH` 和 `DELETE` 操作在设计上是幂等的。对同一个 `command_id` 多次执行相同的更新，结果保持一致；对一个已删除的 `command_id` 多次调用删除，后续请求会返回 `command_id not found`，但从系统状态来看，结果同样是一致的（指令不存在）。

### 错误处理

在编写代码时，建议对以下几类关键错误进行捕获和处理：

- **指令已存在** \(`command already exists`\)：当创建指令时收到此错误，表明该指令名已被占用。此时应放弃创建，并可根据业务需要调用 `GET` 接口获取现有指令的 `command_id`，转为更新逻辑。

- **指令 ID 未找到** \(`command_id not found`\)：当更新或删除时收到此错误，表明目标指令已被删除或从未存在。此时应停止操作，并检查传入的 `command_id` 是否正确，或同步本地的指令状态。

- **鉴权错误** \(`99991661` / `99991663`\)：收到这类错误时，应检查 `Authorization` 请求头和 `access_token` 的有效性，并触发 Token 刷新机制。

- **参数校验错误** \(`99992402` / `9499`\)：这类错误通常由开发阶段的编码疏漏导致。应根据错误提示检查请求体的字段和结构，确保符合 API 定义。

### 数量与版本管理

- **指令数量上限**：每个应用可创建的 Slash Command 存在数量上限（当前为 100 条）。
- **批量操作建议**：当需要大规模清理指令时，建议的流程是：

1. 调用 `GET` 接口拉取当前全量指令列表。

2. 在本地计算出需要删除的指令 `command_id` 集合。

3. 遍历该集合，逐一调用 `DELETE` 接口完成删除。

### Header 要求

- `Content-Type: application/json; charset=utf-8`：对于 `POST` 和 `PATCH` 请求，这是**必须的**。

- `Authorization: Bearer <token>`：所有请求**必须携带**。

## Slash Command Icon Key 说明

本章列举用于 Slash Command 的创建和更新时`icon_key`参数的可选列表，默认为`skill_outlined`。

icon_key                        | 图标                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| skill_outlined                  | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/22031b07b1e7294beaf174b2ba495827_QJcHmtuxdD.png?height=96&lazyload=true&width=96) |
| light-ai_outlined               | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/3b26e6aba8fdcc049f391b97ded08fcc_PFV8iRKTga.png?height=96&lazyload=true&width=96) |
| chat-ai_outlined                | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/367793428503aef17b3af5ca0589dd01_TrufRNcuqZ.png?height=96&lazyload=true&width=96) |
| ai-edit-continue_outlined       | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/62aaa0ae6eed730bb01943a3f78ff5a4_l7vnx0t3jV.png?height=96&lazyload=true&width=96) |
| education-ai_outlined           | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/1b5f91d75b1a5bf0e32031affe00fa77_QuV11DghYC.png?height=96&lazyload=true&width=96) |
| ai-trans-switch_outlined        | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/4bb4bc84174c79b8b9201cf47d4f1bb6_ZXNmDSfNaL.png?height=96&lazyload=true&width=96) |
| language-ai_outlined            | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/0f67fd40379b07e5e38c67a89df7ea2e_CvWpE6dk56.png?height=96&lazyload=true&width=96) |
| toolbar-more-ai_outlined        | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/c0f62cb13cf01233df21cf8bab32f475_yBsixJPLaw.png?height=96&lazyload=true&width=96) |
| image-ai_outlined               | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/b4301d87635917a32b95b097fb03de48_HAszYWbuID.png?height=96&lazyload=true&width=96) |
| ai-agent_outlined               | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/53a02a135bfcf628db647c20c3949833_4fTE9PSeLM.png?height=96&lazyload=true&width=96) |
| ai-deepthink_outlined           | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/95211728c44edaf78754332555a2d032_y0t1vLXPsC.png?height=96&lazyload=true&width=96) |
| ai-style_outlined               | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/8dfa5954d558fb6da97d81ca30b1eeae_cuSk0tQpth.png?height=96&lazyload=true&width=96) |
| ai-reminder_outlined            | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/7700e79a37dc4ff31d1aa36b8896d50c_Hx3hDB1DAQ.png?height=96&lazyload=true&width=96) |
| ai-block_outlined               | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/ba92573a3624671cbefc9c2ff5f4bd1d_jSrJr7KqfM.png?height=96&lazyload=true&width=96) |
| ai-simplify-expression_outlined | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/e6726d917109d5110f9c97f83a5a87a8_Wjk5wzBvF9.png?height=96&lazyload=true&width=96) |
| promptword_outlined             | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/3b1028725592a5f0cb8ea6f8240c4784_2PXzwLyxJ8.png?height=96&lazyload=true&width=96) |
| meeting-ai_outlined             | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/f8380ed153811e928155b3942eb46cd9_BqDaiKzbBu.png?height=96&lazyload=true&width=96) |
| ai-improvewriting_outlined      | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/0425645527394e8ffa2513e37290cd8c_01Ahb247eB.png?height=96&lazyload=true&width=96) |
| slash-ai_outlined               | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/4a57a0abb54cbd3410bad4616386c415_7g7ScoW0UB.png?height=96&lazyload=true&width=96) |
| pa-cost-ai_outlined             | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/9e2894a9fb465b7a80248c7caf95c3ee_gOGBbtJdIP.png?height=96&lazyload=true&width=96) |
| update-ai_outlined              | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/722aac92b20b7e011084f16a660a1378_9X5fpUFF22.png?height=96&lazyload=true&width=96) |
| diagnosis-ai_outlined           | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/bb3dab9145ba21265d23bbbf7cb61f1f_J3GPLeCAyw.png?height=96&lazyload=true&width=96) |
| ai-functions_outlined           | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/b760604d4bd2060d0d78c174f2dcd14a_ZSL6W97dfv.png?height=96&lazyload=true&width=96) |
| mic-ai_outlined                 | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/53e92c45e1fa38e06f096fd3d70003fe_gznYwnQ6dd.png?height=96&lazyload=true&width=96) |
| search-ai_outlined              | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/09c4ff7b76b1ba064bc9efdab8392fb0_WRrRHMeIyo.png?height=96&lazyload=true&width=96) |
| explanation-ai_outlined         | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/6e6e6b1315b798e775f8566faadd3a5f_1GDQnAvLxk.png?height=96&lazyload=true&width=96) |
| add-ai_outlined                 | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/d9331357b74db3971a1c2c49027ffad1_mQ4ISOh9r6.png?height=96&lazyload=true&width=96) |
| add-chat-ai_outlined            | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/6a0dd2d493c694d81f58ae6141bf8b7b_fTAVZdNPP8.png?height=96&lazyload=true&width=96) |
| ai-notification_outlined        | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/7c639140bf90c65536c4ab40997c73e8_WdIwMoK2kU.png?height=96&lazyload=true&width=96) |
| dynamic-layout_outlined         | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/d61aea67d211034e8f378ab0a38465cf_bR6aIBJO0K.png?height=96&lazyload=true&width=96) |
| ai-doc_outlined                 | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/310c1e8469485e74f1df95937ba48317_eZFxG6ckq8.png?height=96&lazyload=true&width=96) |
| home_outlined                   | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/74c16c5dd3ec50159faa0692ef2fc747_6jO3Iu7tor.png?height=96&lazyload=true&width=96) |
| mail_outlined                   | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/a127e73e2fac0bc1176271aad1f2957c_fCs9riL8ZA.png?height=96&lazyload=true&width=96) |
| browser-mac_outlined            | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/b87b2bbaf7258c99f542882f762532a3_wlXpppH2pV.png?height=96&lazyload=true&width=96) |
| flag_outlined                   | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/d9bc4d289eacc75e4a70f0eeab07a31c_vCP3SKXLoH.png?height=96&lazyload=true&width=96) |
| calendar-line_outlined          | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/f71875cce18c1b90790f21015f0ae5c7_idQMFrx31w.png?height=96&lazyload=true&width=96) |
| sent_outlined                   | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/ac9768342d0f96f1d8ffba7026d388e9_wdvzDHyc0W.png?height=96&lazyload=true&width=96) |
| gift_outlined                   | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/b35b3c7317caa9dd0e97ed4f45ac136c_3jBjDiqpwF.png?height=96&lazyload=true&width=96) |
| tag_outlined                    | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/f7670b80c3ae75172b123abdf44d7364_cxYsMdiarl.png?height=96&lazyload=true&width=96) |
| cloud_outlined                  | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/3b2638867924bddad1e5c1eaff337690_cxwrcM9xV6.png?height=96&lazyload=true&width=96) |
| bonus-payroll_outlined          | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/4dd55e05805509e9ae732bbf22de1cf6_sbRGGpvLIL.png?height=96&lazyload=true&width=96) |
| vote_outlined                   | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/a7ee63e27d618a9b11648858e62cea30_o72y8jfjtD.png?height=96&lazyload=true&width=96) |
| chat_outlined                   | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/a49edfd653a9ff1267a968f0d3daec03_7QRw4gGjkN.png?height=96&lazyload=true&width=96) |
| emoji_outlined                  | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/e26456bf2e8d7826d517176b069ca517_pHgCS3Gyjf.png?height=96&lazyload=true&width=96) |
| member_outlined                 | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/f0560a417cd215932d01edde85965268_lzJu4h41km.png?height=96&lazyload=true&width=96) |
| robot_outlined                  | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/5d7de4dd6c28e3d1ab3d9848694e1a46_4RgQsbBVmg.png?height=96&lazyload=true&width=96) |
| mic_outlined                    | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/b382c4466563662bd0f1e4d82954e6b8_UDy0269Zev.png?height=96&lazyload=true&width=96) |
| raisehand_outlined              | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/3cfa04bb4e130d5c16df5cff49368074_WfITnn5NSZ.png?height=96&lazyload=true&width=96) |
| officephone_outlined            | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/7983ea89817acf425295e890b9269db0_6bsd3c0zAu.png?height=96&lazyload=true&width=96) |
| effects_outlined                | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/36171f5ce4cba3560d686eb332c932d4_wqXJ7h0Hrz.png?height=96&lazyload=true&width=96) |
| labs_outlined                   | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/4e80e9e643b68a504f508cf258e76217_P76hQUS5Ng.png?height=96&lazyload=true&width=96) |
| computer_outlined               | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/0fca9b0ac81f90babc0a7cbb072cd2ad_EoxUkFOYDB.png?height=96&lazyload=true&width=96) |
| clear_outlined                  | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/0b8219fdcd6cebb89e0d1e9b9a243f7a_CeIz05kocS.png?height=96&lazyload=true&width=96) |
| mouse_outlined                  | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/6493c4a742c97d47ed02c4bd65e5069e_78E4J6nghb.png?height=96&lazyload=true&width=96) |
| cellphone_outlined              | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/aa18a1f4bba92b55c562a2351dccfa8e_Yt29JWhJQu.png?height=96&lazyload=true&width=96) |
| cursor_outlined                 | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/544a0e5b2f1b5ee3183aafcbf7db476d_1gVc1aeNtJ.png?height=96&lazyload=true&width=96) |
| plugin_outlined                 | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/4db557a49400aa099bd6cd4a2c86a360_zEDjj16MKO.png?height=96&lazyload=true&width=96) |
| edit_outlined                   | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/3777c160cebf266eeec922236640fe38_TGgkeDnizE.png?height=96&lazyload=true&width=96) |
| style-fillcolor_outlined        | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/dd45e7336a2faa519dbe3fb477e754c4_SdMZs2cv4T.png?height=96&lazyload=true&width=96) |
| codeblock_outlined              | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/cf1a94d1a165c012201e53a35f87cccb_aVPDcnnmNg.png?height=96&lazyload=true&width=96) |
| code_outlined                   | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/f6a024cfec85b260784ddad53c8d59f7_bLTxXictaX.png?height=96&lazyload=true&width=96) |
| folder_outlined                 | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/720a9e0e4774ee20e2694f45d5f0f952_xN9Uehlkfr.png?height=96&lazyload=true&width=96) |
| file-link-word_outlined         | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/da4f4e0dcf34c1da51250db5e8416966_ocKxF3AjZe.png?height=96&lazyload=true&width=96) |
| file-link-sheet_outlined        | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/9b5b78b5ba9479cb3642c8900aee6161_RDT605kXcT.png?height=96&lazyload=true&width=96) |
| file-link-image_outlined        | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/ab8357c7477374f3dfc23122952d7680_24t3Xh5iRJ.png?height=96&lazyload=true&width=96) |
| global-link_outlined            | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/0aeaab4afcc4064299bd911b577b4384_DNaQcFO5cQ.png?height=96&lazyload=true&width=96) |
| champion_outlined               | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/58fe3f577a4388c12c18f53023d14814_HkpDWo57Xe.png?height=96&lazyload=true&width=96) |
| local_outlined                  | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/ab7772283b95b473929d0ad004a0391d_JbYT3LM2rk.png?height=96&lazyload=true&width=96) |
| day_outlined                    | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/a3ab61a27bbad0f3dfcaaf25a7117e04_e1Hv9aO0Uw.png?height=96&lazyload=true&width=96) |
| waiting_outlined                | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/ffd47b0c6b20b273a8e25d7deb4e5528_RvG1brSOgm.png?height=96&lazyload=true&width=96) |
| database_outlined               | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/ea5b8d720a5f5b6a81eb0e9f69a89991_mUQywsfos2.png?height=96&lazyload=true&width=96) |
| marketplace_outlined            | ![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/0df6579bbdf9f825206fe0ee72de13e3_3TpJ6nCjtR.png?height=96&lazyload=true&width=96)

## FAQ

**Q1：为什么我调用接口时返回 ****`404 Not Found`****？**

A1：`404` 错误通常由以下原因导致：

1. **URL 路径错误**：请检查你的请求 URL 是否严格遵循文档格式 `/open-apis/application/v7/app_slash_commands` \(对于列表和创建\) 或 `/open-apis/application/v7/app_slash_commands/:command_id` \(对于更新和删除\)。特别注意路径是复数形式 `commands`。

2. **环境不匹配**：如果你在测试环境（如 BOE）进行调试，但请求发往了线上环境域名 \(`open.feishu.cn`\)，或者未正确携带 `x-tt-env` 头部，可能导致路由失败。

**Q2：我的指令已经创建成功，为什么在飞书里输入 ****`/`**** 看不到？**

A2：这通常是由于缓存和生效延迟导致的。

1. **服务端延迟**：从接口调用成功到配置在所有数据中心同步完成，有分钟级的延迟。

2. **客户端缓存**：飞书客户端会对指令列表进行缓存（约 3 分钟）。

3. **排查步骤**：

- **耐心等待**：在创建或更新后，**至少等待 5 分钟**。

- **重启客户端**：完全退出飞书客户端再重新登录，可以强制刷新缓存。

- **调用 ****`GET`**** 接口确认**：调用列表接口，检查你的指令是否已存在于服务端返回的列表中。如果存在，说明服务端已处理成功，问题在于客户端缓存。

**Q3：调用接口返回 ****`code: 99991640, msg: "lacks permission"`****，这是为什么？**

A3：这个错误明确表示你的应用缺少调用该接口所需的权限。

1. **检查权限范围 \(Scope\)**：请前往 [飞书开放平台](https://open.feishu.cn/app) \> 你的应用 \> “权限管理”页面。

2. **确认权限**：确保 `application:app_slash_command:write` \(用于写操作\) 和 `application:app_slash_command:read` \(用于读操作\) 已被添加并处于“已开通”状态。

3. **重新发布版本**：如果在应用已发布后才添加的权限，你需要**创建一个新的应用版本并重新发布**，权限才会正式生效。

**Q4：为什么我的 ****`description.i18n`**** 国际化配置没有生效？**

A4：`i18n` 字段的 `key` 必须是标准的语言代码，`value` 为对应语言的描述文本。

- **正确结构**:

```JSON
    "description": {
        "default_value": "默认描述",
        "i18n": {
            "zh_cn": "中文描述",
            "en_us": "English Description",
            "ja_jp": "日本語の説明"
        }
    }

```

- **错误结构**:

```JSON
    // 错误示例1：i18n 不是一个 map/object
    "i18n": "some string" 

// 错误示例2：语言代码不标准
    "i18n": {
        "chinese": "中文描述" 
    }

```

请确保 `i18n` 的值是一个严格的 `map[string]string` 结构，且 `key` 使用 `zh_cn`, `en_us` 等标准代号。

**Q5：我可以为一个应用创建多少个 Slash Command？**

A5：目前，单个应用最多可以创建 **100** 条 Slash Command。建议你精选应用的核心功能进行注册，保持指令列表的简洁和高效。如果指令过多，用户反而难以查找和使用。

