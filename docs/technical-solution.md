# 技术方案

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
  host-fs/
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

## 6. 配置与 Skill 管理

### 6.1 配置管理

双轨模式：

- 已知关键字段：表单化编辑
- 其他配置：原始文件编辑

原始文件保存前先预览，不做自动备份。

### 6.2 Skill 管理

Phase 1 只管理已有 skill：

- 列出
- 查看
- 编辑
- 删除

编辑采用原始文件方式，删除采用普通二次确认。

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

本项目采用“文档先行”策略：

- 仓库层 `docs/` 负责长期项目文档
- `openspec/changes/...` 负责需求、设计和任务拆解
- 先把边界和决策写清楚，再推进实现

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
