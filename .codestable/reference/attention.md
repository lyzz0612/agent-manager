# Attention

本文件是 CodeStable 技能启动必读的项目注意事项入口。所有 CodeStable 子技能开始工作前必须读取它。

## 项目碎片知识

<!-- cs-note managed: 用 cs-note 维护，新条目按下面分节追加 -->

### 编译与构建

- Monorepo：`apps/`（web / server / desktop 占位）+ `crates/`
- 技术栈：`Rust + Axum`、`React + Vite`、`SQLite`

### 运行与本地起服务

- **开发态快启**（一级入口）：`scripts/dev.bat` — 启动后端 + 前端、注入开发态默认 Token、指向受管目录或容器环境
- **Compose 验收**（一级入口）：`docker-compose.yml` + `scripts/compose-check.bat` — 验证单容器、静态资源托管、Token 登录、Cursor 运行时页
- 开发态默认接真实 Cursor 运行时；尽量支持 Docker 内运行以减少宿主机污染
- 本机入口可先偏 Windows（`.bat`）
- **改 Rust 后端后需重启 `scripts/dev.bat`**：若 `agent-manager-server` 进程仍在跑，`cargo build` 可能因 exe 被占用失败；即使只改了前端，未重启时 `:3000` 仍是旧 API（验收/联调会误判为未实现）

### 测试

- Compose 验收脚本：`scripts/compose-check.bat`（贴近线上部署形态的集成验证）

### 命令与脚本陷阱

- 开发态允许默认 Token；**生产环境** `ADMIN_TOKEN` 未设置则应用启动失败

### 路径与目录约定

- 根目录 `VERSION` 为唯一权威版本源
- Cursor 运行时位于容器内受管目录，镜像中不预装

### 环境变量与凭证

| 变量 | 说明 |
|---|---|
| `ADMIN_TOKEN` | 管理页固定访问 Token；生产必填 |
| `IMAGE_NAME` | 可选，覆盖 Compose 默认镜像名 |
| `IMAGE_TAG` | 可选，默认 `latest` |
| `PORT` | 可选，Compose 对外端口，默认 `3000` |

### 其他

- 线上发布：`.github/workflows/release.yml` → `ghcr.io`，架构 `linux/amd64`
- 当前分支 push 触发发布；普通提交生成 `X.Y.Z` 并更新 `latest`
- 官方 Compose **默认不带挂载**，数据不保证持久化；需自行添加 mount
- 反向代理与 HTTPS 由外层处理
