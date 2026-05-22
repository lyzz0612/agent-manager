# @agentops/server

AgentOps v1 控制面（Control Plane）。

负责：

- Client HTTP API、Client WebSocket、Runner Channel 的入口。
- 部署侧单 Token 鉴权。
- Machine / Runner / Agent 状态、Doctor 结果、管理动作和审计的 SQLite 持久化。
- 同机器同 Agent 串行、不同 Agent 并行的管理动作调度。

> 与 OpenSpec 变更 `v1-server-control-plane` 对应。

## 目录结构

```
server/
├── src/
│   ├── index.ts                  # 进程入口（监听端口）
│   ├── app.ts                    # 依赖装配
│   ├── config.ts                 # 环境变量配置
│   ├── logger.ts                 # 结构化日志
│   ├── errors.ts                 # ApiError + 错误码
│   ├── dto.ts                    # Row -> DTO 转换
│   ├── domain/types.ts           # 领域类型与状态枚举
│   ├── protocol/
│   │   ├── client.ts             # Client API/WebSocket DTO
│   │   └── runner.ts             # Runner Channel 消息
│   ├── db/
│   │   ├── index.ts              # 打开 SQLite + 运行迁移
│   │   ├── migrations.ts         # 全部表与索引
│   │   └── repositories/         # 各表的访问层
│   ├── realtime/events.ts        # 内部事件总线
│   ├── services/
│   │   ├── audit.ts
│   │   ├── machines.ts
│   │   ├── agents.ts
│   │   └── actions.ts            # 调度核心
│   ├── http/
│   │   ├── app.ts                # Fastify 应用
│   │   └── auth.ts               # Token 中间件
│   └── ws/
│       ├── client.ts             # Client WebSocket Hub
│       └── runner.ts             # Runner Channel Hub
└── test/                         # vitest 单元/集成测试
```

## 环境变量

| 名称 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `AGENTOPS_TOKEN` | 是 | - | 部署侧单 Token，保护 Client + Runner 入口。 |
| `AGENTOPS_HOST` | 否 | `0.0.0.0` | HTTP 监听地址。 |
| `AGENTOPS_PORT` | 否 | `4000` | HTTP 监听端口。 |
| `AGENTOPS_DB_PATH` | 否 | `./data/agentops.db` | SQLite 文件路径，生产应放在持久化卷。 |
| `AGENTOPS_LOG_LEVEL` | 否 | `info` | `debug` / `info` / `warn` / `error`。 |

参见 `.env.example`。

## 本地运行

```bash
pnpm --filter @agentops/server install   # 在仓库根装好 workspace 后
pnpm --filter @agentops/server dev       # tsx watch
```

> 当前仓库根尚未配置 pnpm workspace。`server/` 可独立运行：进入目录后 `npm install` + `npm run dev`。

## Client HTTP API

所有 `/api/*` 接口需要 `Authorization: Bearer <token>`。错误响应统一为：

```json
{ "error": { "code": "<code>", "message": "<msg>", "details": {} } }
```

常见 `code`：`unauthorized` / `forbidden` / `not_found` / `bad_request` / `conflict` / `machine_deleted` / `machine_not_online` / `internal`。

### 健康检查

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/healthz` | 无需鉴权。返回 `{ ok: true }`。 |
| `GET` | `/api/auth/check` | 校验 Token 是否有效，并返回支持的 Agent 列表。 |

### 机器

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/machines` | 机器列表（已按 online -> displayName 排序，过滤软删）。 |
| `GET` | `/api/machines/:machineId` | 机器详情 + 全部 Agent 摘要。 |
| `PATCH` | `/api/machines/:machineId` | 更新显示名。`{ displayName: string }` (1-80 char)。 |
| `DELETE` | `/api/machines/:machineId` | 软删除并撤销 Runner 凭据。返回 204。 |

### Agent

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/machines/:machineId/agents` | 当前机器所有内置 Agent 摘要（含未安装 Agent 的占位）。 |

### 管理动作

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/machines/:machineId/actions` | 创建动作。`{ agentKind, type, payload? }`。 |
| `GET` | `/api/machines/:machineId/actions` | 该机器动作历史（默认 50 条）。 |
| `GET` | `/api/actions/:actionId` | 单条动作 + 上报日志。 |

`agentKind`: `cursor` / `codex` / `claude-code`；
`type`: `detect` / `install` / `upgrade` / `doctor` / `uninstall`；
`status`: `queued` / `running` / `succeeded` / `failed` / `cancelled`（v1 不提供取消入口）。

### 审计

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/audit-logs?limit=100` | 倒序审计日志（默认 100，最大 500）。 |

### Runner 登录

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/runner/login` | 注册 / 绑定机器并下发 Runner 凭据。 |

请求体（全部可空）：

```json
{
  "hostname": "host",
  "platform": "linux",
  "arch": "x64",
  "displayName": "工位 1",
  "runnerVersion": "0.1.0"
}
```

响应：

```json
{
  "machine": { "id": "...", "displayName": "..." },
  "runner": { "id": "..." },
  "runnerToken": "<64-hex 明文，仅返回一次>"
}
```

同 fingerprint（hostname + platform + arch）重新 login 会复用未删除机器并撤销旧 RunnerToken。

## Client WebSocket

`GET /ws/client?token=<token>`（也支持 `Authorization: Bearer`）。

握手成功后立刻收到 `{ "type": "hello", "protocol": "client/v1" }`。
之后 Server 主动广播事件（不需要 Client 上行消息）：

```ts
// 机器在线状态变化
{ type: "machine.status", machineId, status, lastSeenAt }
// Agent 状态/Doctor 变化
{ type: "agent.status", machineId, agentKind, agent: AgentInstallationDTO }
// 管理动作状态变化
{ type: "action.status", action: ManagementActionDTO }
```

v1 不推流式日志。

## Runner Channel

`GET /ws/runner?runnerToken=<token>`（也支持 `X-Runner-Token: <token>`）。

握手错误（凭据失效、机器已删除）通过一条 `server.error` 消息回传并以 close code 4401 关闭。

握手成功后立即下发 `server.welcome`：

```ts
{ v: 1, type: "server.welcome", machineId, serverTime }
```

之后命令下发：

```ts
{ v: 1, type: "server.command.action", actionId, agentKind, actionType, payload }
```

Runner 可上行消息：

| `type` | 说明 |
|--------|------|
| `runner.hello` | 重协商；welcome 已在握手后下发，通常不需要。 |
| `runner.heartbeat` | 心跳，更新 `last_seen_at`。 |
| `runner.report.detect` | 一次或多次 Agent 检测结果。 |
| `runner.report.doctor` | Doctor 结果。 |
| `runner.report.action_result` | 动作终态（`succeeded` / `failed` / `cancelled`），可附带 `logs` 与 `detect`。 |

完整定义见 `src/protocol/runner.ts`。

## 调度规则

- 创建动作时：若 `(machineId, agentKind)` 已有 `queued` 或 `running`，新动作进入 `queued`；否则置 `running` 并立即派发。
- Runner 未在线：动作立即变为 `failed`，`error_message = "machine_not_online"`，下一条 `queued` 也会顺序推进。
- 动作进入终态时：从同 `(machineId, agentKind)` 的 `queued` 中按创建时间挑选最早一条置 `running`。
- 同机器不同 Agent 互不阻塞。
- Runner 断开 → 机器 `offline`；重连 → `redispatchInflight` 把 `running` 的动作重新下发，保证 Runner 端可基于 `actionId` 幂等处理。

## 软删除规则

- 删除机器只设置 `deleted_at`；唯一索引使用 `WHERE deleted_at IS NULL` 偏索引允许同一物理机重新注册。
- 删除时撤销 Runner 凭据；旧凭据再次尝试连接会被 `Runner Channel` 拒绝。
- 历史 `ManagementAction` / `ActionLog` / `AuditLog` 保留。

## 审计事件

| `event` | actor | target_type |
|---------|-------|-------------|
| `runner.registered` | `runner` | `machine` |
| `runner.connected` | `runner` | `machine` |
| `runner.rejected` | `runner` | `machine` |
| `machine.deleted` | `client` | `machine` |
| `machine.renamed` | `client` | `machine` |
| `action.created` | `client` | `action` |
| `action.finished` | `runner` | `action` |

## 测试

`vitest` 单元 + 路由集成测试（`fastify.inject` 不需要真实端口，SQLite 使用 `:memory:`）。

```bash
npm run test          # 一次性
npm run test:watch    # watch 模式
```

`build` 步骤会使用 `tsc` 输出到 `dist/`：

```bash
npm run build
npm start
```

## 已知限制 / 待后续版本完善

- 仅单实例：SQLite + 内存事件总线。多副本需要换 Postgres / Redis。
- Client WebSocket 当前广播所有事件，不做按 machine 过滤；按需可在 Hub 中加订阅列表。
- 动作没有超时机制；Runner 端实现超时后回传 `failed` 即可，Server 不主动取消。
- Token 旋转 / 多用户能力留待 v2+。
