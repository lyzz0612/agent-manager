# CursorProject

本仓库以 **一个分支一个独立项目** 的方式管理多个实验性项目。`master` 分支保留公共配置、仓库说明，以及当前 AgentOps 管理工具的早期规划文档。

## 当前规划：AgentOps 管理工具

当前 `docs/` 目录记录一个 AI agent 网页管理工具的探索和规划。目标是构建 Web 优先、未来支持手机 App 的三层系统：

```text
Client
  Web 优先，未来 App 复用同一套客户端能力

Server
  负责账号、机器、状态、配置、审计和管理动作调度

CLI / Runner
  安装在被管理机器上，负责本机 agent 检测、安装、配置和状态上报
```

文档入口：

- [文档总索引](./docs/README.md)
- [技术选型和分层](./docs/architecture/technical-architecture.md)
- [版本路线](./docs/roadmap/README.md)
- [规范与共识](./docs/standards/decisions-and-conventions.md)
- [开源项目调研](./docs/research/README.md)

## 分支总览

| 分支 | 说明 |
|------|------|
| `master` | 默认分支，存放公共配置、仓库说明、AgentOps 规划文档 |
| `clipboard-sync` | **剪贴板跨端共享**：Cloudflare Worker 后端 + Android 客户端，支持文本剪贴板在多设备间同步 |
| `family-tree` | 家谱 / 族谱相关项目 |
| `game_framework` | 游戏框架 |
| `linuxdo_daily` | LinuxDo 每日任务自动化 |
| `novel_download` | 小说下载工具 |
| `tic_tac_toe` | 井字棋游戏 |
| `wsforward` | WebSocket 转发服务 |

## GitHub Actions Workflows

Workflow 文件位于 `master` 分支的 `.github/workflows/`，各功能分支上不保留 workflow 文件。Workflow 内部通过 `ref: clipboard-sync` 固定拉取代码分支，无论 push 还是手动触发都不会误拉 `master`。

### Deploy Worker（部署 Cloudflare Worker）

- **文件**：`.github/workflows/deploy-worker.yml`
- **触发条件**：
  - 推送到 `clipboard-sync` 分支，且 `worker/**` 路径有变更
  - 在 Actions 页面手动触发（`workflow_dispatch`）
- **作用**：从 `clipboard-sync` 拉取代码，将 `worker/` 部署为 Cloudflare Worker

### Build Android（构建 Android APK）

- **文件**：`.github/workflows/build-android.yml`
- **触发条件**：
  - 推送到 `clipboard-sync` 分支，且 `android/**` 路径有变更
  - 在 Actions 页面手动触发（`workflow_dispatch`）
- **作用**：从 `clipboard-sync` 拉取代码，构建 debug APK 并上传到 Actions Artifacts（保留 30 天）

### 配置步骤

使用 Workflow 前，需要在 GitHub 仓库中配置以下 Secrets（Settings → Secrets and variables → Actions）：

| Secret 名称 | 用途 | 获取方式 |
|-------------|------|---------|
| `CLOUDFLARE_API_TOKEN` | Wrangler 部署 Worker 的认证令牌 | [Cloudflare Dashboard → API Tokens](https://dash.cloudflare.com/profile/api-tokens)，创建 Token 时选择 "Edit Cloudflare Workers" 模板 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID | Cloudflare Dashboard 首页右侧栏，或任意 Workers 页面 URL 中的 ID |
| `KV_NAMESPACE_ID` | KV 命名空间 ID，部署时注入 `wrangler.toml` | 在 Cloudflare 后台创建 KV 命名空间后复制 ID（见下方步骤） |

### 首次部署前的准备

#### 1. 获取 `CLOUDFLARE_ACCOUNT_ID`

登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) → 左侧选择你的账户 → 右侧栏 **Account ID** 即是，复制保存。

#### 2. 创建 `CLOUDFLARE_API_TOKEN`

[Cloudflare Dashboard → My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token** → 选择 **Edit Cloudflare Workers** 模板 → 按需调整权限范围 → **Continue to summary** → **Create Token** → 复制保存（只显示一次）。

#### 3. 创建 KV 命名空间，获取 `KV_NAMESPACE_ID`

[Cloudflare Dashboard](https://dash.cloudflare.com/) → 左侧菜单 **Workers 和 Pages** → **KV** → **Create a namespace** → 名称填 `CLIPBOARD_KV`（或任意名称） → **Add** → 创建完成后，在列表中点击该命名空间 → 页面 URL 或详情中可以看到 **Namespace ID**，复制保存。

#### 4. 设置 Worker 运行时密钥 `JWT_SECRET`

首次部署成功后，在 Cloudflare Dashboard → **Workers 和 Pages** → 点击 `clipboard-sync` Worker → **Settings** → **Variables and Secrets** → **Add** → 名称填 `JWT_SECRET`，值填一个随机字符串（建议 32 位以上），类型选 **Secret** → 保存。

> 也可以通过命令行 `npx wrangler secret put JWT_SECRET` 完成，效果一样。

#### 5. 配置 GitHub Secrets

GitHub 仓库页面 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**，依次添加以上三个：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`KV_NAMESPACE_ID`。

#### 6. 触发部署

推送代码到 `clipboard-sync` 分支（`worker/**` 有变更时自动触发），或在 Actions 页面手动触发。

### 手动触发

在 GitHub 仓库页面：**Actions** → 选择 Workflow → 右上角 **Run workflow** → 点击运行。

> Workflow 内部硬编码了 `ref: clipboard-sync`，所以手动触发时无需额外选择分支。`workflow_dispatch` 按钮只有在默认分支（`master`）上存在 Workflow 文件时才会显示，这也是 Workflow 文件放在 `master` 分支的原因。
