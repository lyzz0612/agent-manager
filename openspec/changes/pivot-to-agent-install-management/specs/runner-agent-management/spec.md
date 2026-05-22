## 新增需求

### 需求:Provider Catalog 执行
Runner 必须能够加载 Server 下发的 provider catalog entry，并根据 entry 声明的能力执行 provider 管理动作。

#### 场景:执行 catalog provider 动作
- **当** Runner 收到某个 provider 的管理动作
- **那么** Runner 必须验证该 provider 在 catalog 中存在且声明支持该动作后再执行

#### 场景:拒绝未知 provider
- **当** Runner 收到 catalog 中不存在的 providerId
- **那么** Runner 必须拒绝动作并回传未知 provider 错误

### 需求:Provider 配置写入
Runner 必须负责在本机写入 provider 配置，且必须在写入前生成备份和变更摘要。

#### 场景:写入配置
- **当** Runner 收到 configure 动作
- **那么** Runner 必须根据 provider catalog 的配置 schema 写入本机配置，并上报配置版本、备份引用和结果摘要

### 需求:Provider 登录引导
Runner 必须支持 provider login 动作，用于执行或展示本机登录授权步骤。

#### 场景:执行登录引导
- **当** Runner 收到 login 动作
- **那么** Runner 必须按 provider adapter 返回登录方式、用户下一步和登录后检测结果

## 修改需求

### 需求:Agent Adapter
Runner 必须通过可扩展 Provider Adapter 注册表实现 Agent、ACP agent 和 orchestrator 能力，禁止在通用执行流程中散落 provider 特殊分支。

#### 场景:注册内置 Provider
- **当** Runner 启动
- **那么** Runner 必须注册 Cursor、Codex、Claude Code 和 Paseo 类 orchestrator 的 Adapter

#### 场景:注册 catalog provider
- **当** Server 下发 catalog 中声明的 provider
- **那么** Runner 必须将 provider 映射到对应 adapter，并暴露其声明支持的管理动作

### 需求:Agent 检测
Runner 必须检测 Provider 的安装状态、版本、可执行路径、PATH 状态、配置文件存在性、认证状态、MCP/skill 配置摘要和运行状态。

#### 场景:检测已安装 Provider
- **当** Provider 可执行文件存在并可读取版本
- **那么** Runner 必须上报 installed 状态、版本、路径和 catalog providerId

#### 场景:检测配置状态
- **当** Provider 声明支持配置管理
- **那么** Runner 必须上报配置文件存在性、配置版本摘要、MCP/skill 启用摘要和脱敏后的敏感值状态

### 需求:Agent 安装升级卸载
Runner 必须支持 catalog provider 声明的 install、upgrade 和 uninstall 动作，并必须遵循对应官方文档和 catalog 安装源。

#### 场景:安装完成
- **当** Runner 成功完成 Provider 安装动作
- **那么** Runner 必须重新检测该 Provider 并上报最新状态

#### 场景:安装不支持的平台
- **当** 当前平台不在 provider catalog 支持平台列表中
- **那么** Runner 必须拒绝安装动作并回传平台不支持错误

### 需求:轻量 Doctor
Runner 必须执行轻量 Doctor，检查 PATH、版本、关键配置文件、认证形态、MCP/skill 配置摘要、orchestrator 运行状态和官方认可的只读 probe。

#### 场景:Doctor 执行
- **当** Runner 收到 doctor 动作
- **那么** Runner 必须返回通过、警告或失败的 Doctor 结果，且禁止执行真实 API 调用或计费操作

## 移除需求
