# Docker 镜像：agentops-server

统一镜像仓库名：**`agentops-server`**（如 `ghcr.io/<owner>/agentops-server`）。  
**不预装** Cursor、Codex、Claude Code；安装由 **`@lyzz0612/agentops-runner`** 在运行时执行。

## Tag 约定

| Tag | 内容 |
|-----|------|
| `<version>` | **纯 Server**（API + SQLite） |
| `<version>-web` | Server + 内嵌 Web 静态资源 |
| `<version>-allinone` | Server + Web + 镜像内已包含并启动 **agentops-runner**（CLI 在镜像内，非全局 npm） |
| `latest` | 与最近一次发布的 `<version>` 对应 |
| `latest-web` | 与最近一次 `-web` 对应 |
| `latest-allinone` | 与最近一次 `-allinone` 对应 |

示例版本 `0.1.0`：

```bash
docker pull ghcr.io/<owner>/agentops-server:0.1.0
docker pull ghcr.io/<owner>/agentops-server:0.1.0-web
docker pull ghcr.io/<owner>/agentops-server:0.1.0-allinone
```

## 使用场景

| Tag | 典型用途 |
|-----|----------|
| 无后缀 | 自托管控制面；Runner 在别机 `npm i -g @lyzz0612/agentops-runner` |
| `-web` | 控制面 + 浏览器管理台，Runner 外置 |
| `-allinone` | 一条 `docker run` 体验 Server + Web + Runner；agent 仍通过 UI/CLI 安装 |

## 快速启动（allinone 示例）

```bash
docker run -d \
  -p 8080:8080 \
  -v agentops-data:/data \
  ghcr.io/<owner>/agentops-server:0.1.0-allinone
```

浏览器访问 `http://localhost:8080`（端口以实现为准）。数据卷挂载 SQLite 与 Runner 状态。

## 与 npm CLI 的关系

| 安装方式 | 说明 |
|----------|------|
| `npm i -g @lyzz0612/agentops-runner` | 真实被管机、或本机开发 Runner |
| `-allinone` 镜像 | 镜像内 bundled 同一 CLI 产物，entrypoint 启动 daemon |

两种路径共用同一套安装/检测逻辑，不得在 Dockerfile 里 `curl | bash` 预装 agent。

## 发布

由 `release.yml` 构建并 push；tag 发版时三种 tag + `latest*` 一并更新。详见 [CI 与 Release](../development/ci-and-release.md)。

### Workflow 路径约定

`release.yml` 通过 reusable workflow `_publish-image.yml` 推送镜像，三种 tag 分别对应固定 Dockerfile 路径：

| Tag suffix | Dockerfile | 备注 |
|------------|------------|------|
| `<version>` | `server/Dockerfile` | 纯 Server |
| `<version>-web` | `server/Dockerfile.web` | + 内嵌 Web 静态资源 |
| `<version>-allinone` | `server/Dockerfile.allinone` | + Web + 镜像内 agentops-runner |

每次构建会传入 `--build-arg VERSION=<version>`，Dockerfile 可据此打标签或注入到 `/etc/agentops-version`。

### latest 行为

| 触发 | `latest`/`latest-web`/`latest-allinone` |
|------|-----------------------------------------|
| `v*` tag push | **更新**为本次 `<version>(-suffix)` |
| `workflow_dispatch` | **不更新**（避免 RC / dryrun 误覆盖） |

### 缺失 Dockerfile 的行为

`_publish-image.yml` 的第一步会校验 Dockerfile 是否存在：

```text
::error::Dockerfile server/Dockerfile.allinone 不存在；请先在 server 包中提供该镜像构建文件
```

这是有意的"显式失败"，确保 workflow 不会在缺产物时静默成功。`v1-docker-dev-testing` 变更落地后，三个 Dockerfile 已就位：

| Tag suffix | Dockerfile | 入口 | 包含 |
|------------|------------|------|------|
| `<version>` | `server/Dockerfile` | `node server/dist/index.js` | Server (Fastify + SQLite) |
| `<version>-web` | `server/Dockerfile.web` | `node server/dist/index.js`；`/app/web` 暴露给反向代理 | Server + Expo Web 静态产物 |
| `<version>-allinone` | `server/Dockerfile.allinone` | `/usr/local/bin/agentops-allinone`（Bash 引导脚本） | Server + Web + bundled `agentops-runner` |

### all-in-one 启动行为

入口脚本 `server/entrypoint-allinone.sh`：

1. 校验 `AGENTOPS_TOKEN`；
2. `node server/dist/index.js` 后台启动 Server；
3. 轮询 `/healthz`；
4. `node cli/bin/agentops-runner.mjs login --server http://127.0.0.1:4000 --token $AGENTOPS_TOKEN`（已有 credentials 则跳过）；
5. `node cli/bin/agentops-runner.mjs daemon` 后台启动 Runner；
6. 任一进程退出则整体退出。

可通过 `AGENTOPS_ALLINONE_SKIP_RUNNER=1` 关闭 bundled runner（例如只想用镜像跑 Server）。

镜像**不预装** Cursor / Codex / Claude Code。`pnpm smoke:allinone` 会在本机 build 镜像并断言这一点。

## 本地构建与 smoke

```bash
# 构建 allinone 镜像
pnpm allinone:build

# 一行起跑（端口可在脚本里改）
pnpm allinone:run

# 自动化 smoke：build + run + healthz + 反注入校验
pnpm smoke:allinone
```

若没装 Docker，`pnpm smoke:allinone` 会打印 skip 日志并退出 0。
