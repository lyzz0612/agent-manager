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
