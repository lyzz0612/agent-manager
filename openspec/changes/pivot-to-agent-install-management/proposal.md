## 为什么

Paseo 已经把“从任意客户端驱动本机 coding agent”的对话和编排体验做成了清晰产品形态，本项目不应继续重复建设后续对话、session 和任务执行需求。当前更有价值的方向是成为 agent 安装、管理和配置层，帮助用户把 Cursor、Codex、Claude Code、ACP agent、Paseo 类工具以及未来同类项目快速装好、登录好、配好并保持可维护。

## 变更内容

- **BREAKING**: 后续版本路线移除以 Web/App 对话、任务执行、session、agent thinking、tool call 展示和权限审批为核心的 v3 方向。
- **BREAKING**: 产品定位从 “AgentOps Console” 收敛为 “Agent / Provider Manager”，默认使用 Paseo 或同类工具承担跨端对话、远程驱动和 agent 编排体验。
- 新增 provider catalog 概念，统一描述可安装、可检测、可配置、可登录或可委托给外部 orchestrator 的 agent/provider。
- 新增 agent 登录与授权管理能力，用于引导用户完成 CLI 登录、OAuth/device flow、token 检查或只读认证探测。
- 新增配置管理能力，覆盖模型、`base_url`、API key 引用、权限模式、MCP server、skill、profile 和环境变量等常见 agent 配置项。
- 新增“orchestrator 工具”支持，把 Paseo 类工具作为可安装和可管理对象，允许本项目安装、检测、启动、配置并展示其连接方式。
- 保留 Runner 作为本机执行边界，继续负责检测、安装、升级、卸载、doctor、配置写入和本机状态上报。

## 功能 (Capabilities)

### 新增功能

- `provider-catalog`: 统一描述内置 agent、ACP agent、自定义 agent 和 Paseo 类 orchestrator 工具的安装源、能力、配置入口和支持动作。
- `agent-auth-config-management`: 管理 agent 登录、授权状态、模型提供商配置、`base_url`、MCP server、skill、profile、敏感值引用和配置写入流程。
- `orchestrator-tool-management`: 支持安装、检测、启动和配置 Paseo 类工具，并把外部工具的连接方式和接管边界展示给用户。

### 修改功能

- `runner-agent-management`: 从只管理少数内置 agent 的 detect/install/upgrade/uninstall/doctor，扩展为面向 catalog provider 的通用安装、登录、配置和 orchestrator 管理执行层。
- `server-control-plane`: 从机器和管理动作调度，扩展为 provider catalog、配置版本、授权状态和 orchestrator 状态的控制面。
- `client-management-ui`: 从机器/agent 基础管理界面，调整为以 provider catalog、安装向导、登录授权、配置 profile、MCP/skill 管理和 orchestrator 入口为主。

## 影响

- 影响 `docs/roadmap/version-3-conversation.md`、`docs/roadmap/README.md`、产品定位文档和 README，需要删除或改写后续对话路线。
- 影响 Runner agent adapter、管理动作协议、Server API/存储模型、Client 页面信息架构和配置脱敏规则。
- 需要新增 provider catalog 数据结构、配置 schema、敏感值处理约定、配置 diff/backup/rollback 策略和 per-provider 安全边界。
- 需要把 Paseo 文档作为产品参考：本项目不复制其对话编排能力，而是支持安装、配置和启动 Paseo 类工具，并清楚标注外部工具接管的体验边界。
