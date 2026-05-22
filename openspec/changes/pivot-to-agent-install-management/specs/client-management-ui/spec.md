## 新增需求

### 需求:Provider Catalog 页面
Client 必须提供 provider catalog 页面，作为安装和配置 agent/provider 的主入口。

#### 场景:浏览 provider
- **当** 用户打开 provider catalog 页面
- **那么** Client 必须展示 provider 名称、类型、描述、安装状态摘要、支持动作和官方文档入口

#### 场景:按类型筛选
- **当** 用户按 agent、ACP agent 或 orchestrator 筛选
- **那么** Client 必须只展示对应类型的 provider

### 需求:配置 Profile 页面
Client 必须提供配置 profile 管理页面，用于管理模型、`base_url`、权限模式、MCP server、skill 和敏感值引用。

#### 场景:编辑 profile
- **当** 用户编辑 provider profile
- **那么** Client 必须根据 provider catalog 的配置 schema 展示可编辑字段，并对敏感字段使用引用或本机输入引导

#### 场景:应用 profile
- **当** 用户将 profile 应用到机器上的 provider
- **那么** Client 必须展示配置变更摘要并要求用户确认高风险写入

### 需求:Orchestrator 入口
Client 必须提供 Paseo 类 orchestrator 的专属入口，用于展示安装、运行、连接和外部接管信息。

#### 场景:查看连接信息
- **当** 用户查看 orchestrator 详情
- **那么** Client 必须展示连接方式、pairing 引导或官方客户端入口，并说明对话体验由外部工具承担

## 修改需求

### 需求:逐层进入导航
Client 必须在 Web 与 Android 上使用同一信息层级，并以 Provider Catalog、Installed Providers、Profiles、Orchestrators 和 Machines 作为主要导航入口。

#### 场景:查看机器详情
- **当** 用户在机器列表选择一台机器
- **那么** Client 必须进入机器详情页面而不是在同屏右侧展开详情

#### 场景:查看 provider 详情
- **当** 用户在 provider catalog 中选择一个 provider
- **那么** Client 必须进入 provider 详情页面并展示该 provider 在各机器上的状态

### 需求:Agent 详情
Client 必须展示当前 Server 支持的所有 Provider 的详情入口，未安装 Provider 也必须可见，并必须区分 agent、ACP agent 和 orchestrator 类型。

#### 场景:未安装 Provider
- **当** Provider 状态为 not_installed
- **那么** Client 必须展示该 Provider 并在 catalog 声明支持安装时提供安装动作

#### 场景:Orchestrator Provider
- **当** Provider 类型为 orchestrator
- **那么** Client 必须展示运行状态、连接信息入口和外部体验说明

### 需求:管理动作 UI
Client 必须允许用户发起 provider catalog 声明支持的 detect、install、upgrade、doctor、uninstall、login、configure、start、stop 动作，并展示动作状态和简短结果。

#### 场景:卸载 Provider
- **当** 用户点击卸载 Provider
- **那么** Client 必须展示二次确认并说明该 Provider 会从目标机器移除

#### 场景:登录 Provider
- **当** 用户点击登录或授权 Provider
- **那么** Client 必须展示 Runner 返回的登录引导、状态刷新入口和授权状态摘要

#### 场景:配置 Provider
- **当** 用户点击配置 Provider
- **那么** Client 必须展示可用 profile、配置 diff 摘要和确认入口

### 需求:实时同步
Client 必须通过 WebSocket 接收机器在线状态、动作状态、Provider 状态、授权状态、配置版本和 orchestrator 状态变化。

#### 场景:动作完成推送
- **当** Client 收到动作完成事件
- **那么** Client 必须更新相关页面中的动作状态和 Provider 状态

#### 场景:授权状态推送
- **当** Client 收到 Provider 授权状态变化事件
- **那么** Client 必须更新 provider 详情、机器详情和 profile 应用页面中的授权状态摘要

### 需求:设置页
Client 必须提供设置页展示 Server URL、登录状态、退出登录、关于信息和 provider catalog 版本。

#### 场景:修改 Server URL
- **当** 用户在设置页修改 Server URL
- **那么** Client 必须清理当前 Token 并要求重新登录

#### 场景:查看 catalog 版本
- **当** 用户打开设置页
- **那么** Client 必须展示当前 Server 提供的 provider catalog 版本或更新时间

## 移除需求
