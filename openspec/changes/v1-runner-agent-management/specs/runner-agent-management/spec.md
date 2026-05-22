## 新增需求

### 需求:Runner CLI 包
Runner 必须以 npm 包 `@lyzz0612/agentops-runner` 分发，并提供实现阶段约定的全局命令入口。

#### 场景:安装 CLI
- **当** 用户安装 Runner npm 包
- **那么** 系统必须提供可执行的 Runner 命令入口

### 需求:登录绑定
Runner 必须支持使用 Server URL 和 Token 登录，并保存机器身份和必要凭据。

#### 场景:首次登录
- **当** 用户执行 Runner 登录并提供有效 Server URL 与 Token
- **那么** Runner 必须向 Server 注册或绑定机器并保存本地凭据

### 需求:Daemon 连接
Runner 必须支持 daemon 模式主动连接 Server、维持心跳、接收动作并上报结果。

#### 场景:Daemon 启动
- **当** Runner daemon 使用有效凭据连接 Server
- **那么** Runner 必须上报机器信息并等待 Server 下发动作

### 需求:连接后自动检测
Runner daemon 连接成功后必须自动执行一次 detect，并上报所有内置 Agent 状态。

#### 场景:连接后 detect
- **当** Runner daemon 成功连接 Server
- **那么** Runner 必须检测 Cursor、Codex、Claude Code 并上报结果

### 需求:Agent Adapter
Runner 必须通过可扩展 Agent Adapter 注册表实现 Agent 能力，禁止在通用执行流程中散落 Agent 特殊分支。

#### 场景:注册内置 Agent
- **当** Runner 启动
- **那么** Runner 必须注册 Cursor、Codex、Claude Code 的 Adapter

### 需求:Agent 检测
Runner 必须检测 Agent 的安装状态、版本、可执行路径、PATH 状态、配置文件存在性和认证形态。

#### 场景:检测已安装 Agent
- **当** Agent 可执行文件存在并可读取版本
- **那么** Runner 必须上报 installed 状态、版本和路径

### 需求:Agent 安装升级卸载
Runner 必须支持 Cursor、Codex、Claude Code 的 install、upgrade 和 uninstall 动作，并必须遵循对应官方文档。

#### 场景:安装完成
- **当** Runner 成功完成 Agent 安装动作
- **那么** Runner 必须重新检测该 Agent 并上报最新状态

### 需求:轻量 Doctor
Runner 必须执行轻量 Doctor，检查 PATH、版本、关键配置文件、认证形态和官方认可的只读 probe。

#### 场景:Doctor 执行
- **当** Runner 收到 doctor 动作
- **那么** Runner 必须返回通过、警告或失败的 Doctor 结果，且禁止执行真实 API 调用或计费操作

### 需求:动作并发与超时
Runner 必须允许不同 Agent 动作并行，同一 Agent 动作串行，并为动作设置超时。

#### 场景:同一 Agent 动作冲突
- **当** 同一 Agent 已有运行中动作
- **那么** Runner 必须等待前一个动作完成后再执行后续动作

#### 场景:动作超时
- **当** 动作超过实现约定的超时时间
- **那么** Runner 必须将动作标记为失败并回传简短错误摘要

## 修改需求

## 移除需求
