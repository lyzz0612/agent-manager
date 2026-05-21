# cc-connect 项目探索记录

探索对象：[chenhg5/cc-connect](https://github.com/chenhg5/cc-connect)

探索背景：我们想做一个网页版、未来支持手机 App 的 AI agent 管理工具，初版支持 Cursor、Codex、Claude Code，未来支持多机器管理、新建工作区、远程执行任务和实时反馈。

## 一句话结论

cc-connect 更像一个「本机 agent runtime + IM/Web 桥接器」。它把 Claude Code、Codex、Cursor Agent、Gemini CLI 等本机 coding agent 接到飞书、Telegram、Slack、Discord、微信、Web Chat 等入口。

它非常适合借鉴本机 runner、agent adapter、统一事件流、权限请求、session 管理和 Web Chat 接入方式。但它不是多机器 AgentOps 控制平面，也没有完整 workspace 生命周期、fleet 管理、安装检测、自动安装、组织权限和审计体系。

## 产品定位

cc-connect 解决的问题是：用户不在电脑前，也能通过 IM 或 Web Chat 远程操控本机上的 coding agent。

典型用户流：

1. 安装 `cc-connect`。
2. 配置 `config.toml`，或通过 Web UI 创建 project。
3. 每个 project 绑定本地 `work_dir`、agent 类型和 IM/Web 平台配置。
4. 启动 `cc-connect` 常驻进程。
5. 用户在 IM 或 Web Chat 中发消息。
6. `core.Engine` 将消息路由到对应 agent session。
7. Agent CLI 以 JSON stream 输出 thinking、tool use、permission request、final result。
8. cc-connect 将中间状态、权限按钮、流式预览和最终回复发回平台。

产品心智更接近：

```text
IM / Web Chat
      │
      ▼
Platform / Bridge Adapter
      │
      ▼
core.Engine
      │
      ▼
Agent Adapter
      │
      ▼
Claude Code / Codex / Cursor / Gemini
```

## 技术栈

前端：

- `web/`：React 19 + TypeScript + Vite。
- Tailwind CSS。
- Zustand。
- React Router。
- i18next。
- Web 资源通过 Go `embed` 内嵌到二进制中。

后端/运行时：

- Go。
- 入口在 `cmd/cc-connect/main.go`。
- 核心逻辑在 `core/`。
- 配置使用 TOML。
- 主要持久化是本地 JSON 文件。
- `modernc.org/sqlite` 主要用于读取 `cc-switch` 的 SQLite 配置导入，不是自身主存储。

实时通信：

- IM 平台自己的长连接或轮询，例如飞书 WebSocket、Telegram long polling、Slack Socket Mode、Discord Gateway。
- `BridgeServer`：WebSocket + REST，默认 `:9810`，用于 Web Chat 和外部自定义适配器。

任务执行：

- 本机进程执行。
- Claude Code：启动 `claude --output-format stream-json --input-format stream-json --permission-prompt-tool stdio`。
- Codex：启动 `codex exec --json` / `codex exec resume ...`。
- Cursor：启动 `agent --print --output-format stream-json`。
- Gemini、ACP 等通过各自 adapter 封装。

部署：

- 单机二进制。
- npm 包。
- Homebrew。
- 源码编译。
- 支持 daemon 方式运行，包括 Linux systemd、macOS launchd、Windows Task Scheduler。

## 架构分层

cc-connect 的架构是单机优先，不是中心化 control plane。

```text
Management UI / IM / Web Chat
          │
          ▼
Platform Adapter / Bridge
          │
          ▼
core.Engine
          │
          ▼
Agent Adapter
          │
          ▼
Local Agent CLI Process
```

关键模块：

- `cmd/cc-connect/`：CLI、daemon、插件导入、启动编排。
- `config/`：TOML 配置解析、保存、project/provider 写回。
- `core/`：Engine、接口、会话、Bridge、Management API、Cron、权限、卡片、i18n。
- `agent/*`：Claude Code、Codex、Cursor、Gemini、ACP 等 agent 适配器。
- `platform/*`：飞书、Telegram、Slack、Discord、微信、企业微信等平台适配器。
- `web/`：内嵌管理后台。

它的核心是 `core.Engine`：统一接收来自平台的消息，找到 project/session/workspace，调用 agent adapter，并把 agent event 转换回平台消息。

## Workspace 与 Project 模型

cc-connect 的基础模型是 `project`：

```text
Project
  ├─ work_dir
  ├─ agent type
  ├─ platform config
  └─ session state
```

此外有 `multi-workspace` 模式：

- 一个 bot 服务多个频道。
- 每个频道可以绑定一个本地目录。
- 支持 `/workspace bind`、`/workspace init <git-url>`。
- 绑定信息存储到 `data_dir/workspace_bindings.json`。
- 每个 workspace 会创建独立 agent 实例和 session manager。
- 有 idle reaper 回收不活跃 workspace agent。

这对我们有参考价值，但它仍然不是完整 workspace 生命周期。

我们目标里的 workspace 可能需要：

- 创建。
- clone repo。
- 选择机器。
- 创建 worktree。
- 安装依赖。
- 检测 agent。
- 绑定 agent profile。
- 启动任务。
- 保存事件和产物。
- 回收或归档。

cc-connect 的 workspace 更像「本机目录绑定」，不是可调度、可审计、可迁移的工作区实体。

## Agent Adapter 设计

cc-connect 最值得借鉴的是 agent 抽象。

核心接口大致包括：

```text
Agent
  ├─ StartSession
  ├─ ListSessions
  └─ Stop

AgentSession
  ├─ Send
  ├─ RespondPermission
  ├─ Events
  ├─ CurrentSessionID
  ├─ Alive
  └─ Close
```

各 agent adapter 负责：

- 启动对应 CLI。
- 写入用户输入。
- 解析 stdout/stderr JSON stream。
- 将不同 agent 的私有事件转换成统一 `core.Event`。
- 处理权限请求。
- 处理 session resume。

统一事件类型包括：

- `text`
- `thinking`
- `tool_use`
- `permission_request`
- `result`
- `error`

这非常适合我们未来同时支持 Cursor、Codex、Claude Code、Gemini、OpenCode 等 agent。前端不应该直接理解每个 agent 的私有输出格式，而应该消费统一 session event protocol。

## Web Chat 与 Bridge

cc-connect 的 Web Chat 不是一套完全独立路径，而是作为 Bridge adapter 接入。

Bridge 支持：

- WebSocket。
- REST。
- token 鉴权。
- 能力声明。
- 流式消息。
- 卡片。
- 按钮。
- typing。
- update message。
- preview。
- reconstruct reply。

这对我们很有启发：未来 Web、手机 App、自动化 API、IM 集成都可以作为 client/platform 接入同一套 session/event bus，不应各自实现不同执行路径。

## 实时反馈

实时反馈由 `Engine.processInteractiveEvents` 消费 agent event 并转发到平台。

支持的体验包括：

- typing indicator。
- 流式预览。
- 可编辑消息。
- 卡片展示。
- 按钮交互。
- 权限确认。
- done reaction。
- final result。

这个方向非常适合 AgentOps 产品：用户需要在 Web 或手机上看到 agent 正在 thinking、调用了什么 tool、请求了什么权限、执行是否完成。

## 认证、权限与密钥

cc-connect 的认证和权限模型偏轻量，适合单机工具。

Web/Management API：

- 单 Bearer token。
- 也支持 query token。

Bridge：

- 单 token。
- 支持 URL 参数、Bearer、`X-Bridge-Token`。

IM 侧：

- 各平台有 `allow_from`。
- 为空默认放行，但会给出警告。

特权命令：

- `admin_from` 控制 `/shell`、`/dir` 等高风险命令。

用户角色：

- 有 `UserRoleManager`。
- 支持 `disabled_commands`。
- 支持 rate limit。

密钥：

- 主要存储在 `config.toml`。
- API 返回时会脱敏。
- 日志里有 `RedactEnv`、`RedactArgs`、`RedactToken`。

隔离：

- Claude Code 支持 `run_as_user`。
- 可通过 `sudo -n -iu` 在另一个 Unix 用户下启动 agent。

这些设计适合本机开源工具，但对我们的多用户、多机器、多工作区平台来说明显不够。我们需要更强的：

- Account/Organization。
- RBAC。
- Machine enrollment。
- Workspace-level permission。
- Secret vault。
- Task audit log。
- 高危操作审批。
- Mobile 触发高危操作的二次确认。

## 多机器能力

cc-connect 没有真正的 fleet/control plane。

它可以暴露 Management API 和 Bridge API，让其他工具远程控制某一个 cc-connect 实例，但这仍然是：

```text
Remote Client -> One cc-connect Instance -> Local Agent
```

它没有：

- 中心服务。
- 多机器注册。
- 心跳。
- runner fleet。
- 跨机器调度。
- 统一权限域。
- 跨机器 workspace 分配。

所以它不适合作为我们产品的 control plane，但很适合作为每台机器上 runner runtime 的参考。

## 关键代码位置

以下路径来自 cc-connect 项目本身：

- `README.zh-CN.md`：中文产品介绍。
- `docs/usage.zh-CN.md`：使用说明。
- `docs/management-api.zh-CN.md`：Management API 文档。
- `docs/bridge-protocol.zh-CN.md`：Bridge 协议。
- `cmd/cc-connect/main.go`：启动编排。
- `config/`：配置解析和保存。
- `core/interfaces.go`：核心接口，包含 `Platform`、`Agent`、`AgentSession` 等。
- `core/engine.go`：消息路由、session lock、权限处理、workspace 路由、agent 事件处理、实时反馈。
- `core/session.go`：会话持久化、active session、history、agent session id。
- `core/bridge.go`：Bridge WebSocket server 和 `BridgePlatform`。
- `core/management.go`：Web/REST 管理 API、静态资源 fallback、project/session/provider/cron/skills API。
- `core/workspace_binding.go`：workspace 绑定。
- `core/workspace_state.go`：workspace agent pool 和 idle 回收。
- `agent/claudecode/*`：Claude Code adapter。
- `agent/codex/*`：Codex adapter。
- `agent/cursor/*`：Cursor adapter。
- `web/src/hooks/useBridgeSocket.ts`：Web Chat 的 Bridge socket 接入。
- `web/src/pages/Chat/ChatView.tsx`：Web Chat 展示和交互。
- `web/src/pages/Projects/ProjectList.tsx`：项目创建向导。

## 可借鉴设计

1. **Agent/Session 抽象**

   用统一接口封装不同 coding agent，这是我们支持 Cursor、Codex、Claude Code 的基础。

2. **统一事件模型**

   把不同 agent 的输出统一成 `thinking`、`tool_use`、`permission_request`、`result`、`error`，前端只消费统一协议。

3. **Web Chat 作为 adapter**

   Web/App/IM/自动化入口都应该接入同一个 session/event bus，避免多套执行路径。

4. **权限请求的 UI 化**

   Agent 请求权限时，转换为按钮、卡片、审批动作，是移动端和 Web 管理端的关键体验。

5. **一个 runner 管多个 workspace**

   multi-workspace 模式、per-workspace agent pool、idle reaper 对本机 runner 设计有参考价值。

## 限制与风险

- 单机优先，不是多机器控制平面。
- 状态主要落 TOML/JSON 文件，不适合多用户、多机器和高并发。
- Web 鉴权是单 token，缺少账号、组织、RBAC、设备级权限。
- 没有完整 agent 安装、升级、诊断、依赖修复闭环。
- Workspace 是本地目录绑定，不是完整生命周期实体。
- Management API 文档和实现可能存在不完全一致。
- 很多设计围绕 IM 平台能力降级，不完全匹配 Web/App 优先的 AgentOps 产品。

## 对我们项目的架构启发

cc-connect 更适合被视为「runner 内核参考」，而不是 control plane 参考。

建议吸收：

```text
Runner
  ├─ Agent Adapter
  ├─ Session Manager
  ├─ Event Normalizer
  ├─ Permission Handler
  ├─ Workspace Pool
  └─ Local Process Supervisor
```

不要直接吸收：

```text
Single-token auth
Local TOML/JSON as primary state
IM-first platform model
Single-instance management API as fleet control plane
```

如果我们把 Happy 的 control plane 思路和 cc-connect 的 runner/adapter 思路结合，比较合理的方向是：

```text
Web / Mobile Client
        │
        ▼
Control Plane
        │
        ▼
Machine Runner
        │
        ▼
Agent Adapter
        │
        ▼
Cursor / Codex / Claude Code
```

其中 cc-connect 主要启发 `Machine Runner -> Agent Adapter -> Session Event` 这段。

