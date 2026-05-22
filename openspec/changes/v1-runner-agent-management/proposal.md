## 为什么

v1 的真实价值来自被管理机器上的 Runner 能够检测、安装、升级、卸载和诊断 Cursor、Codex、Claude Code。Runner 必须承担本机执行边界，避免 Server 或 Client 直接操作用户机器，同时让开发测试可以在容器内隔离最容易污染环境的部分。

## 变更内容

- 新增 npm 分发的 Runner CLI：`@lyzz0612/agentops-runner`。
- 新增 `login` 流程，使用 Server 地址和单 Token 绑定机器并保存本地凭据。
- 新增 `daemon` 模式，主动连接 Server、上报机器信息、接收管理动作并回传结果。
- 新增 Runner 本地状态目录，开发期默认不写用户家目录。
- 新增 Agent Adapter 抽象和注册表，v1 内置 Cursor、Codex、Claude Code。
- 新增 detect / install / upgrade / doctor / uninstall 管理动作实现。
- 新增 daemon 连接时自动 detect，一次同步当前 Agent 状态。
- 新增轻量 Doctor：PATH、版本、关键配置文件、认证形态和官方认可的只读 probe。
- 新增动作并发规则：不同 Agent 可并行，同一 Agent 串行；v1 不支持取消。
- 实现安装 / 升级 / 卸载时必须按官方文档，不在 Dockerfile 中预装 Agent。

## 功能 (Capabilities)

### 新增功能

- `runner-agent-management`: Runner CLI、登录绑定、daemon 连接、Agent Adapter、detect/install/upgrade/uninstall/doctor 和动作执行队列。

### 修改功能

## 影响

- 新增 Runner 包、CLI 命令、daemon 进程和本地状态管理。
- 新增 per-agent adapter、测试用例和官方文档引用。
- 新增 Runner 与 Server 的协议 DTO。
- 影响本地开发、Docker dev 和 CI 集成测试方式。
