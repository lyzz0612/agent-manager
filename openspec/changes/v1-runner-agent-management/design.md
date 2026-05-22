## 上下文

Runner 是 v1 中唯一允许在被管理机器执行命令的组件。它以 npm 包 `@lyzz0612/agentops-runner` 分发，负责登录绑定 Server、daemon 连接、检测和管理 Cursor、Codex、Claude Code。

## 目标 / 非目标

**目标：**

- 提供 Runner CLI 命令入口和 npm 分发包。
- 支持 `login` 保存 Server URL、机器身份和凭据。
- 支持 `daemon` 主动连接 Server、心跳、接收动作和上报结果。
- 提供 Agent Adapter 抽象，v1 内置 Cursor、Codex、Claude Code。
- 实现 detect、install、upgrade、doctor、uninstall。
- daemon 连接后自动执行一次 detect。
- 开发期允许通过 `AGENTOPS_HOME` 或等价变量把状态写入项目目录或容器卷。

**非目标：**

- 不在 Runner 中保存平台主状态。
- 不绕过 Server 接收 Client 直连命令。
- 不写 Web 表单配置能力。
- 不做真实 API 调用或可能计费的 Doctor。
- 不支持运行中动作取消。

## 决策

### Node.js CLI

Runner 使用 Node.js / TypeScript 实现，便于 npm 分发、spawn 子进程和与 Server / Client 共享 schema。

### Agent Adapter

每个 Agent 实现统一接口：detect、install、upgrade、doctor、uninstall。Adapter 返回统一状态对象，避免 Server 和 Client 了解具体 Agent 的安装细节。

新增 Agent 必须通过注册表接入，不在执行流程中堆叠分支。

### 官方文档优先

安装、升级和卸载命令必须来自对应 Agent 官方文档。实现任务中需要记录官方文档来源，避免凭经验写命令。

### 动作执行队列

Runner 侧按 machine + agent 串行动作，不同 Agent 可以并行。动作输出汇总为简短摘要和可入库日志。v1 不提供取消，但执行必须有超时，避免长期卡死。

### 本地状态目录

Runner 保存 Server URL、Runner 凭据、machineId 和缓存。开发期默认不写用户家目录，使用 `<repo>/.agentops-dev` 或容器卷。

## 风险 / 权衡

- 官方安装方式跨平台差异大 → Adapter 内分平台处理，并在不支持平台返回 unsupported。
- 真安装会污染环境 → 本机开发推荐 Runner 容器隔离。
- 不支持取消可能导致长时间等待 → 每个动作必须设置超时并回传失败摘要。
- 轻量 Doctor 不能证明真实 API 可用 → v1 明确不做计费或登录态真实调用。
