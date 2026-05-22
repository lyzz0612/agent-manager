## 新增需求

### 需求:本机开发路径
项目必须提供 `pnpm dev` 或等价脚本启动本机开发环境，并避免开发期 Runner 默认写入用户家目录。

#### 场景:本机启动开发
- **当** 开发者运行本机开发脚本
- **那么** Server、Client 或 Runner 必须按配置启动，并将开发状态写入项目内目录或显式配置目录

### 需求:Docker Compose 开发路径
项目必须提供 Docker Compose 开发路径，用于启动 Server、Client、Runner 的容器化组合。

#### 场景:Compose 启动
- **当** 开发者运行 Compose 开发命令
- **那么** 相关服务必须启动并将 Web / API 端口映射到本机可访问地址

### 需求:运行时混搭
开发环境必须支持 Server、Client、Runner 在本机或 Docker 中混搭运行。

#### 场景:Runner 在 Docker
- **当** 开发者选择 Server 和 Client 本机运行、Runner Docker 运行
- **那么** 本机浏览器必须能够访问 Client，且管理动作必须由 Runner 容器执行

### 需求:Runner 容器隔离
Runner 容器必须使用独立状态目录或卷，禁止默认写入开发者用户家目录。

#### 场景:Runner 容器执行安装
- **当** Client 触发 Agent 安装动作
- **那么** Runner 容器必须在容器内执行安装并将状态写入容器卷

### 需求:dev-fast 热重载
Compose 开发模式必须支持挂载源码和热重载，禁止要求每次代码变更都 full docker build。

#### 场景:修改 TypeScript 源码
- **当** 开发者修改服务源码
- **那么** dev-fast 环境必须通过热重载或重启开发进程体现变更，而不是要求重新构建发布镜像

### 需求:测试分层
测试策略必须区分单元测试、Runner 集成测试和可选 E2E / smoke，并明确 mock 边界。

#### 场景:单元测试
- **当** 测试解析、状态机或 schema 逻辑
- **那么** 测试可以使用 mock

#### 场景:Runner 集成测试
- **当** 测试 Runner detect、install、doctor 或 uninstall
- **那么** 测试禁止以 mock adapter 作为主路径，并必须按平台声明 skip 条件

### 需求:all-in-one smoke
项目必须提供验证 all-in-one 镜像基本可用的 smoke 路径。

#### 场景:启动 all-in-one 镜像
- **当** 开发者或 release 验证启动 `agentops-server:<version>-allinone`
- **那么** Server、Web 和 bundled Runner 必须能在同一容器形态下完成基础连通验证

## 修改需求

## 移除需求
