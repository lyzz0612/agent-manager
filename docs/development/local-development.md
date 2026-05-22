# 本地开发

## 原则

| 原则 | 说明 |
|------|------|
| 不污染本机 | 主要指**开发阶段**；受管机上的 agent 安装仍是产品能力 |
| 污染主要来源 | **`agentops-runner`**（检测、安装、写配置）；Server 与 Web Client 在本机跑通常可接受 |
| 两条等价路径 | **`pnpm dev`** 与 **Docker Compose** 均为官方支持，文档并列 |
| 可混搭 | Server / Client / Runner 各自可选在本机或容器内运行 |

Agent（Cursor、Codex、Claude Code）的**安装与升级**一律由 **`@lyzz0612/agentops-runner`** 执行；Docker 镜像**不预装**这些 agent。

## 一次性准备

```bash
corepack enable                       # 启用 pnpm 9.15
corepack prepare pnpm@9.15.0 --activate
pnpm install                          # 安装 workspace 所有依赖
cp .env.example .env                  # 编辑 AGENTOPS_TOKEN 等变量
```

> 第一次 `pnpm install` 会生成根 `pnpm-lock.yaml`，请将其一并提交。

## 启动矩阵（推荐入口）

`pnpm dev:all` 通过 `scripts/dev.mjs` 读取下列环境变量，决定 Server / Client / Runner 各跑在哪：

| 变量 | 取值 | 默认 | 含义 |
|------|------|------|------|
| `SERVER_RUNTIME` | `local` / `docker` / `off` | `local` | Server 进程位置 |
| `CLIENT_RUNTIME` | `local` / `docker` / `off` | `local` | Expo Web dev server 位置 |
| `RUNNER_RUNTIME` | `local` / `docker` / `off` | `docker` | Runner daemon 位置 |

```bash
# 推荐：Server + Client 本机，Runner Docker（隔离 agent 安装）
pnpm dev:all

# 全本机：最快迭代，Runner 状态写 ./.agentops-dev
SERVER_RUNTIME=local CLIENT_RUNTIME=local RUNNER_RUNTIME=local pnpm dev:all

# 全容器：对齐 all-in-one 行为
SERVER_RUNTIME=docker CLIENT_RUNTIME=docker RUNNER_RUNTIME=docker pnpm dev:all
```

也可以直接使用细粒度脚本：

| 命令 | 说明 |
|------|------|
| `pnpm dev:server` | 本机以 `tsx watch` 启 Server（HTTP `:4000`） |
| `pnpm dev:client` | 本机以 `expo start --web` 启 Web Client（默认 `:8081`） |
| `pnpm dev:runner` | 本机启 Runner daemon；自动设置 `AGENTOPS_HOME=./.agentops-dev` |
| `pnpm dev:docker:runner` | 仅启 Runner 容器（默认推荐组合的容器侧） |
| `pnpm dev:docker:all` | 启 Server + Client + Runner 三容器 |

## 运行时混搭

### 推荐组合（默认）

```text
Server：本机    → http://localhost:4000
Client：本机    → http://localhost:8081
Runner：Docker  → 走 host.docker.internal 回连 Server，状态写卷 runner-state
```

启动：

```bash
pnpm dev:server   # 终端 1
pnpm dev:client   # 终端 2
AGENTOPS_RUNNER_SERVER_URL=http://host.docker.internal:4000 \
  pnpm dev:docker:runner    # 终端 3
```

> Linux 用户若 `host.docker.internal` 不可达，请改用本机 LAN IP 或 `--network=host`。

### 全本机

```bash
SERVER_RUNTIME=local CLIENT_RUNTIME=local RUNNER_RUNTIME=local pnpm dev:all
```

Runner 自动使用 `<repo>/.agentops-dev` 作为状态目录（`scripts/dev-runner.mjs` 设置）。

### 全容器

```bash
SERVER_RUNTIME=docker CLIENT_RUNTIME=docker RUNNER_RUNTIME=docker pnpm dev:all
# 或：
pnpm dev:docker:all
```

容器之间通过 compose 网络相互访问；浏览器仍打开本机 `http://localhost:8081`。

## 端口、卷与状态

| 服务 | 容器端口 | 默认 host 端口 | 状态位置 |
|------|----------|----------------|----------|
| Server | `4000` | `4000` | volume `server-data` → `/data/agentops.db` |
| Client (Expo Web) | `8081` | `8081` | 无持久化；只读源码挂载 |
| Runner | — | — | volume `runner-state` → `/var/agentops` |

本机模式下：

| 项 | 约定 |
|----|------|
| Runner 状态（dev） | 默认 `<repo>/.agentops-dev`（gitignore），勿默认写 `~/.agentops` |
| Server 数据（dev） | 默认 `<repo>/.data/server/agentops.db`，由 `AGENTOPS_DB_PATH` 指定 |
| 全局 CLI | 开发期**避免** `npm install -g`；使用 `pnpm exec` / workspace 脚本 |

## 浏览器访问

无论 Runner 是否在容器内，**在本机浏览器**打开映射端口即可：

```text
http://localhost:8081   # Expo Web dev server
http://localhost:4000   # Server REST + /ws/client
```

Client 使用 Vite/Expo HMR；如需远程访问，设置 `--host lan` 已在 Compose 命令中生效。

## Docker Compose 文件

| 文件 | 用途 |
|------|------|
| `docker-compose.yml` | 基础定义：Server / Client / Runner 三个 service，profile 控制启动 |
| `docker-compose.dev.yml` | dev-fast 叠加：源码挂载、依赖 volume、`tsx watch` / `expo start` |
| `server/Dockerfile.dev` | 仅 Server 的 dev 镜像（带 pnpm/tsx） |
| `client/Dockerfile.dev` | 仅 Client 的 dev 镜像（Expo + pnpm） |
| `cli/Dockerfile.dev` | 仅 Runner 的 dev 镜像（带 pnpm，运行 TS 源码） |

Dev compose 与发布镜像 (`server/Dockerfile*`、`cli/Dockerfile`) **分离**：日常 `pnpm dev:docker:*` 不会触发完整发布构建。

## 与 all-in-one 镜像的关系

| 场景 | 方式 |
|------|------|
| 日常改代码 | `pnpm dev:all` 或 `pnpm dev:docker:*`（挂载源码、热重载） |
| 对齐发布物 smoke | `pnpm allinone:build && pnpm smoke:allinone` |
| 避免 | 每改一行 TypeScript 就 full `docker build` |

详见 [Docker 镜像](../operations/docker-images.md) 和 [测试策略](./testing.md)。

## 调试

| 目标 | 做法 |
|------|------|
| Node attach 本机 Server | `node --inspect $(pnpm --filter @agentops/server exec which tsx) watch src/index.ts`，或在 `server/package.json` 增加 `dev:inspect` |
| Node attach 容器 Server | dev compose `command:` 增加 `--inspect=0.0.0.0:9229`，端口映射 `9229:9229` |
| 查看 Runner 状态 | `cat .agentops-dev/credentials.json` 或 `docker compose exec runner ls /var/agentops` |
| 重置 dev 状态 | `rm -rf .agentops-dev .data && docker compose down -v` |
