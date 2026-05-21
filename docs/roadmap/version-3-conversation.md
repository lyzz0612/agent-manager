# v3：对话、任务执行与实时反馈

## 版本目标

v3 的目标是在已有安装管理和多机器管理基础上，开始让用户通过 Web/App 与 agent 对话，并让 agent 在指定环境中执行任务。

这一版把产品从「Agent Manager」推进到「AgentOps Console」。

## 核心能力

### Workspace

- 引入 workspace 概念。
- 支持将 workspace 绑定到机器。
- 支持选择本地目录或远程目录。
- 支持 workspace readiness 检查。
- 支持为 workspace 选择 agent profile。

### Task

- 支持创建任务。
- 支持选择机器、workspace 和 agent。
- 支持任务状态流转。
- 支持停止、重试和归档任务。
- 支持记录任务输入、状态和结果摘要。

### Session

- 支持 agent session。
- 支持发送用户输入。
- 支持接收 agent 输出。
- 支持恢复历史 session。
- 支持 session 与 task 关联。

### 实时反馈

- 支持实时日志。
- 支持 agent thinking 状态。
- 支持 tool call 状态。
- 支持任务进度事件。
- 支持任务完成、失败、取消通知。
- 支持 Web 和未来 App 消费同一套事件流。

### 权限交互

- 支持 agent 权限请求。
- 支持用户在 Web/App 上批准或拒绝。
- 支持记录审批结果。
- 支持高风险操作提示。

### 产物记录

- 支持记录任务结果。
- 支持记录关键日志。
- 支持记录生成的文件、补丁或链接摘要。
- 支持在任务详情页回看执行过程。

## 数据模型

v3 在前两版基础上新增：

```text
Workspace
Checkout
Task
Session
SessionEvent
PermissionRequest
Artifact
```

## 协议能力

v3 需要引入统一 agent event protocol。

首批事件类型包括：

```text
task.started
task.updated
task.finished
session.started
session.message
session.thinking
session.tool_call
session.permission_requested
session.error
session.finished
```

不同 agent 的私有输出需要在 Runner 侧转换为统一事件。

## 交付形态

- Workspace 管理界面。
- Task 创建和详情界面。
- Session 对话界面。
- 实时事件流。
- 权限审批交互。
- Agent adapter 事件标准化。

## 验收口径

- 用户可以选择机器和 workspace 创建任务。
- 用户可以选择 Cursor、Codex 或 Claude Code 执行任务。
- 用户可以在 Web 上看到实时反馈。
- 用户可以处理权限请求。
- 用户可以停止或重试任务。
- 用户可以查看任务历史和执行结果。

## 范围边界

v3 不包含：

- 完整云端 IDE。
- 大规模多人协同编辑。
- 复杂工作流编排引擎。
- 企业级策略中心。
- 大规模 artifact 存储系统。
- Hosted SaaS 多租户商业化能力。

