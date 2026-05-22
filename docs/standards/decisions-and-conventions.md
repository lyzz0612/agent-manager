# 达成共识的细节和规范

## 产品定位

项目定位为 AI agent 管理工具，Web 优先，未来支持手机 App。

产品演进路径：

```text
v1  安装与基础管理
v2  多机器与完善管理
v3  对话、任务执行与实时反馈
```

第一版必须建立三层架构，但功能范围保持收窄。

## 三层架构共识

从第一版开始固定三层：

```text
Client
Server
CLI / Runner
```

三层职责边界：

- Client 负责展示、交互和发起管理动作。
- Server 负责账号、机器、状态、配置、动作调度和审计。
- CLI/Runner 负责被管理机器上的检测、安装、配置和动作执行。

禁止让 Client 直接操作本机。

禁止让 Server 直接执行用户机器上的 shell。

Runner 必须主动连接 Server。

## 技术选型共识

### 初期技术栈

```text
Client:  Expo + React Native Web
Server:  Node.js / TypeScript
Runner:  Node.js CLI
DB:      SQLite
Repo:    pnpm workspace
```

### Server

初期不强行使用 Go。

原因：

- 当前本机未安装 Go。
- 初版更需要快速验证产品模型。
- TypeScript 可以与 Client 和 Runner 共享 schema。
- SQLite + Node.js 足够支撑初期单实例 control plane。

Go 保留为后续选项。

### Runner

Runner 初期使用 Node.js CLI，npm 包名为 **`@lyzz0612/agentops-runner`**。

原因：

- npm 分发安装门槛低。
- 目标用户通常已有 Node/npm。
- 适合读写配置、spawn agent CLI、解析输出。
- 便于与 Server 共享协议类型。

Runner 协议必须语言无关，未来可增加 Go Runner。

Agent 安装/升级由 Runner 执行；Docker **`agentops-server`** 镜像不预装 agent。镜像 tag、CI/Release 约定见 `docs/development/` 与 `docs/operations/`。

### Database

初期使用 SQLite。

原因：

- 少依赖。
- 自托管简单。
- 本地开发简单。
- 当前主要保存控制面元数据。

Postgres 不作为初版默认依赖。

## 客户端共识

客户端优先考虑 Web 和 App 共用。

推荐路线：

```text
Expo + React Native + React Native Web
```

Web 与 Android 使用同一套 Client 能力。初期页面、状态管理和 API client 应为多端复用设计。

客户端不直接和 Runner 通信，所有状态和动作都经过 Server。

v1 Client 先指定 Server 地址，再使用单一 Token 登录。Client 本地只保存一个 Server 地址和 Token；设置页可以修改 Server 地址，修改后必须重新登录。

v1 主导航为「机器」和「设置」。手机端使用底部 Tab，Web 端可以使用侧边栏或顶部导航，但信息架构和路由保持一致。Web 与手机都采用逐层进入的信息结构，不采用宽屏左右分栏的主从布局。

## Server 共识

Server 是 control plane。

Server 需要管理：

- 用户。
- 机器。
- Runner 连接。
- Agent 安装状态。
- Agent 配置摘要。
- Doctor 结果。
- 管理动作。
- 动作日志。
- 审计记录。

Server 不管理：

- 本机真实安装细节。
- 本机命令执行。
- Agent 私有配置文件的完整内容。
- 用户机器上的 workspace 文件。

Server 访问控制初期使用部署侧配置的单一 Token，例如 Docker / Compose / `.env` 中的 `AGENTOPS_TOKEN`（具体变量名以实现为准）。v1 不引入多用户、组织、角色或用户名。

## CLI / Runner 共识

Runner 是机器侧执行边界。

Runner 需要支持：

- 登录和绑定 Server。
- daemon 模式。
- 机器信息上报。
- agent 检测。
- agent 安装。
- agent 升级。
- agent 卸载。
- doctor。
- 动作日志回传。

Runner 本地只保存必要信息：

- Server 地址。
- Runner 凭据。
- 机器标识。
- 本地缓存。

Runner 不保存平台主状态。

Runner `daemon` 连接 Server 时自动执行一次 detect；v1 不做周期性后台 detect。

Agent 管理必须通过适配层扩展。v1 内置 Cursor、Codex、Claude Code 三个 adapter；新增 agent 应通过注册表扩展，不应在业务流程中散落特殊分支。

## v1 范围共识

v1 只做安装与管理。

v1 包含：

- Client。
- Server。
- CLI/Runner。
- SQLite。
- 机器注册。
- Agent 检测。
- Agent 安装状态。
- 基础安装、升级、卸载、doctor。
- 管理动作日志。
- 基础审计。

v1 不包含：

- Workspace。
- Agent 对话。
- 任务执行。
- 实时 agent 输出。
- Repo clone。
- Worktree。
- 权限审批流。
- 手机 App 正式发布。

v1 配置能力只读展示，不通过 Web / App 下发修改。

v1 不展示长日志或流式日志；动作结束后只展示成功 / 失败和简短摘要，完整动作日志可入库保留。

## v2 范围共识

v2 完善管理。

v2 重点：

- 多机器。
- 机器标签。
- 更完整的 agent 管理。
- Agent profile。
- 批量检测。
- 批量升级。
- 动作重试。
- 动作取消。
- 更完整的审计。
- 高风险动作确认。

v2 仍不进入对话和任务执行。

## v3 范围共识

v3 开始做对话、任务执行和实时反馈。

v3 才引入：

- Workspace。
- Task。
- Session。
- SessionEvent。
- PermissionRequest。
- Artifact。
- Agent event protocol。

## 命名规范

建议使用以下领域名称：

```text
Machine
Runner
AgentInstallation
AgentConfig
AgentProfile
DoctorCheck
ManagementAction
ActionLog
AuditLog
Workspace
Task
Session
SessionEvent
PermissionRequest
Artifact
```

第一版避免使用 `Task` 表达管理动作，使用 `ManagementAction`。

`Task` 保留给 v3 的 agent 执行任务。

`Session` 保留给 v3 的 agent 对话或执行会话。

## 协议规范

协议优先 schema 化。

初期可以共享 TypeScript 类型，但需要避免前端依赖 Server 内部实现对象。

建议至少区分：

```text
Client API
Client Realtime Events
Runner Commands
Runner Reports
Shared Domain Types
```

Runner command 和 report 应具备版本字段，方便后续兼容。

## 状态规范

管理动作建议使用统一状态：

```text
queued
running
succeeded
failed
cancelled
```

v1 UI 不提供取消运行中动作。`cancelled` 作为协议保留状态。

同一台机器上，不同 Agent 的动作可以并行；同一台机器同一 Agent 的动作必须串行。

机器在线状态建议区分：

```text
online
offline
unknown
error
```

Agent 安装状态建议区分：

```text
installed
not_installed
misconfigured
unknown
unsupported
```

## 安全规范

管理动作必须经过 Server。

高风险动作需要审计。

敏感配置默认脱敏展示。

Runner 凭据可以撤销。

机器可以解绑。

Server 不应该默认保存 API key 明文。

未来引入对话和任务执行后，权限审批必须成为一等对象。

删除机器和卸载 Agent 都需要二次确认，并说明后果。

## 删除规范

业务对象删除默认采用软删除。至少 `Machine` 必须只软删，不提供硬删除业务能力。

机器删除规则：

- 用户侧显示为「删除机器」，实现上设置 `deleted_at` 或等价字段。
- 常规列表和 API 默认过滤已删除机器。
- `machineId` 全局唯一且不回收。
- 已删除机器不会复活；同一物理机重新加入时必须重新 `login` 并创建新的 `machineId`。
- Runner 使用已删除机器的旧凭据连接时，Server 应拒绝并提示重新登录。
- 历史 `ManagementAction`、`ActionLog`、`AuditLog` 保留。
- 数据库唯一索引需要带未删除语义，避免软删记录阻止重新注册。

## 文档规范

文档先记录共识，不提前展开实现细节。

版本文档只描述目标、能力、数据对象和验收口径。

技术细节在进入具体 OpenSpec 变更或实现阶段再拆分。

开源项目调研文档保留为背景材料，不直接作为实现规范。

