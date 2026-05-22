## 新增需求

### 需求:Provider Catalog API
Server 必须提供 provider catalog API，供 Client 展示和 Runner 执行前校验。

#### 场景:Client 读取 catalog
- **当** Client 请求 catalog 列表
- **那么** Server 必须返回所有启用 provider 的公开元数据和能力声明，并排除敏感实现细节

#### 场景:Runner 获取 catalog
- **当** Runner daemon 连接成功
- **那么** Server 必须向 Runner 提供当前启用 provider catalog 版本或同步入口

### 需求:配置 Profile 存储
Server 必须存储 provider 配置 profile、配置版本和敏感值引用，禁止保存敏感值明文。

#### 场景:保存 profile
- **当** Client 创建或更新 provider profile
- **那么** Server 必须保存非敏感配置、敏感值引用、目标 provider、版本号和更新时间

#### 场景:读取 profile
- **当** Client 请求 profile 详情
- **那么** Server 必须返回脱敏后的配置内容和版本历史摘要

### 需求:授权状态存储
Server 必须维护每台机器每个 provider 的授权状态摘要。

#### 场景:Runner 上报授权状态
- **当** Runner 上报 provider auth status
- **那么** Server 必须保存状态、检测时间、状态来源和用户下一步提示

### 需求:Orchestrator 状态存储
Server 必须维护 orchestrator provider 的安装状态、运行状态、配置状态和连接信息摘要。

#### 场景:Runner 上报 orchestrator 状态
- **当** Runner 上报 Paseo 类工具状态
- **那么** Server 必须保存其安装状态、运行状态和脱敏后的连接信息摘要

## 修改需求

### 需求:Agent 状态存储
Server 必须存储每台机器上每个 Provider 的安装状态、版本、路径、PATH 状态、配置摘要、授权状态、MCP/skill 摘要、Doctor 结果和 orchestrator 运行状态。

#### 场景:Runner 上报检测结果
- **当** Runner 上报 Provider detect、auth status、config status 或 doctor 结果
- **那么** Server 必须更新对应 Provider 状态并记录更新时间

### 需求:管理动作调度
Server 必须创建和调度 detect、install、upgrade、doctor、uninstall、login、configure、start、stop 等 provider 管理动作。

#### 场景:同一 Provider 串行
- **当** 同一机器同一 Provider 已有运行中动作
- **那么** Server 必须将后续同 Provider 动作置为 queued

#### 场景:不同 Provider 并行
- **当** 同一机器不同 Provider 收到动作请求
- **那么** Server 必须允许这些动作同时进入运行流程

#### 场景:动作未声明
- **当** Client 请求 provider catalog 未声明支持的动作
- **那么** Server 必须拒绝创建该管理动作

### 需求:Client 实时事件
Server 必须通过 WebSocket 向 Client 推送机器在线状态、动作状态、Provider 状态、授权状态、配置版本和 orchestrator 状态变化。

#### 场景:动作状态变化
- **当** 管理动作从 queued 变为 running 或完成状态
- **那么** Server 必须向订阅 Client 推送动作状态事件

#### 场景:配置版本变化
- **当** Runner 上报新的配置版本或回滚结果
- **那么** Server 必须向订阅 Client 推送 Provider 配置状态变化事件

### 需求:基础审计
Server 必须写入基础 AuditLog，至少覆盖 Runner 注册、删除机器、发起管理动作、动作结果、配置写入、配置回滚和登录授权引导。

#### 场景:发起动作
- **当** Client 创建管理动作
- **那么** Server 必须写入包含机器、Provider、动作类型和时间的审计记录

#### 场景:配置写入
- **当** Runner 完成 provider 配置写入
- **那么** Server 必须写入包含 profile、配置版本、机器和 provider 的审计记录，且禁止记录敏感值明文

## 移除需求
