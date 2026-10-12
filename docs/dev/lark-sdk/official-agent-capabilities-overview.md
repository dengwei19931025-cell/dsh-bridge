# 飞书 Agent 集成能力概述

飞书面向 Agent 开发者提供三类可组合能力，它们分别解决三个不同问题：

**[一键创建飞书应用](https://open.larkoffice.com/document/mcp_open_tools/integrating-agents-with-feishu/overview)**：为你的用户快速创建一个飞书智能体应用，并预置常见权限与事件订阅。![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/ee1a955c197872a4d739a1a0a2c2f137_5i4OTqIk5z.png?height=840&lazyload=true&maxWidth=310&width=988) | **[Channel SDK](https://open.larkoffice.com/document/mcp_open_tools/integrating-agents-with-feishu/integrate-feishu-channel)**：让 Agent 进入飞书会话，在群聊、单聊和文档评论里稳定收发消息，与用户实时对话。![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/01fe9eefe325fb8ebcfd155a4651df4f_PY1XMqe7XS.png?height=1250&lazyload=true&maxWidth=350&width=2338) | **[飞书 CLI](https://open.larkoffice.com/document/mcp_open_tools/feishu-cli-let-ai-actually-do-your-work-in-feishu)**：让 Agent 直接操作飞书里的业务对象，例如文档、日历、表格、邮件和任务。![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/7e3b61ae1387b2212597ea3bcb28f0a8_c2ZLPcGhf5.png?height=966&lazyload=true&maxWidth=350&width=1304)
---|---|---

## 能力一览
![image.png](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/d100aa6f2535b2e233f529006409c459_ezUkmfNVT8.png?height=1609&lazyload=true&width=2720)

| 能力       | 什么时候使用    | 形态    | 接入指引    |
| ------------ | -------------- | ------ | --------- |
| 一键创建飞书应用 <br><br> **==凭据层==**    | 快速获取应用凭据（`App ID`、`App Secret`），并自动完成常见权限与事件订阅的初始配置，把“连接飞书”变成一次扫码动作。<br><br> **目标**：**快速获得可用飞书凭据** | Web 扫码 SDK <br><br>支持 Node.js、Python、Java、Go          | [一键创建飞书应用](https://open.larkoffice.com/document/mcp_open_tools/integrating-agents-with-feishu/overview)                    |
| Channel SDK <br><br> **==交互层==** | 让 Agent 在群聊、单聊、文档评论中收发消息，支持流式回复与卡片交互。无需自己处理连接、事件解析和回复渲染。<br><br>**目标**：**让 Agent 能「听」和「说」**       | 通道 SDK<br><br> 支持 Node.js、Python、Java、Go              | [Channel SDK](https://open.larkoffice.com/document/mcp_open_tools/integrating-agents-with-feishu/integrate-feishu-channel) |
| 飞书 CLI <br><br> **==执行层==**      | 让 Agent 真正执行飞书里的业务动作，把文档、日历、表格、邮件、任务等能力变成 Agent 可直接调用的工具。<br><br>**目标**：**让 Agent 能直接「干活」**       | CLI<br><br> 通过 `npx @larksuite/cli@latest install` 安装 | [飞书 CLI](https://open.larkoffice.com/document/mcp_open_tools/feishu-cli-let-ai-actually-do-your-work-in-feishu)