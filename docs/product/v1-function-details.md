# v1 功能细节

本文记录 v1「安装与基础管理」的产品细节。版本目标和范围边界见 [v1：三层框架与基础安装管理](../roadmap/version-1-framework.md)。

## 访问与登录

- v1 使用单一访问 Token，不引入多用户、组织、角色或用户名。
- Server Token 由用户在部署环境中显式配置，例如 Docker / Compose / `.env` 中的 `AGENTOPS_TOKEN`（具体变量名以实现为准）。
- Web / App 首次打开时先填写 Server 地址，再进入明确的 Token 登录页。
- Client 本地持久保存一个 Server 地址和 Token；关闭浏览器或 App 后仍保持登录。
- v1 不支持在同一 Client 中保存多个 Server。
- 设置页允许修改 Server 地址；修改后必须重新登录。
- Runner `login` 使用同一个 Server 地址和 Token。

## Client 形态与导航

- Client 使用 Expo + React Native Web，同一套功能面向 Web 与 Android。
- Web 与 Android 共用 API、状态模型和页面能力；差异只体现在响应式布局和平台交互细节。
- v1 主导航为「机器」和「设置」两个入口。
- 手机端使用底部 Tab；Web 端可以使用侧边栏或顶部导航，但保持同一套路由和信息架构。
- Web 与手机都采用逐层进入的信息结构，不采用宽屏左右分栏的主从布局。机器列表、机器详情、Agent 详情或动作结果应通过路由或页面层级进入，避免同一屏同时展开多层信息。

核心路由：

```text
/login
/machines
/machines/:machineId
/machines/:machineId/agents/:agentType
/machines/:machineId/actions/:actionId
/settings
```

v1 不提供全局审计页。

## 机器管理

- v1 支持多台机器的列表和详情，但不主打 fleet 管理。
- v1 不做机器标签、批量操作、高级筛选或分组。
- 每台物理机对应一个活跃 Runner 身份。
- 同一台未删除机器重复 `login` 时应更新或覆盖原记录，不新增重复机器。
- 新机器默认显示名为 `{hostname} ({platform})`，例如 `DESKTOP-ABC (Windows)`。
- 用户可在 Client 中修改机器显示名。
- 机器列表按在线状态排序：online 在前，offline 在后；同一组内按显示名排序。
- 机器列表只展示机器名称、在线状态和必要的平台信息，不展示 Agent 摘要，避免未来 Agent 数量增加后列表失控。

在线状态规则：

- Runner 连接存在时机器为 `online`。
- Runner 连接断开后立即为 `offline`，v1 不做宽限期。
- Runner `daemon` 连接 Server 时自动执行一次 detect。

## 删除与软删除规则

删除机器是产品能力，但数据库层面必须是软删除。

- 用户在 Client 中看到的是「删除机器」。
- 实现上只设置 `deleted_at` 或等价字段，不提供硬删除业务能力。
- 列表和常规 API 默认过滤已删除机器。
- `ManagementAction`、`ActionLog`、`AuditLog` 等历史记录保留。
- `machineId` 全局唯一且不回收。
- 已软删机器不复活；同一物理机重新加入时必须重新 `login` 并创建新的 `machineId`。
- Runner 使用已删除机器的旧凭据连接时，Server 应拒绝并提示重新登录。
- 数据库唯一索引需要考虑软删除语义，避免已删除记录阻止同一机器重新注册为新记录。

## Agent 与适配层

v1 内置管理对象：

```text
Cursor
Codex
Claude Code
```

Agent 能力必须通过适配层扩展：

- Runner 使用 `AgentAdapter` 或等价抽象封装不同 Agent 的检测、安装、升级、卸载和 doctor。
- Client 和 Server 面向统一的 Agent 状态与动作协议，不散落针对具体 Agent 的特殊逻辑。
- 新增 Agent 应通过注册表扩展，而不是在业务流程中堆叠分支。

每个 Agent 至少统一描述：

- 安装状态。
- 版本。
- 可执行文件路径。
- PATH 是否可用。
- 配置文件是否存在。
- 认证或关键配置是否看起来完整。
- 最近 doctor 结果。

## Agent 配置

- v1 只读展示配置状态，不通过 Web / App 下发配置修改。
- 可展示配置路径、配置文件是否存在、认证或关键配置是否看起来完整。
- 敏感值必须脱敏展示，不保存或展示 API key 明文。
- `configure` 动作不作为 v1 用户可用管理动作。

## 管理动作

v1 对用户开放以下动作：

```text
detect
install
upgrade
doctor
uninstall
```

动作规则：

- 安装、升级、卸载均由 Runner 执行。
- Cursor、Codex、Claude Code 都需要支持自动安装和升级。
- 实现安装 / 升级 / 卸载时必须阅读并遵循对应产品官方文档，不凭经验写命令。
- 未安装时主按钮为「安装」；已安装时主按钮可切换为「升级」，并保留「检测」「Doctor」「卸载」入口。
- 删除机器和卸载 Agent 均需要二次确认，并说明后果。
- v1 不支持取消运行中的管理动作；`cancelled` 可作为协议保留状态，但 UI 不提供取消按钮。

并发规则：

- 同一台机器上，不同 Agent 的动作可以并行。
- 同一台机器同一 Agent 的动作必须串行，后续动作进入 `queued`。

状态更新规则：

- 用户手动触发 detect 后更新 Agent 状态。
- install、upgrade、doctor、uninstall 完成后更新 Agent 状态。
- Runner `daemon` 连接 Server 时自动执行一次 detect。
- v1 不做周期性后台 detect。

## Doctor

v1 doctor 采用轻量检查：

- 命令是否在 PATH。
- 版本是否可读。
- 关键配置文件是否存在。
- 认证或关键配置是否看起来完整。
- 可执行官方认可的只读轻量 probe。

v1 doctor 不做真实 API 调用、不触发计费操作、不主动进入登录流程。

## 动作结果与日志

- v1 Web / App 不展示长日志或流式日志。
- 动作进行中只展示状态和简短提示。
- 动作完成后展示成功 / 失败和简短摘要或 stderr 摘要。
- Runner 可继续上报 `ActionLog` 入库，用于排错和后续版本能力。
- 全量日志查看、下载和审计查询不作为 v1 UI 范围。

## 实时更新

- Client Realtime 使用 WebSocket。
- v1 需要推送机器在线状态、动作状态、detect 结果和 Agent 状态变化。
- v1 不通过 WebSocket 推送长动作日志。
- 选择 WebSocket 是为了后续对话、任务执行和实时 agent 输出复用同一长连接模型。

## 审计

- v1 写入基础 `AuditLog`。
- 至少记录 Runner 注册 / 删除机器 / 发起管理动作 / 动作结果等关键事件。
- v1 不提供全局审计页面、查询或导出。

## 页面范围

v1 页面最小集：

- 登录页：填写 Server 地址和 Token。
- 机器列表页：展示机器、在线状态、平台信息；支持进入详情。
- 机器详情页：展示机器基础信息、显示名编辑、删除机器入口、Agent 卡片列表。
- Agent 卡片：展示统一状态、版本、路径、PATH、配置状态、Doctor 结果和可用动作。
- 设置页：展示 / 修改 Server 地址、退出登录、版本和关于信息。

详情页必须显示当前 Server 支持的所有 Agent。未安装 Agent 也应显示卡片，并提供「安装」作为主动作。

## 明确不做

v1 不包含：

- 多用户、角色和组织。
- 机器标签、批量操作、高级筛选和分组。
- Web / App 写入 Agent 配置。
- 运行中动作取消。
- 全局审计页面。
- 长日志流式展示。
- Workspace、Repo clone、Worktree。
- Agent 对话、任务执行和实时 agent 输出。
