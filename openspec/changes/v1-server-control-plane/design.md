## 上下文

v1 需要 Server 作为 Client 与 Runner 之间的控制面。现有文档已经确定：Server 使用 Node.js / TypeScript + SQLite，Client 不直接访问 Runner，Server 不直接执行用户机器命令，Runner 主动连接 Server。

Server 还需要承接全局规则：单 Token 访问控制、Machine 软删除、管理动作记录、基础审计和 WebSocket 状态推送。

## 目标 / 非目标

**目标：**

- 提供 Client HTTP API、Client WebSocket 和 Runner Channel。
- 使用部署侧配置的单一 Token 保护 Client 与 Runner 请求。
- 持久化 Machine、Runner、AgentInstallation、DoctorCheck、ManagementAction、ActionLog、AuditLog。
- 支持机器注册、在线/离线、改名、软删除和删除后重新 login 创建新机器。
- 支持 detect/install/upgrade/doctor/uninstall 动作创建、调度、状态更新和结果记录。
- 对 Client 推送机器状态、动作状态和 Agent 状态变化。

**非目标：**

- 不实现多用户、组织、角色或 OAuth。
- 不执行本机命令，不直接安装 Agent。
- 不保存 Agent API key 明文或完整私有配置。
- 不实现 Workspace、Task、Session 或 Agent 对话。
- 不提供硬删除机器能力。

## 决策

### 单 Token 鉴权

Server 从环境变量读取访问 Token。Client 登录、HTTP API、WebSocket 和 Runner Channel 都使用同一 Token。这样减少 v1 账号系统复杂度，也符合自托管优先的定位。

替代方案是用户名密码或多用户系统。它们更完整，但会引入用户表、会话生命周期、密码初始化和权限模型，不适合 v1。

### SQLite 作为控制面元数据存储

SQLite 存储控制面元数据，包括机器、Agent 状态、动作和审计。Server 初期按单实例设计，SQLite 部署和本地开发成本最低。

替代方案是 Postgres。它更适合多租户和多副本，但 v1 没有这个规模需求。

### Runner 主动连接

Runner daemon 主动连接 Server，并通过长连接接收命令、上报心跳和执行结果。Server 不主动 SSH 到机器，也不暴露机器侧访问入口。

### 软删除机器

删除机器只设置 `deleted_at`。常规查询过滤已删除记录，历史动作和审计保留。已删除机器不复活；旧凭据再次连接时返回失效错误，引导重新 login 创建新 `machineId`。

唯一索引必须考虑 `deleted_at IS NULL` 或等价策略，避免已删除记录阻止同一物理机重新注册。

### 管理动作调度边界

Server 负责动作排队和状态持久化，不负责执行。并发规则是同一机器不同 Agent 可并行，同一机器同一 Agent 串行。`cancelled` 可保留为状态枚举，但 v1 不提供取消入口。

### WebSocket 事件

Client Realtime 使用 WebSocket。v1 只推机器在线、动作状态、detect 结果和 Agent 状态变化，不推长日志。

## 风险 / 权衡

- 单 Token 泄漏会影响整个实例 → 文档要求通过部署环境管理 Token，后续版本再引入多用户和令牌轮换。
- SQLite 单实例限制横向扩展 → v1 明确不做多副本，后续 SaaS 化再迁移。
- 不展示长日志会降低排障效率 → Server 仍保存 ActionLog，v1 UI 只展示摘要。
- 软删除会影响唯一索引和重连逻辑 → schema 阶段必须把未删除唯一性作为约束写入迁移。
