# v1：三层框架与基础安装管理

## 版本目标

v1 的目标是搭建 Client、Server、CLI/Runner 三层框架，并完成基础 agent 安装与管理闭环。

这一版验证的是：

```text
Web Client
    -> Server
        -> CLI / Runner
            -> Cursor / Codex / Claude Code
```

v1 不是单机网页工具，而是一个功能收窄的 control plane。

## 核心能力

### Client

- 提供 Web / Android 共用的管理界面。
- 首次使用先指定 Server 地址，再使用单一 Token 登录。
- 展示机器列表。
- 展示单台机器的基础信息。
- 展示 Cursor、Codex、Claude Code 的安装状态。
- 展示版本、路径、可执行性和 PATH 状态。
- 发起检测、安装、升级、卸载、doctor 等管理动作。
- 展示动作状态、结果和简短摘要；v1 不展示长日志流。

### Server

- 提供 Client API。
- 提供 Runner 注册和认证。
- 维护机器状态。
- 存储 agent 安装状态。
- 存储管理动作和动作结果。
- 接收 Client 管理请求。
- 向 Runner 下发管理动作。
- 接收 Runner 上报结果。
- 向 Client 推送状态变化。
- 使用 SQLite 保存控制面元数据。

### CLI / Runner

- 以 npm 包 **`@lyzz0612/agentops-runner`** 分发（全局命令以实现阶段为准）。
- 支持登录并绑定 Server。
- 支持 daemon 模式连接 Server。
- 上报机器基础信息。
- 检测 Cursor、Codex、Claude Code。
- 执行基础安装、升级、卸载和 doctor 动作。
- 回传动作日志和结果。

## 数据模型

v1 需要覆盖的核心对象：

```text
User
Machine
Runner
AgentInstallation
AgentConfig
DoctorCheck
ManagementAction
ActionLog
AuditLog
```

## 管理对象

v1 首批支持：

```text
Cursor
Codex
Claude Code
```

每个 agent 至少需要统一描述：

- 是否已安装。
- 版本。
- 可执行文件路径。
- PATH 是否可用。
- 配置是否存在。
- 认证或关键配置是否完整。
- doctor 检测结果。

## 交付形态

| 产物 | 形式 |
|------|------|
| Web Client | Expo Web；可内嵌进 Server 镜像（`-web` / `-allinone`） |
| Server | 控制面 API + SQLite |
| CLI / Runner | `@lyzz0612/agentops-runner`（npm） |
| Docker | 统一镜像名 **`agentops-server`**，tag 区分纯 Server / `-web` / `-allinone` |
| Android | 独立 APK（tag 发版进 GitHub Release；手动发版为 Actions Artifact） |

- 一套共享 schema。
- 一套基础管理动作协议。

**安装职责：** Cursor、Codex、Claude Code 的安装/升级/卸载/doctor **仅由 Runner CLI 执行**；Docker 镜像不预装 agent。v1 配置能力只读展示，不通过 Client 下发修改。

详细命名、开发与发版约定见：

- [v1 功能细节](../product/v1-function-details.md)
- [本地开发](../development/local-development.md)
- [测试策略](../development/testing.md)
- [CI 与 Release](../development/ci-and-release.md)
- [Docker 镜像](../operations/docker-images.md)

## 验收口径

### 产品

- 用户可以打开 Web 管理界面。
- 用户可以指定 Server 地址并使用部署侧配置的 Token 登录。
- 用户可以安装并绑定 CLI/Runner。
- Server 可以看到已注册机器。
- Web 可以看到机器上的 Cursor、Codex、Claude Code 状态。
- Web 可以发起检测、安装、升级、卸载和 doctor 动作。
- Runner 可以执行动作并回传结果。
- 管理动作会被记录到 Server。
- 机器删除对用户可见为删除，数据库策略为软删除且历史记录保留。

### 工程化

- 本地可用 **`pnpm dev`** 或 **Compose** 混搭 Server / Client / Runner（见开发文档）。
- 开发机默认不把 Runner 状态写入用户家目录；集成测试以 runner 包用例为准，`ci.yml` 在 push/PR 时跑通。
- 推送 **`v*` tag** 可全套发布 npm、三种 `agentops-server` tag（含 `latest*`）、Android，并创建 GitHub Release（失败则为 Draft）。
- 手动 `workflow_dispatch` 可按参数单独发版并上传 Artifacts，不创建 Release 页。

## 范围边界

v1 不包含：

- Workspace。
- Repo clone。
- Worktree。
- Agent 对话。
- 任务执行。
- 实时 agent 输出。
- 权限审批流。
- 云端 runner。
- 多人协作。
- 手机 App 正式发布。

