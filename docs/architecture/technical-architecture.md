# 技术选型和分层

## 架构目标

项目从第一版开始采用三层架构：

```text
┌──────────────────────────────────────────┐
│                 Client                   │
│        Web 优先，未来支持手机 App          │
└───────────────────┬──────────────────────┘
                    │ HTTPS / WebSocket / SSE
                    ▼
┌──────────────────────────────────────────┐
│                 Server                   │
│  账号、机器、状态、配置、审计、动作调度       │
└───────────────────┬──────────────────────┘
                    │ Runner Channel
                    ▼
┌──────────────────────────────────────────┐
│              CLI / Runner                │
│    本机检测、安装、配置、执行管理动作         │
└───────────────────┬──────────────────────┘
                    ▼
        Cursor / Codex / Claude Code
```

核心边界：

- Client 不直接访问被管理机器。
- Server 不直接执行本机命令。
- CLI/Runner 不保存平台主状态，只保存必要的本机凭据和缓存。
- 所有管理动作经过 Server 记录和调度。
- Runner 主动连接 Server，避免 Server 主动 SSH 到机器作为主路径。

## 当前推荐技术栈

### Client

推荐：

```text
Expo + React Native + React Native Web
```

原因：

- Web 和 App 尽量共用页面、组件和业务逻辑。
- 初期可以只发布 Web。
- 后续接入 iOS/Android 时不需要重写客户端模型。
- 适合管理台、状态面板、表单配置、实时通知等场景。

候选 UI 方案：

- `Tamagui`：更强调 Web/App 共用组件和桌面体验。
- `NativeWind`：Tailwind 心智，开发速度快。
- 自研轻量组件：适合先控制依赖。

### Server

当前倾向：

```text
Node.js / TypeScript + SQLite
```

建议候选：

- `Fastify`：成熟、性能好、插件生态稳定。
- `Hono`：轻量、API 简洁，适合少依赖。

初期选择 TypeScript Server 的原因：

- 当前本机没有 Go 环境，降低启动成本。
- Server、Runner、Client 可以共享协议类型。
- 更适合快速验证三层模型和产品边界。
- SQLite、本地开发、WebSocket/SSE 都可以轻量落地。

Go Server 作为后续候选：

- 更适合长期高性能、少依赖、单二进制、自托管。
- 更适合未来大规模长连接和低资源占用。
- 不作为初版前置条件。

### CLI / Runner

推荐：

```text
Node.js CLI + npm 分发
```

原因：

- 目标用户通常已经具备 Node/npm 环境。
- 安装体验简单：`npm install -g ...`。
- 适合检测、安装、配置 Cursor、Codex、Claude Code 等开发工具。
- 便于 spawn 子进程、解析 JSON stream、读写配置文件。
- 可与 Server/Client 共享 TypeScript schema。

Runner 后续可以增加 Go 实现，但协议必须从一开始保持语言无关。

### Database

初期推荐：

```text
SQLite
```

原因：

- 自托管简单。
- 本地开发简单。
- 依赖少。
- 与单实例 Server 匹配。
- 当前主要存控制面元数据，不需要一开始引入 Postgres。

SQLite 主要存储：

- 用户和认证信息。
- 机器注册信息。
- Runner 状态。
- Agent 安装状态。
- Agent 配置摘要。
- Doctor 检测结果。
- 管理动作和执行结果。
- 审计日志。

Postgres 作为后续候选：

- Hosted SaaS。
- 多副本 Server。
- 多租户高并发。
- 大量事件写入和复杂审计查询。
- 需要数据库级复制、备份和横向扩容。

## 三层职责

### Client 职责

- 展示机器列表。
- 展示单台机器详情。
- 展示 agent 安装与配置状态。
- 发起检测、安装、升级、配置、doctor 等管理动作。
- 展示动作进度和操作日志。
- 接收 Server 推送的状态变化。
- 为未来 App 推送、审批和对话能力保留入口。

### Server 职责

- 用户认证。
- 机器注册。
- Runner 认证和连接管理。
- 存储机器、agent、配置、动作和审计元数据。
- 接收 Client 管理请求。
- 向 Runner 下发管理动作。
- 接收 Runner 上报状态和结果。
- 向 Client 推送状态变化。

### CLI / Runner 职责

- 登录并绑定 Server。
- 作为 daemon 保持与 Server 的连接。
- 上报机器信息和环境信息。
- 检测 Cursor、Codex、Claude Code。
- 执行安装、升级、配置、doctor 等管理动作。
- 回传动作日志和结果。
- 维护必要的本地凭据和缓存。

## 协议边界

第一版需要尽早稳定以下协议边界：

```text
Client API
  Client -> Server 的 HTTP API

Client Realtime
  Server -> Client 的状态推送

Runner Channel
  Server <-> Runner 的管理动作和状态上报

Shared Schema
  Machine、AgentInstallation、ManagementAction、DoctorCheck 等类型
```

协议应避免绑定具体实现语言。即使初期全 TypeScript，也要避免让前端直接依赖 Server 内部对象。

## 数据边界

第一版只保存管理相关元数据，不保存 workspace、agent 对话和任务执行内容。

```text
保存：
  Machine
  Runner
  AgentInstallation
  AgentConfig
  DoctorCheck
  ManagementAction
  ActionLog
  AuditLog

暂不保存：
  Workspace
  Task
  Session
  Message
  ToolCall
  Artifact
```

## 从 Happy 和 cc-connect 吸收的方向

来自 Happy：

- Control Plane + Machine Daemon 的分层。
- Runner 主动连接 Server。
- 多端 Client 通过 Server 管理机器。
- 持久状态和实时状态分离。

来自 cc-connect：

- 本机 Runner 适配多个 agent。
- Agent Adapter 抽象。
- 管理台和外部入口通过统一协议接入。
- 权限和配置操作应通过 UI 化动作呈现。

