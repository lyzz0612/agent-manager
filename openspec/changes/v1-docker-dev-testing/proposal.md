## 为什么

v1 开发阶段最容易污染本机环境的是 Runner 对 Agent 的检测、安装、升级和配置读写。需要把本机开发、Docker Compose、Runner 容器和测试策略作为独立变更设计清楚，保证既能快速迭代，又能在需要时真实触发安装管理流程。

## 变更内容

- 新增本机开发和 Docker Compose 并列支持的开发方案。
- 支持 Server / Client / Runner 在本机或 Docker 中混搭运行。
- 新增推荐组合：Server + Client 本机运行，Runner 在 Docker 中运行，以隔离 Agent 安装污染。
- 新增全容器模式，用于对齐 `agentops-server:<version>-allinone` 行为。
- 新增开发期状态目录约定，Runner 默认写入 `<repo>/.agentops-dev` 或容器卷，不写用户家目录。
- 新增 dev-fast Compose 模式，挂载源码并支持热重载，避免每次改代码都 full docker build。
- 新增测试分层：单元测试可 mock；runner 集成测试不以 mock adapter 为主路径；CI 在 GitHub Actions bare-metal runner 上直接跑测试。
- 新增本地 smoke / integration 脚本规划，供本机和 CI 复用。

## 功能 (Capabilities)

### 新增功能

- `docker-dev-testing`: 本机开发、Docker Compose dev-fast、运行时混搭、Runner 容器隔离、测试分层和 all-in-one smoke 验证。

### 修改功能

## 影响

- 新增 Compose 文件、开发脚本、环境变量和 gitignore 状态目录。
- 新增本地开发文档、测试脚本和 Runner 集成测试入口。
- 影响 Runner 本地状态路径、Docker 卷、端口映射和调试方式。
- 与 CI/release workflow 共享测试脚本，但不把 CI 测试包进 Docker。
