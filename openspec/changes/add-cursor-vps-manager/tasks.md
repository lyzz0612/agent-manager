## 1. 文档与项目入口

- [x] 1.1 创建 `README.md`，说明项目定位、Phase 1 范围、技术栈和快速入口
- [x] 1.2 创建 `docs/index.md`，列出当前项目文档及其用途
- [x] 1.3 创建 `docs/project-overview.md`，整理项目目标、范围、非目标和 Phase 1 边界
- [x] 1.4 创建 `docs/technical-solution.md`，整理系统架构、模块边界、部署形态和未来桌面复用边界
- [x] 1.5 创建 `docs/decisions.md`，沉淀已拍板项和当前约束
- [x] 1.6 创建 `docs/run-and-deploy.md`，覆盖本机快启、Compose 验收、环境变量和基础部署说明

## 2. 仓库骨架与基础运行形态

- [x] 2.1 建立 `apps/ + crates/` monorepo 目录结构，并为未来 `desktop` 保留最小占位
- [x] 2.2 初始化 Rust 服务端骨架、React/Vite 前端骨架和共享配置
- [x] 2.3 配置由 Axum 托管前端静态产物的单容器运行形态
- [x] 2.4 引入根目录 `VERSION` 文件，并约定应用读取方式

## 3. 管理入口与 Cursor 账号能力

- [x] 3.1 实现管理页 Token 登录页与服务端校验逻辑
- [x] 3.2 支持生产环境显式 Token 和开发态默认 Token 的配置策略
- [x] 3.3 实现网页引导式 Cursor 登录流程骨架，并支持外部完成关键步骤后回到网页确认
- [x] 3.4 实现 Cursor 当前登录状态检测，以及邮箱/显示名的 best-effort 展示

## 4. Cursor 运行时与 Profile 管理

- [x] 4.1 实现容器内受管目录中的 Cursor 安装状态与版本检测
- [x] 4.2 实现从官方在线来源安装最新版 Cursor 的手动安装流程
- [x] 4.3 实现手动升级当前受管 Cursor 的流程
- [x] 4.4 实现已知关键配置项的表单化编辑
- [x] 4.5 实现原始配置文件的查看、编辑、预览后保存
- [x] 4.6 实现已有 user 级 skill 的列出、查看、编辑和删除

## 5. 交付与发布链路

- [x] 5.1 编写单容器 Dockerfile，使其同时包含服务端和前端产物
- [x] 5.2 提供默认最简的 `docker compose` 示例，使用 `latest` 且不强制挂载
- [x] 5.3 建立当前分支 push 触发的 GitHub Actions 构建与发布流程
- [x] 5.4 实现 `VERSION` 自动递增、回写与 bot actor guard 防重触发逻辑
- [x] 5.5 发布 `linux/amd64` 镜像到 `ghcr.io`，并同步更新 `latest`

## 6. 验证与收尾

- [x] 6.1 提供 Windows 本机快启入口，便于开发态验证
- [x] 6.2 提供 Compose 验收入口，验证与线上形态一致的启动流程
- [x] 6.3 对 README 与 `docs/` 中的命令、路径和环境变量进行一致性校对
- [x] 6.4 评估后续是否拆分出独立的桌面端变更和更细粒度的 Cursor 集成变更
