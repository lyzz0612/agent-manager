# v2：完善多机器与管理能力

## 版本目标

v2 的目标是在 v1 三层框架之上，完善多机器、多 agent 配置和管理动作体系，让产品从「能管理」走向「好管理」。

这一版仍然以管理为主，不进入 agent 对话和任务执行。

## 核心能力

### 多机器管理

- 支持多台机器注册。
- 支持机器在线、离线、异常状态。
- 支持机器名称、标签和备注。
- 支持按机器筛选 agent 状态。
- 支持查看每台机器的系统、shell、Node、Git 等环境摘要。

### Agent 管理

- 完善 Cursor、Codex、Claude Code 的检测规则。
- 支持更完整的安装、升级、卸载、修复动作。
- 支持展示配置文件位置。
- 支持展示配置完整性。
- 支持 agent 级别 doctor。
- 支持跨机器对比 agent 版本和状态。

### 配置管理

- 引入 agent profile。
- 支持默认模型、权限模式、MCP 配置等管理项。
- 支持配置下发。
- 支持配置变更记录。
- 支持配置检查和修复建议。

### 管理动作

- 动作具备清晰状态流转。
- 支持动作重试。
- 支持动作取消。
- 支持动作日志查看。
- 支持失败原因归类。
- 支持批量检测。
- 支持批量升级或批量修复。

### 安全与审计

- 记录关键管理操作。
- 区分普通管理动作和高风险动作。
- 对高风险动作增加确认。
- 完善 runner 认证和机器解绑。
- 完善敏感配置脱敏展示。

## 数据模型

v2 在 v1 基础上强化：

```text
Machine
MachineTag
RunnerConnection
AgentProfile
AgentConfigVersion
ManagementAction
ActionAttempt
AuditLog
```

## 交付形态

- 更完整的机器管理界面。
- 更完整的 agent 管理界面。
- 更完整的配置管理界面。
- 更稳定的 Runner daemon。
- 更可读的动作日志和审计记录。

## 验收口径

- 用户可以同时管理多台机器。
- 用户可以清楚看到每台机器上的 agent 状态差异。
- 用户可以对单台或多台机器执行管理动作。
- 用户可以查看动作历史和失败原因。
- 用户可以通过 profile 管理常见配置。
- 用户可以安全地解绑机器或撤销 runner 凭据。

## 范围边界

v2 不包含：

- Agent 对话。
- 让 agent 执行开发任务。
- Workspace 生命周期。
- Repo clone 和 worktree 管理。
- 实时 agent session。
- Tool call 展示。
- Permission request 审批流。
- 多人同时协作观看 session。

