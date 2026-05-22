## 上下文

Client 是 v1 的用户入口，必须同时服务 Web 和 Android。技术路线是 Expo + React Native Web，一套页面能力复用到多端。最新设计约束要求 Web 与手机都采用逐层进入结构，不使用宽屏主从分栏。

## 目标 / 非目标

**目标：**

- 实现 Server URL + Token 登录，并持久保存一个 Server 地址和 Token。
- 提供「机器」和「设置」两个主入口。
- 实现登录、机器列表、机器详情、Agent 详情、动作结果和设置页。
- 展示机器在线状态、平台信息和基础信息。
- 展示 Agent 只读状态、版本、路径、PATH、配置摘要和 Doctor 结果。
- 发起 detect、install、upgrade、doctor、uninstall 动作。
- 通过 WebSocket 自动同步机器、动作和 Agent 状态。

**非目标：**

- 不实现多 Server 地址簿。
- 不实现全局审计页。
- 不展示长日志或流式日志。
- 不写入 Agent 配置。
- 不提供运行中动作取消。

## 决策

### 一套 Client，多端同功能

Web 与 Android 共用路由、状态模型、API client 和核心组件。平台差异只体现在导航外壳、间距、触摸目标和响应式排版。

### 逐层进入信息架构

路由按 `/machines`、`/machines/:machineId`、`/machines/:machineId/agents/:agentType`、`/machines/:machineId/actions/:actionId` 前进。Web 宽屏可以增加最大宽度和留白，但不在同屏并排展示机器列表与详情。

### 本地持久化一个 Server

Client 保存一个 Server URL 与 Token，关闭后仍保持登录。设置页可修改 Server URL，修改后清理登录态并要求重新登录。

### 只读配置展示

Agent 详情展示配置文件存在性、认证形态和脱敏摘要，但不提供配置表单。这样避免 v1 误写用户机器配置。

### 简短动作反馈

动作创建后页面展示 queued/running/succeeded/failed 和简短摘要。长日志只由 Server 入库，不在 v1 UI 展示。

## 风险 / 权衡

- 逐层进入牺牲部分 Web 信息密度 → 换取 Web / Android 同构和后续 Agent 扩展稳定性。
- 本地长期保存 Token 有安全风险 → 提供退出登录，Token 轮换后旧 Token 会自然失效。
- 不显示长日志影响排错 → 失败摘要需明确，并提示查看 Runner / Server 日志。
