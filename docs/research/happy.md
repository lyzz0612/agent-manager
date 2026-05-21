# Happy 项目探索记录

探索对象：[slopus/happy](https://github.com/slopus/happy)

探索背景：我们想做一个网页版、未来支持手机 App 的 AI agent 管理工具，初版支持 Cursor、Codex、Claude Code，未来支持多机器管理、新建工作区、远程执行任务和实时反馈。

## 一句话结论

Happy 更像一个面向 Claude/Codex/Gemini/OpenClaw 等本地编码 agent 的「多端远程控制 + 多机器 daemon + 加密同步」系统。它最值得借鉴的是 `App/Web -> Server -> Machine Daemon -> Agent` 的分层、socket scope 设计、远程 spawn session、持久事件与临时事件分离。

它目前还不是完整 AgentOps 控制台，主要缺口是一等的 `Workspace`、`Checkout`、`Task`、审计、策略和完整任务编排模型。

## 产品定位

Happy 解决的是：用户离开电脑后，仍然可以通过手机或 Web 查看本机 agent 的进度、发送 prompt、审批权限、停止/恢复 session，并在 daemon 在线时远程启动新的 agent session。

典型用户流：

1. 用户安装移动 App 或打开 Web App。
2. 在电脑上安装 CLI：`npm install -g happy`。
3. 使用 `happy claude`、`happy codex` 等命令代替原始 agent CLI。
4. Happy CLI 在本机创建加密 session，并连接 Happy Server。
5. 用户在手机/Web 上查看 agent 输出、继续输入、审批权限。
6. 如果本机 daemon 在线，用户可以远程选择机器和目录，启动新的 agent session。

产品心智更接近：

```text
Mobile / Web App
        │
        ▼
Encrypted Sync + RPC Relay
        │
        ▼
Machine Daemon
        │
        ▼
Claude / Codex / Gemini / OpenClaw
```

## 技术栈

前端/客户端：

- `packages/happy-app`：Expo + React Native + Expo Router。
- 同时支持 iOS、Android、Web。
- 使用 `socket.io-client`、`zustand`、`react-native-mmkv` 等。

CLI/Runner：

- `packages/happy-cli`：Node.js + TypeScript。
- 发布包名为 `happy`。
- 支持 `happy claude`、`happy codex`、`happy gemini`、`happy openclaw`、`happy acp ...`。
- 本机状态主要存放在 `~/.happy`，包括 `settings.json`、`access.key`、`daemon.state.json`、`sessions.json`、`logs/`。

后端/控制面：

- `packages/happy-server`：Fastify + Socket.IO。
- Postgres + Prisma。
- Redis Streams Adapter 用于多副本 Socket.IO 广播和跨副本 RPC。
- S3/MinIO 或本地文件系统用于附件/文件存储。
- 支持 self-host/standalone，部分模式下使用 PGlite。

共享协议：

- `packages/happy-wire`：Zod + TypeScript schema。
- 定义 session message、update、session protocol envelope。
- 设计重点是服务端尽量只看加密 blob 和少量元数据。

## 架构分层

Happy 的整体分层比较接近我们设想中的长期架构：

```text
App / Web / happy-agent
        │
        │ HTTP + Socket.IO
        ▼
Happy Server / Control Plane
        │
        │ Scoped Socket + RPC Forwarding
        ▼
Machine Daemon / Session Process
        │
        │ Child Process / SDK / CLI
        ▼
Claude Code / Codex / Gemini / ACP Agent
```

关键分层：

- App/Web 是用户操作入口。
- Server 主要做认证、同步、加密数据存储、事件广播、RPC relay。
- Machine daemon 是执行边界，负责注册机器、保活、远程 spawn/resume/stop session。
- Session process 负责和具体 agent CLI 交互。

这套分层非常适合多端管理和多机器管理，因为服务端不需要直接进入用户机器，也不直接执行 shell。

## Workspace 与 Session 模型

Happy 目前没有一等 `Workspace` 模型。

当前模型更像：

```text
Machine + Path + Agent + Session
```

新建 session 时，用户在前端选择：

- machine
- directory/path
- agent
- permission mode
- worktree 相关选项

然后流程大致是：

1. App 发起 `machineSpawnNewSession()`。
2. Server 通过 machine-scoped socket 将 RPC 转发到对应 machine daemon。
3. Daemon 检查目录、必要时创建目录。
4. Daemon 启动 `happy claude ...` 或 `happy codex ...` 子进程。
5. 子进程启动 session 后回调本机 daemon control server。
6. Daemon 向 App/Server 确认 session 创建成功。

这已经能支持「多机器远程启动 agent」，但 `workspace` 仍只是路径字段，不是领域实体。

对我们的启发是：如果目标包含新建工作区、远程机器、repo clone、worktree、任务执行和回收，一开始就应该建模：

```text
Workspace
Checkout
Machine
Runner
Session
Task
```

不要只用 `machine + path` 作为长期模型。

## 实时反馈与状态同步

Happy 的实时设计非常值得借鉴。

它区分两类事件：Durable Update
  持久化、有 per-user seq，可断线恢复。

Ephemeral Event
  不落库，用于在线状态、activity、thinking、usage、临时状态。

```text

```

持久事件适合：

- new session
- new message
- update session
- new machine
- update machine
- artifact
- kv/data update

临时事件适合：

- machine activity
- session activity
- 当前 thinking 状态
- token/cost usage
- 权限提示
- 在线/离线 presence

这对我们的产品很重要，因为 Web 和手机 App 都需要稳定恢复任务历史，同时又要实时显示 agent 当前在做什么。

## Socket Scope 与 RPC

Happy 将 socket 连接分成不同 scope：

- `user-scoped`：App/Web 使用，接收用户级 update。
- `machine-scoped`：本机 daemon 使用，负责机器注册、心跳、远程启动任务。
- `session-scoped`：单个 agent session 使用，负责 session 消息和状态。

RPC 通过 Socket.IO room 转发，例如：

```text
rpc:<userId>:<machineId>:spawn-happy-session
rpc:<userId>:<sessionId>:bash
```

这种设计的好处：

- Server 不需要知道具体执行细节。
- Machine daemon 和 session process 的职责边界清晰。
- 可以把 `spawn`、`stop`、`resume`、`readFile`、`bash` 等能力作为受控 RPC 暴露。

对我们来说，RPC 应主要用于控制面动作：

- spawn task
- stop task
- approve permission
- list directory
- read file
- health check
- agent doctor

长任务输出不适合直接走 RPC，应进入 session event/log stream。

## 认证、权限与加密

Happy 的认证模型大致是：

- 用户身份基于 public key。
- `/v1/auth` 验证签名 challenge。
- Server 返回 Bearer token。
- CLI/App 后续 HTTP 和 Socket.IO 使用 Bearer token。

加密方面：

- session metadata、agent state、message content、machine metadata、artifact、KV 等由客户端加密。
- Server 尽量只存 opaque blob。
- 新数据使用 per-session/per-machine data key + AES-256-GCM。

权限方面：

- 支持 Claude/Codex 等 agent 的权限模式映射。
- 权限模式包括默认、接受编辑、绕过权限、plan 等。
- 部分 sandbox/permission 逻辑由 agent adapter 处理。

这对个人开发者场景很有吸引力，因为服务端对用户源码和 agent 消息的责任较低。但如果我们未来要做团队审计、任务评估、失败分析、策略编排，完全端到端加密会限制服务端理解任务内容。

## 多机器能力

Happy 已经有多机器雏形：

- Machine 表按 account 持久化。
- Daemon 启动时注册机器。
- Machine metadata 包含 host、platform、CLI version、homeDir、CLI availability、resume support。
- Daemon 通过 `machine-alive` 保活。
- App 可以查看 machines，并对在线 machine 发 RPC。

但它不是云端 runner 平台：

- 真正执行仍发生在用户机器上的 daemon/session 进程。
- Server 是 encrypted sync + RPC relay。
- Server 不直接执行 shell，也不接触源码。

这一点与我们设想中的「管理多台机器」非常吻合。初版也应该优先考虑 runner 主动连接 control plane，而不是 server 主动 SSH 到机器。

## 关键代码位置

以下路径来自 Happy 项目本身：

- `packages/happy-app/sources/app/(app)/index.tsx`：主界面。
- `packages/happy-app/sources/app/(app)/new/index.tsx`：新建 session。
- `packages/happy-app/sources/app/(app)/session/[id].tsx`：session 详情。
- `packages/happy-app/sources/app/(app)/machine/[id].tsx`：机器详情。
- `packages/happy-app/sources/sync/sync.ts`：前端同步核心。
- `packages/happy-app/sources/sync/apiSocket.ts`：App/Web socket 接入。
- `packages/happy-server/sources/main.ts`：Server 启动入口。
- `packages/happy-server/sources/app/api/api.ts`：Fastify 路由和 Socket.IO 挂载。
- `packages/happy-server/sources/app/api/socket.ts`：Socket.IO 入口和 scope 区分。
- `packages/happy-server/sources/app/events/eventRouter.ts`：事件广播。
- `packages/happy-server/sources/app/api/socket/rpcHandler.ts`：RPC 转发。
- `packages/happy-cli/src/daemon/run.ts`：daemon 主逻辑。
- `packages/happy-cli/src/daemon/controlServer.ts`：本机 control server。
- `packages/happy-cli/src/api/apiMachine.ts`：machine-scoped socket。
- `packages/happy-cli/src/api/apiSession.ts`：session-scoped socket。
- `packages/happy-cli/src/modules/common/registerCommonHandlers.ts`：远程 bash/readFile/writeFile/listDirectory/ripgrep 等能力。
- `docs/protocol.md`：协议说明。
- `docs/realtime-sync-and-rpc.md`：实时同步和 RPC 设计。
- `docs/multi-process.md`：多进程设计。

## 可借鉴设计

1. **Machine daemon 作为执行边界**
  Server 不直接执行命令，不进入用户机器。本机 daemon 负责检测 CLI、管理进程、执行任务。这与多机器管理天然匹配。
2. **user/machine/session 三类连接**
  这比单一 WebSocket 更清晰。用户端、机器端、session 端的权限、事件和生命周期都可以分开管理。
3. **持久事件与临时事件分离**
  任务日志、agent message、session 状态需要可恢复；在线状态、activity、thinking、usage 则更适合 ephemeral。
4. **RPC 只做控制面**
  远程启动、停止、审批、文件读取、doctor 适合 RPC；长输出进入 session stream。
5. **隐私优先**
  端到端加密是一个强产品卖点，尤其是个人开发者或企业内网场景。
6. **Self-host 友好**
  `happy server` + 轻量 DB + 静态 Web App 的模式对个人和小团队很有吸引力。

## 限制与风险

- 缺少一等 `Workspace` / `Checkout` / `Task` 模型。
- 完全加密会限制服务端做任务理解、审计、分析和策略编排。
- RPC timeout 更适合短控制命令，不适合长任务执行。
- Daemon 生命周期仍偏手工，生产级需要 systemd/launchd/Windows Service。
- 远程 `bash`、`writeFile` 能力风险高，需要强 policy、审计、路径边界和授权机制。
- 不同 agent adapter 和 legacy protocol 并存，直接复用会有历史包袱。

## 对我们项目的架构启发

如果我们做网页版/手机 App 的 AgentOps 控制台，Happy 可以作为控制面和多机器通信的参考，但不应直接照搬领域模型。

建议吸收：

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
```

同时从第一天建模：

```text
Machine
Runner
Workspace
Checkout
AgentInstallation
AgentProfile
Task
Session
Event
Secret
Policy
AuditLog
```

Happy 的经验说明，`machine + path + session` 足够启动 MVP，但很快会限制工作区生命周期、任务调度、审计和多机器管理。