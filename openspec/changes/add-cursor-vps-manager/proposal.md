## 为什么

当前仓库要启动的不是通用对话式 agent 平台，而是一个面向单用户的 Cursor CLI 管理器。第一阶段目标是在 VPS 上通过网页统一管理容器内受管的 Cursor 运行时、登录状态、关键配置和 user 级 skill，并提供可发布、可部署、可测试的交付路径。

现在就需要把范围收紧并文档化，因为登录流程、安装来源、Docker 部署、版本回写和后续桌面复用都会显著影响系统边界。如果不先固定这些约束，后续实现很容易把 Web 管理、桌面客户端和多 CLI 适配混在一起。

## 变更内容

- 新增一个面向 VPS 场景的 Cursor 管理系统方案，范围限定为单用户、单 CLI、非对话式管理。
- 支持在容器内受管目录中运行时安装和手动升级 Cursor，默认从官方在线来源安装最新版。
- 提供基于网页登录页 + 固定访问 Token 的管理入口，并支持网页引导的 Cursor 登录流程，允许用户在外部完成关键步骤后回到网页确认。
- 提供最小但可落地的账号、配置与 skill 管理能力：
  - 账号展示按 best-effort 显示已登录状态、邮箱、显示名
  - 关键已知配置项表单化编辑
  - 原始配置文件预览后保存
  - 已有 user 级 skill 的列出、查看、编辑、删除
- 规定 Phase 1 交付形态：
  - `Rust + Axum + React/Vite + SQLite`
  - 单容器部署 `core + web`
  - Docker Compose 最小示例
  - GitHub Actions 在当前分支 push 时自动构建并发布到 `ghcr.io`
  - 根目录 `VERSION` 自动递增并由 Action 回写
- 新增一组项目文档，至少覆盖：
  - `README`
  - 项目说明
  - 技术方案
  - 用户已拍板项
  - 文档列表
  - 部署与本机运行入口说明
- 明确非目标：
  - 不实现对话/session/终端托管
  - 不支持多用户、多 CLI、卸载、skill 导入
  - 不在本次变更中真正实现桌面端，仅为未来 Tauri 复用保留边界

## 功能 (Capabilities)

### 新增功能
- `cursor-runtime-management`: 管理容器内受管的 Cursor 安装、版本检测和手动升级能力。
- `cursor-account-management`: 管理网页登录令牌、Cursor 登录引导流程和当前 Cursor 用户的最小账号展示。
- `cursor-profile-management`: 管理 Cursor 的关键配置项、原始配置文件和已有 user 级 skill。
- `container-delivery`: 管理单容器部署、本机快启、Docker Compose 验收以及基于 GitHub Actions 的镜像发布与版本回写。
- `project-documentation`: 管理项目级文档体系，包括 README、项目说明、技术方案、已拍板项与文档索引。

### 修改功能

无。

## 影响

- 新增 Rust 服务端、前端单页应用和轻量 SQLite 状态存储的系统设计
- 新增 Cursor 运行时安装、登录引导、配置与 skill 管理相关 API 和文件系统操作
- 新增 Docker 镜像、Compose 示例、环境变量约定和 `ghcr.io` 发布流程
- 新增 CI/CD 版本回写逻辑与 `VERSION` 文件维护规则
- 新增项目文档目录、文档索引与核心说明文档
- 后续桌面端将复用本次定义的 React UI 和 Rust Core 边界，但不包含在本次实现内
