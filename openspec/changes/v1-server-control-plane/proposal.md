## 为什么

v1 需要先把 Server 建成稳定的 control plane，承接 Client 请求、Runner 注册连接、机器状态、Agent 状态和管理动作调度。没有这层协议和状态中心，Client 与 Runner 会被迫直接耦合，后续多端和多机器能力也无法自然演进。

## 变更内容

- 新增 Server 的单 Token 访问控制，Token 由部署环境配置。
- 新增 Machine / Runner 注册、在线状态、软删除和重连处理。
- 新增 Agent 安装状态、Doctor 结果、管理动作、动作日志和基础审计的 SQLite 持久化。
- 新增 Client HTTP API，用于登录校验、机器列表/详情、机器改名/删除、Agent 状态读取和管理动作创建。
- 新增 Client WebSocket 推送，用于机器在线状态、动作状态、detect 结果和 Agent 状态变化。
- 新增 Runner Channel，用于 Runner 登录绑定、daemon 连接、心跳、接收管理动作和上报执行结果。
- 不在 Server 中执行本机命令，不保存 Agent 私有配置明文，不提供硬删除机器能力。

## 功能 (Capabilities)

### 新增功能

- `server-control-plane`: Server 单 Token 认证、Machine / Runner 注册、Agent 状态存储、管理动作调度、WebSocket 事件、Runner Channel 和基础审计。

### 修改功能

## 影响

- 新增 Server 包或应用入口。
- 新增 SQLite schema、迁移和数据访问层。
- 新增共享 schema / DTO / 事件类型。
- 新增 HTTP API、WebSocket 服务和 Runner Channel。
- 影响 Client 与 Runner 的鉴权、状态同步和动作协议。
