# agent-manager 架构总入口

> 状态：已迁移（原 `docs/technical-solution.md`）
> 创建日期：2025-06-15

## 1. 总体方案

Phase 1 采用：

- `Rust + Axum`
- `React + Vite`
- `SQLite`
- `apps/ + crates/` monorepo
- 单容器部署 `core + web`

未来桌面端预留 `Tauri` 路线，但本次不初始化完整桌面壳。

## 2. 架构分层

```text
Browser
  │
  ▼
React/Vite Web UI
  │
  ▼
Axum HTTP Server
  ├─ 管理页 Token 认证
  ├─ Cursor 运行时管理
  ├─ Cursor 登录引导
  ├─ Plugin 管理（Paseo / GitHub CLI）
  ├─ 配置管理
  ├─ Skill 管理
  └─ 前端静态资源托管
  │
  ▼
Rust Core / Provider Layer
  ├─ 文件系统访问
  ├─ 受管目录管理
  ├─ 安装与升级流程
  ├─ 账号状态检测
  └─ 配置与 skill 读写
  │
  ▼
Managed Cursor Runtime
```

## 3. 仓库结构方向

计划采用如下结构：

```text
apps/
  web/
  server/
  desktop/   # 先占位

crates/
  app-core/
  cursor-provider/
  gh-provider/
  paseo-provider/
  host-fs/
  host-jobs/
  host-proc/
  host-model/
```

其中：

- `apps/web` 承载 React/Vite 前端
- `apps/server` 承载 Axum 服务
- `apps/desktop` 只保留最小占位
- `crates/` 用于沉淀未来 Web 与桌面共用的 Rust 能力

## 4. 运行时管理

### 4.1 Cursor 位置

Phase 1 中，Cursor 安装在容器内受管目录，不依赖宿主机预装。

### 4.2 安装与升级

- 安装方式：网页手动触发
- 安装来源：官方在线来源
- 首次安装版本：最新版
- 升级方式：网页手动触发
- 卸载：Phase 1 不支持

### 4.3 错误处理

当前阶段安装失败先直接报错，不做自动重试和备用源。

### 4.4 运行时状态缓存

读路径（agents / plugins / overview / plugin 详情 / Cursor 运行时与账号 / gh 账号）经进程内 `RuntimeCache` 返回快照，避免每次 GET 同步跑 CLI。

快照由三类事件刷新：

- 服务启动后异步 warmup（`scope=all`）
- 用户 `POST /api/cache/refresh`
- install / upgrade / uninstall、daemon 操作、Cursor / GitHub CLI 登录/登出等 mutation 成功后自动重算

`GET /app/settings` 的 git 信息**不**进缓存；Skills / Profile 文件读写同理。

### 4.5 Command Job（长 CLI 任务）

安装 / 升级 / 卸载 / daemon 启停等**长 CLI 操作**不再阻塞 HTTP 直到命令结束，而是经进程内 **JobRegistry（单槽）** 调度：

1. 领域 `POST` 在 `try_start` 成功后立即返回 `{ job_id, kind, label }`。
2. worker 线程通过 `host-proc` 流式读行 → `JobContext` 追加日志 → SSE 推送给前端。
3. 终态发 `done`（含 `success` / `message` / 可选 `result`），释放槽位；成功时触发与现 mutation 一致的 `RuntimeCache` 刷新。

**与 App Update 并存**：`app-core::update` 仍用独立 `UpdateJobState` + `GET /api/app/update/status` 轮询；**v1 不迁入** JobRegistry。

**编排约束**：

- 全局同时仅 **1** 个 Command Job；第二个 `try_start` → **409** + `active_job_id`。
- 唯一互斥闸口为 `JobRegistry::try_start`（无领域级 install mutex）。
- worker 读管道用无界 `mpsc`；事件主存储为内存 `events` buffer（供 SSE 回放）；`broadcast` 仅作 live 扇出，send 失败不阻塞 worker。
- 运行中可 `POST /api/jobs/:id/cancel` 杀子进程并释放槽位。
- 默认超时 120s；`agent_install`（含 Cursor 官方安装脚本）300s。
- **不做**：交互式终端、stdin、任务历史列表、磁盘 job 日志、多任务并行。

**通用端点**（均需管理页登录）：

| 端点 | 作用 |
|---|---|
| `GET /api/jobs/current` | 当前槽位快照（无任务时 `active: false`） |
| `GET /api/jobs/:id` | 指定 job 快照（`phase` / `message` / `line_count`） |
| `GET /api/jobs/:id/stream` | SSE：`phase` / `line` / `done` / `error`（先回放 buffer 再 live） |
| `POST /api/jobs/:id/cancel` | 取消运行中任务 |

**纳入 job 的领域 POST**（响应均为 `CommandJobStartResponse`）：

| 端点 | JobKind |
|---|---|
| `POST /api/profile/skills/cli/preview` | `skills_cli_preview` |
| `POST /api/profile/skills/cli/install` | `skills_cli_install` |
| `POST /api/agents/:id/install\|upgrade\|uninstall` | `agent_install` / `agent_upgrade` / `agent_uninstall` |
| `POST /api/plugins/:id/install\|upgrade\|uninstall` | `plugin_install` / `plugin_upgrade` / `plugin_uninstall` |
| `POST /api/plugins/:id/daemon/:action` | `plugin_daemon` |
| `POST /api/cursor/runtime/install\|upgrade` | 同 `agent_install` / `agent_upgrade`（`cursor`） |

**前端**：`CommandJobProvider` + 全局 `CommandJobPanel`（`App.tsx`）；各 mutation 页通过 `useCommandJob().runJob` 启动并订阅 SSE；409 时提示并订阅当前 `active_job_id`。

**Crate 边界**：`host-jobs`（Registry / SSE）、`host-proc`（流式子进程 + `ProcHandles` 共享 cancel/child）、`app-core::command_jobs`（各领域 `start_*_job`）。

## 5. 账号与登录

### 5.1 管理页认证

- 固定 Token
- 通过登录页输入
- 生产环境必须显式提供
- 开发态可允许默认 Token

### 5.2 Cursor 登录

Cursor 登录不和管理页登录混为一体，而是被管理对象的一部分。

当前路线是：

- 网页负责引导流程
- 允许用户去外部完成关键步骤
- 回到网页确认结果
- 当前账号展示按 best-effort 处理

### 5.3 Plugin 与 GitHub CLI

Phase 1 在 Plugins 页管理可选 CLI 插件。已注册：

| plugin id | 名称 | 职责 |
|---|---|---|
| `paseo` | Paseo | npm 安装 CLI；daemon 启停与配对链接 |
| `gh` | GitHub CLI | 从 GitHub 官方 release 按需安装；**GitHub.com** Web device flow 授权 |

**GitHub CLI 安装**：网页触发 `POST /api/plugins/gh/install`；后端从 `api.github.com/repos/cli/cli/releases/latest` 下载对应平台 tarball/zip，解压到 `~/.local/share/gh` 并链接 `~/.local/bin/gh`。卸载移除二进制，保留 `~/.config/gh`。

**GitHub CLI 授权**（平行于 Cursor `/api/cursor/*`）：

| 端点 | 作用 |
|---|---|
| `GET /api/gh/account` | `gh auth status` 解析登录态与 username |
| `GET /api/gh/auth-flow` | 登录引导步骤文案 |
| `POST /api/gh/login/start` | 后台 `gh auth login --web`（`BROWSER=false`），返回 device URL 与验证码 |
| `GET /api/gh/login/status` | 登录 session 状态 |
| `POST /api/gh/logout` | `gh auth logout --hostname github.com` |

编排约束：登录子进程最长 10 分钟；同一时刻仅一个 gh login session；`gh_account` 可经 `POST /api/cache/refresh` scope=`gh_account` 刷新。

v1 **不做**：GHE、PAT 粘贴登录、repo/PR 等业务 UI。

## 6. 配置与 Skill 管理

### 6.1 配置管理

双轨模式：

- 已知关键字段：表单化编辑
- 其他配置：原始文件编辑

原始文件保存前先预览，不做自动备份。

### 6.2 Skill 管理

Phase 1 管理用户级 skill 目录（`~/.agents/skills`、`~/.cursor/skills` 等）：

- 列出 / 查看 / 编辑（原始文件方式）
- **从远程仓库安装**（Web 向导 + `npx skills`）

安装流程（均需登录）：

| 端点 | 作用 |
|---|---|
| `GET /api/profile/skills/cli/status` | 探测 Node + `npx skills` 是否可用（`ready` 为 false 仍 200，便于 UI 展示原因） |
| `POST /api/profile/skills/cli/preview` | 启动 **Command Job**：对 source 执行 `add -l`，流式日志；`done.result` 含可选 skill 列表 |
| `POST /api/profile/skills/cli/install` | 启动 **Command Job**：`npx skills add … -g -y --copy`；`done.result` 含 `SkillsCliInstallResult` |

`common` → npx agent `zed`（`~/.agents/skills`）；`cursor` → `cursor`（`~/.cursor/skills`）。未映射的 agent scope 不可安装。

编排约束：preview / install CLI 超时 120s；**全局单槽**由 `JobRegistry` 互斥（不再使用 install mutex）；Skills 列表**不进** `RuntimeCache`。

运行时镜像（Docker `runtime` stage）从 web-builder 复制 Node 22 + npx，使 Compose 部署下 `status.ready` 可为 true。

## 7. 交付与发布

### 7.1 Docker

- 单容器交付
- Axum 同时托管 API 和前端静态资源
- Compose 只给最简应用容器
- 反代和 HTTPS 由外层处理

### 7.2 版本与发布

- 当前分支 push 触发 GitHub Actions
- 普通提交也生成正式 `X.Y.Z`
- 根目录 `VERSION` 是唯一版本源
- Action 构建后回写 `VERSION`
- 回写提交通过 bot actor guard 防止再次触发
- 发布仓库：`ghcr.io`
- 镜像架构：`linux/amd64`
- 镜像标签：`X.Y.Z` 和 `latest`

## 8. 文档策略

本项目采用 CodeStable 文档体系：

- `.codestable/requirements/` — 能力愿景与产品边界
- `.codestable/architecture/` — 架构总入口（本文件）
- `.codestable/compound/decision/` — 已拍板约束
- `.codestable/features/` — 功能设计与验收
- `.codestable/reference/attention.md` — 技能启动必读（运行、脚本、凭证）
- 仓库 `README.md` 保留对外入口

## 9. 后续拆分建议

当前 Phase 1 先保持一个 umbrella 变更，便于在空仓库阶段统一推进文档、骨架、交付链和核心管理能力。

当 Web 管理面和容器交付链稳定后，后续实现建议再拆成更细的变更：

- `desktop-shell`
  - 只处理 `Tauri` 桌面壳、桌面启动流程和本机宿主边界
- `cursor-runtime-integration`
  - 聚焦 Cursor 真实安装、升级、状态检测和账号探测
- `cursor-profile-management-hardening`
  - 聚焦配置编辑、原始文件预览、skill 管理的完善与安全性

这样可以避免在当前阶段过早把桌面端、真实 Cursor 集成和 Web 管理面揉成一个超大实现块。
