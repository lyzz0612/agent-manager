## 新增需求

### 需求:Provider Catalog
系统必须维护 provider catalog，用于统一描述可安装、可检测、可配置或可启动的 agent、ACP agent、自定义 provider 和 orchestrator 工具。

#### 场景:列出 catalog
- **当** Client 请求 provider catalog
- **那么** Server 必须返回每个 provider 的标识、名称、类型、描述、支持平台、支持动作、官方文档链接和能力摘要

#### 场景:区分 provider 类型
- **当** catalog entry 表示 Paseo 类工具
- **那么** 系统必须将其标记为 orchestrator 类型，而不是普通 agent 类型

### 需求:Catalog 安装源
每个可安装 provider 必须声明安装源和安装约束，禁止在 Runner 中仅依靠硬编码命令决定安装方式。

#### 场景:安装源展示
- **当** 用户查看 provider 详情
- **那么** Client 必须展示安装来源、官方文档链接和当前平台是否支持安装

#### 场景:Runner 执行安装
- **当** Runner 收到 provider 安装动作
- **那么** Runner 必须根据 catalog entry 和对应 adapter 解析安装步骤，并在动作结果中记录使用的安装来源

### 需求:Provider 能力声明
Catalog entry 必须声明 provider 支持的动作和配置能力，Client 禁止展示未声明的管理入口。

#### 场景:隐藏未支持动作
- **当** provider 未声明支持 uninstall
- **那么** Client 禁止展示该 provider 的卸载动作

#### 场景:展示配置能力
- **当** provider 声明支持 MCP 或 skill 配置
- **那么** Client 必须在 provider 配置页面展示对应配置入口

### 需求:自定义 Provider
系统必须允许后续通过 catalog entry 扩展自定义 provider，且通用业务流程禁止依赖固定 provider 枚举。

#### 场景:新增自定义 provider
- **当** 用户导入符合 schema 的自定义 provider
- **那么** 系统必须能够在 catalog 中展示该 provider，并允许 Runner 按其声明能力执行支持的动作

## 修改需求

## 移除需求
