# agent-manager

`agent-manager` 是一个面向单用户的 Cursor CLI 管理器。Phase 1 先部署在 VPS 上，通过网页管理容器内受管的 Cursor 运行时、登录状态、关键配置和已有 user 级 skill。

当前仓库已经具备 Phase 1 的基础实现骨架：Rust 服务端、React/Vite 管理页、运行时/配置/skill 管理 API、Docker 交付文件与本机快启脚本都已落地，后续将在这些边界上继续补强真实集成细节。

## Phase 1 范围

- 只支持 `Cursor`
- 只支持单用户
- 不做对话、session 和终端托管
- 运行时安装 Cursor 到容器内受管目录
- 提供网页登录入口、Cursor 登录引导、配置管理和已有 skill 管理
- 通过 Docker 单容器部署 `core + web`
- 通过 GitHub Actions 自动发布 `ghcr.io` 镜像

## 非目标

- 多用户、多租户、RBAC
- 多 CLI 支持
- 桌面端功能实现
- skill 导入市场
- 卸载能力

## 技术方向

- `Rust + Axum`
- `React + Vite`
- `SQLite`
- 未来桌面端预留 `Tauri` 边界
- `apps/ + crates/` monorepo

## 当前文档

- `docs/index.md`: 文档索引
- `docs/project-overview.md`: 项目说明
- `docs/technical-solution.md`: 技术方案
- `docs/decisions.md`: 用户已拍板项
- `docs/run-and-deploy.md`: 本机运行与部署说明
- `openspec/changes/add-cursor-vps-manager/`: 当前 Phase 1 变更

## 快速入口

- Windows 开发快启：`scripts/dev.bat`
- Compose 验收：`scripts/compose-check.bat`
- 线上最小部署：`docker-compose.yml`
- 自动发布：`.github/workflows/release.yml`

## 最小环境变量

- `ADMIN_TOKEN`
  - 生产环境必填，用于管理页固定访问 Token
- `IMAGE_NAME`
  - 可选，用于覆盖 `docker-compose.yml` 中默认镜像名
- `IMAGE_TAG`
  - 可选，默认 `latest`

## 当前状态

当前变更已完成：

- `proposal`
- `design`
- `specs`
- `tasks`

后续实现可以从 `openspec/changes/add-cursor-vps-manager/tasks.md` 开始。
