## 上下文

当前规划把 v1/v2 放在安装管理和多机器管理上，v3 计划进入对话、任务执行、session 和实时 agent 输出。用户现在明确要求干掉后续对话需求，并把使用体验转向 Paseo 文档代表的形态：Paseo 或同类工具负责跨端驱动、对话和编排，本项目负责安装、管理和配置各种 agent 及 orchestrator。

现有代码和规格已经形成三层边界：

- Client 提供 Web/App 管理界面。
- Server 维护机器、状态、动作和审计。
- Runner 安装在本机，负责本机 agent 检测、安装、配置和动作执行。

这个边界仍然成立，但领域模型需要从少量内置 agent 扩展为 provider catalog，并补齐登录授权、模型端点、MCP/skill 和 Paseo 类工具管理。

## 目标 / 非目标

**目标：**

- 重新定义产品主线：本项目是 agent/provider 安装、管理和配置工具，而不是 agent 对话控制台。
- 建立 provider catalog，用一套 schema 描述内置 agent、ACP agent、自定义 agent 和 orchestrator 工具。
- 支持 agent 登录授权状态管理，以及模型、`base_url`、MCP server、skill、profile 等配置管理。
- 支持把 Paseo 类工具作为一等管理对象安装、检测、启动、配置并展示连接方式。
- 保留 Runner 作为唯一写入本机配置、启动本机进程和执行安装命令的边界。

**非目标：**

- 不实现 Paseo 的跨端对话、agent run/attach/send/logs/wait 等编排能力。
- 不实现 workspace、task、session、permission request 审批流或 tool call 实时展示。
- 不保存 API key 明文，不提供云端密钥托管。
- 不把所有 agent 配置抽象成完全通用的无限表单；只抽象稳定公共能力，provider 特有项通过 schema 扩展。

## 决策

### 1. 使用 Provider Catalog 取代硬编码 Agent 列表

Provider catalog 是 Server 和 Client 的展示契约，也是 Runner adapter 的执行契约。每个 catalog entry 至少包含：

- `providerId`、名称、分类和描述。
- 类型：`agent`、`acp-agent`、`orchestrator`。
- 支持平台、安装源、检测规则和版本读取规则。
- 支持动作：`detect`、`install`、`upgrade`、`uninstall`、`doctor`、`login`、`configure`、`start`、`stop`。
- 配置 schema、敏感字段声明、MCP/skill 能力声明。
- 官方文档 URL 和安全注意事项。

替代方案是继续为 Cursor、Codex、Claude Code 添加分支。它在 v1 可行，但无法支撑 ACP catalog、Paseo 类工具和用户自定义 provider。

### 2. Runner 负责执行，Server 负责版本化意图

Server 存储 catalog、机器状态、配置 profile、配置版本、授权状态摘要和管理动作。Runner 接收动作后在本机执行安装、登录引导、配置写入、备份和 doctor。

这样做避免 Server 直接读写用户机器，也避免 Client 承担平台差异。配置写入必须由 Runner 完成，并在写入前生成可回滚备份。

### 3. 登录授权只管理状态和引导，不接管真实凭据

不同 agent 的认证方式差异很大：浏览器登录、device flow、API key、本地 CLI session、OAuth 缓存等。本项目只统一管理：

- 认证状态摘要。
- 登录命令或引导步骤。
- 只读 probe 或本地配置存在性检查。
- 敏感值引用和脱敏展示。

真实 token/API key 禁止明文上传到 Server。需要写入本机配置时，Runner 必须使用本机安全输入、环境变量引用或操作系统密钥存储引用。

### 4. Orchestrator 工具与普通 Agent 分开建模

Paseo 类工具不是普通 coding agent，而是管理和驱动其他 agent 的上层 orchestrator。catalog 中用 `orchestrator` 类型区分，并支持 `start`、`stop`、`pair`、`connectionInfo` 等动作或状态。

这能清楚表达边界：本项目可以安装、配置和启动 Paseo 类工具，但用户进入对话、远程控制和多 agent 编排时应跳转或复制连接信息到外部工具。

### 5. Client 信息架构从机器优先调整为 Provider 优先

机器仍然重要，但主入口应更贴近用户目标：

- Provider Catalog：浏览可安装/可管理对象。
- Installed Providers：按机器查看安装状态。
- Profiles：管理模型、`base_url`、MCP、skill 和权限模式配置。
- Orchestrators：查看 Paseo 类工具状态、启动方式和连接信息。

机器详情保留为诊断视角，而不是唯一入口。

## 风险 / 权衡

- Catalog schema 过度泛化可能变得难以实现 → 首批只覆盖安装、检测、登录、配置和 doctor 的稳定字段，provider 特有配置放入扩展 schema。
- 配置写入可能破坏用户已有 agent 配置 → Runner 写入前必须备份，Client 必须展示 diff 摘要，高风险写入必须二次确认。
- 登录授权探测可能触发真实 API 或计费行为 → doctor/login status 默认只能执行官方认可的只读本地检查或明确无计费 probe。
- Paseo 类工具的能力变化较快 → catalog entry 必须记录官方文档 URL 和版本范围，安装/配置逻辑按文档实现，不猜测私有行为。
- Provider 优先入口可能弱化多机器管理 → Client 保留机器视角，并在 provider 详情中展示每台机器的状态矩阵。

## 迁移计划

1. 更新 roadmap 和产品文档，删除 v3 conversation/session 主线，新增 agent/provider management 主线。
2. 引入 provider catalog schema 和首批 catalog entries：Cursor、Codex、Claude Code、Paseo。
3. 扩展 Runner adapter 注册表，使 adapter 从 catalog entry 获取安装、检测、配置和登录能力。
4. 扩展 Server API 和协议 DTO，加入 provider catalog、auth status、config profile、config version 和 orchestrator status。
5. 调整 Client 页面，从机器详情驱动改为 catalog/profile/orchestrator 驱动。
6. 为配置写入增加备份、diff、脱敏和回滚路径。
7. 移除或归档 v3 conversation 文档，避免后续实现继续沿旧方向推进。

回滚策略：保留现有 v1 install/detect/doctor/uninstall 基础动作；如果 catalog/config 扩展无法一次完成，先让内置 provider 通过 catalog 兼容现有动作，再逐步开放配置写入和 orchestrator 管理。

## 待定问题

- 自定义 provider catalog 是否允许用户从 URL 导入，还是先只支持本地文件导入。
- 敏感值引用优先使用 OS keychain、环境变量，还是仅做“用户本机手动登录”引导。
- MCP/skill 配置是否由本项目直接写入各 agent 配置文件，还是生成补丁让用户确认应用。
- Paseo 类工具首批只支持安装和连接信息展示，还是同时支持 daemon 生命周期管理。
