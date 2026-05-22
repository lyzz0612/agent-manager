## 上下文

开发阶段需要快速迭代，同时避免 Runner 的真实检测、安装、升级和配置读取污染开发机。既要支持 `pnpm dev` 快速本机运行，也要支持 Docker Compose 隔离 Runner 和对齐 all-in-one 镜像行为。

## 目标 / 非目标

**目标：**

- 提供本机 `pnpm dev` 和 Docker Compose 两条开发路径。
- 支持 Server / Client / Runner 本机与容器混搭。
- 推荐 Server + Client 本机、Runner Docker 的日常开发组合。
- 提供 dev-fast Compose，挂载源码并支持热重载。
- 约定开发期状态目录，Runner 默认不写用户家目录。
- 提供单元、集成、E2E / smoke 的测试分层和 mock 边界。
- 支持 all-in-one 镜像本地 smoke 验证。

**非目标：**

- 不要求 CI 测试在 Docker 中运行。
- 不在 Docker 镜像中预装 Cursor、Codex、Claude Code。
- 不要求每次改代码都 full docker build。
- 不提供生产级备份、监控或多实例部署方案。

## 决策

### 本机与 Docker 并列支持

`pnpm dev` 是最快的开发路径，Compose 是隔离和环境对齐路径。两者都作为官方开发方式，而不是一个替代另一个。

### 运行时混搭

通过环境变量、脚本参数或 Compose profile 选择 Server、Client、Runner 的运行位置。推荐默认是 Server / Client 本机，Runner 容器。

### Runner 容器隔离

Runner 是最可能污染本机的组件。Runner 容器使用独立卷保存状态，并在容器内执行真实 install / doctor / uninstall。用户本机浏览器仍访问映射端口。

### dev-fast 优先

日常 Compose 开发挂载源码、复用 pnpm store 或 node_modules 缓存，并启用热重载。full docker build 只用于发布镜像和 smoke。

### 测试分层

单元测试可以 mock；runner 集成测试不以 mock adapter 为主路径；CI 在 GitHub Actions 上直接运行测试，不再包 Docker。E2E / smoke 用于验证 Server + Client + Runner 闭环和 all-in-one 镜像。

## 风险 / 权衡

- Docker 内安装 Agent 可能与真实宿主机差异较大 → Runner 集成测试按平台明确 skip 条件，并保留真实机器手动验证路径。
- 混搭模式增加脚本复杂度 → 用少量 profile 和环境变量控制，不做过多排列组合。
- dev-fast 与 release 镜像不完全相同 → 增加 all-in-one smoke 验证发布形态。
