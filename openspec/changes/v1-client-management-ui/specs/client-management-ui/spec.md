## 新增需求

### 需求:Token 登录
Client 必须在首次使用时要求用户填写 Server URL 和 Token，并在验证成功后进入应用。

#### 场景:首次登录成功
- **当** 用户输入 Server URL 和有效 Token 并提交
- **那么** Client 必须保存该 Server URL 和 Token 并进入机器列表

#### 场景:登录失败
- **当** Server 返回鉴权失败
- **那么** Client 必须停留在登录页并展示错误提示

### 需求:单 Server 持久化
Client 必须只保存一个 Server URL 和 Token，禁止在 v1 提供多 Server 切换地址簿。

#### 场景:重新打开应用
- **当** Client 本地存在有效 Server URL 和 Token
- **那么** Client 必须尝试恢复登录态并进入应用

### 需求:逐层进入导航
Client 必须在 Web 与 Android 上使用同一信息层级，禁止 Web 使用机器列表与详情并排的主从布局。

#### 场景:查看机器详情
- **当** 用户在机器列表选择一台机器
- **那么** Client 必须进入机器详情页面而不是在同屏右侧展开详情

### 需求:机器列表
Client 必须展示机器列表，并按 online 在前、offline 在后的顺序排序，同组内按显示名排序。

#### 场景:列表展示
- **当** 用户进入机器列表
- **那么** Client 必须展示机器名、在线状态和平台信息，且禁止展示完整 Agent 摘要列表

### 需求:机器详情
Client 必须展示单台机器基础信息、显示名编辑、删除机器入口和 Agent 摘要入口。

#### 场景:删除机器确认
- **当** 用户点击删除机器
- **那么** Client 必须展示二次确认并说明删除后需重新 login 才能再次接入

### 需求:Agent 详情
Client 必须展示当前 Server 支持的所有 Agent 的详情入口，未安装 Agent 也必须可见。

#### 场景:未安装 Agent
- **当** Agent 状态为 not_installed
- **那么** Client 必须展示该 Agent 并提供安装动作

### 需求:管理动作 UI
Client 必须允许用户发起 detect、install、upgrade、doctor、uninstall 动作，并展示动作状态和简短结果。

#### 场景:卸载 Agent
- **当** 用户点击卸载 Agent
- **那么** Client 必须展示二次确认并说明该 Agent 会从目标机器移除

### 需求:实时同步
Client 必须通过 WebSocket 接收机器在线状态、动作状态和 Agent 状态变化。

#### 场景:动作完成推送
- **当** Client 收到动作完成事件
- **那么** Client 必须更新相关页面中的动作状态和 Agent 状态

### 需求:设置页
Client 必须提供设置页展示 Server URL、登录状态、退出登录和关于信息。

#### 场景:修改 Server URL
- **当** 用户在设置页修改 Server URL
- **那么** Client 必须清理当前 Token 并要求重新登录

## 修改需求

## 移除需求
