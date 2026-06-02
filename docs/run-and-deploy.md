# 本机运行与部署说明

本文档记录 `agent-manager` Phase 1 的运行和部署入口。当前仓库已经提供了基础脚本和交付文件，但由于实现仍在推进，部分能力仍是骨架版。

## 1. 运行形态

Phase 1 同时支持两类入口：

- 开发态快启：用于频繁改动和本机验证
- `docker compose` 验收：用于贴近线上部署形态的验证

这两类入口都应被视为一级入口。

## 2. 开发态快启

当前已经拍板的约束：

- 开发态默认接真实 Cursor 运行时
- 同时希望尽量支持在 Docker 中运行，减少对宿主机的影响
- 开发态允许默认 Token
- 本机入口可以先偏 Windows，允许使用 `.bat`

### 当前开发入口

- `scripts/dev.bat`

其职责包括：

- 启动后端开发服务
- 启动前端开发服务
- 注入开发态默认 Token
- 指向开发态受管目录或容器环境

## 3. Compose 验收

官方 Compose 示例的预期约束：

- 默认只包含应用容器
- 默认镜像标签使用 `latest`
- 默认不附带持久化挂载
- 反向代理和 HTTPS 由外层处理

### 当前 Compose 入口

- `docker-compose.yml`
- `scripts/compose-check.bat`

用于验证：

- 单容器是否可运行
- 前端静态资源是否由服务端正确托管
- 管理页 Token 登录是否可工作
- Cursor 运行时安装和状态页是否可访问

## 4. 线上部署

当前约定的线上部署方式：

- 通过 `.github/workflows/release.yml` 自动构建 Docker image
- 发布到 `ghcr.io`
- 目标架构为 `linux/amd64`
- 使用者在 VPS 上拉取镜像并自行决定是否添加挂载

## 5. 环境变量

当前至少需要以下环境变量约束：

- `ADMIN_TOKEN`
  - 管理页固定访问 Token
  - 生产环境必须显式传入
  - 未设置则应用启动失败
- `IMAGE_NAME`
  - 可选，用于覆盖 `docker-compose.yml` 中的默认镜像名
- `IMAGE_TAG`
  - 可选，默认是 `latest`
- `PORT`
  - 可选，用于覆盖 `docker-compose.yml` 的对外端口，默认 `3000`

后续如新增更多环境变量，应同步更新本文件和 `README.md`。

## 6. 版本与镜像

当前已确定：

- 当前分支 push 会触发发布流程
- 普通提交也生成新的 `X.Y.Z`
- 同时更新 `latest`
- 根目录 `VERSION` 为唯一权威版本源

## 7. 持久化说明

当前官方 Compose 示例默认不带挂载，因此默认运行形态不保证数据持久化。  
如需持久化 Cursor 运行时、配置或应用状态，使用者需要自行添加 mount。
