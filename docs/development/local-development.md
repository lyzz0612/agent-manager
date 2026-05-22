# 本地开发

## 原则

| 原则 | 说明 |
|------|------|
| 不污染本机 | 主要指**开发阶段**；受管机上的 agent 安装仍是产品能力 |
| 污染主要来源 | **`agentops-runner`**（检测、安装、写配置）；Server 与 Web Client 在本机跑通常可接受 |
| 两条等价路径 | **`pnpm dev`** 与 **Docker Compose** 均为官方支持，文档并列 |
| 可混搭 | Server / Client / Runner 各自可选在本机或容器内运行 |

Agent（Cursor、Codex、Claude Code）的**安装与升级**一律由 **`@lyzz0612/agentops-runner`** 执行；Docker 镜像**不预装**这些 agent。

## 运行时混搭（规划）

通过环境变量或 Compose profile 选择（具体文件名在实现阶段确定），例如：

| 变量（示例） | 值 | 含义 |
|--------------|-----|------|
| `SERVER_RUNTIME` | `local` / `docker` | Server 进程跑在哪 |
| `CLIENT_RUNTIME` | `local` / `docker` | Web 开发服务器或静态资源 |
| `RUNNER_RUNTIME` | `local` / `docker` | Runner daemon 跑在哪 |

### 推荐组合

```text
日常较干净（推荐）
  Server：本机
  Client：本机
  Runner：Docker
  → 浏览器 http://localhost:<port>；安装动作在容器内执行

全在本机
  三者本机
  → 最快；Runner 状态建议 AGENTOPS_HOME=<repo>/.agentops-dev

全在容器
  docker compose up
  → 与本机隔离；适合对齐 all-in-one 行为
```

## 本机路径

| 项 | 约定 |
|----|------|
| Runner 状态（dev） | 默认 `<repo>/.agentops-dev`（gitignore），勿默认写 `~/.agentops` |
| Server 数据（dev） | 默认 `<repo>/.data/server` 或由 `AGENTOPS_SERVER_DATA` 指定 |
| 全局 CLI | 开发期**避免** `npm install -g`；使用 `pnpm exec` / workspace 脚本 |

## 浏览器访问

无论 Runner 是否在容器内，**在本机浏览器**打开映射端口即可，例如：

```text
http://localhost:8080
```

Compose 需将容器内 Web/API 端口映射到主机（如 `8080:8080`）。Client 使用 Vite HMR 时可能额外映射前端 dev 端口。

## 与 all-inone 镜像的关系

| 场景 | 方式 |
|------|------|
| 日常改代码 | `pnpm dev` 和/或 Compose **dev-fast**（挂载源码、热重载） |
| 对齐发布物 smoke | 本地或 CI 构建 `agentops-server:<ver>-allinone` 后 `docker run` |
| 避免 | 每改一行 TypeScript 就 full `docker build` |

详见 [Docker 镜像](../operations/docker-images.md)。

## 实现阶段待补

- `compose.yml` / `compose.override.yml` 与 profile 列表
- `pnpm dev` 启动矩阵（读 `SERVER_RUNTIME` 等）
- VS Code / Cursor attach 容器内 Node 调试说明
