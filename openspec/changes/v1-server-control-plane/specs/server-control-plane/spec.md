## 新增需求

### 需求:单 Token 访问控制
Server 必须使用部署环境配置的单一 Token 保护 Client API、Client WebSocket 和 Runner Channel。

#### 场景:Token 有效
- **当** Client 或 Runner 使用有效 Token 请求受保护接口
- **那么** Server 必须允许请求继续处理

#### 场景:Token 无效
- **当** 请求未携带 Token 或 Token 不匹配
- **那么** Server 必须拒绝请求并返回鉴权失败

### 需求:机器注册与在线状态
Server 必须维护 Machine 与 Runner 状态，并根据 Runner 连接存在与否更新在线状态。

#### 场景:Runner 连接
- **当** Runner daemon 成功连接 Server
- **那么** Server 必须将对应机器标记为 online

#### 场景:Runner 断开
- **当** Runner daemon 连接断开
- **那么** Server 必须立即将对应机器标记为 offline

### 需求:机器软删除
Server 必须将机器删除实现为软删除，禁止提供硬删除业务能力。

#### 场景:删除机器
- **当** Client 请求删除机器
- **那么** Server 必须设置机器删除标记并在常规列表中过滤该机器

#### 场景:旧凭据重连
- **当** 已软删机器的 Runner 使用旧凭据重新连接
- **那么** Server 必须拒绝连接并要求重新 login

### 需求:Agent 状态存储
Server 必须存储每台机器上每个 Agent 的安装状态、版本、路径、PATH 状态、配置摘要和 Doctor 结果。

#### 场景:Runner 上报检测结果
- **当** Runner 上报 Agent detect 或 doctor 结果
- **那么** Server 必须更新对应 Agent 状态并记录更新时间

### 需求:管理动作调度
Server 必须创建和调度 detect、install、upgrade、doctor、uninstall 管理动作。

#### 场景:同一 Agent 串行
- **当** 同一机器同一 Agent 已有运行中动作
- **那么** Server 必须将后续同 Agent 动作置为 queued

#### 场景:不同 Agent 并行
- **当** 同一机器不同 Agent 收到动作请求
- **那么** Server 必须允许这些动作同时进入运行流程

### 需求:Client 实时事件
Server 必须通过 WebSocket 向 Client 推送机器在线状态、动作状态和 Agent 状态变化。

#### 场景:动作状态变化
- **当** 管理动作从 queued 变为 running 或完成状态
- **那么** Server 必须向订阅 Client 推送动作状态事件

### 需求:基础审计
Server 必须写入基础 AuditLog，至少覆盖 Runner 注册、删除机器、发起管理动作和动作结果。

#### 场景:发起动作
- **当** Client 创建管理动作
- **那么** Server 必须写入包含机器、Agent、动作类型和时间的审计记录

## 修改需求

## 移除需求
