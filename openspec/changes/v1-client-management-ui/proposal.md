## 为什么

v1 需要一个 Web / Android 共用的 Client，让用户能通过统一界面连接 Server、查看机器和 Agent 状态，并发起基础管理动作。Client 是三层闭环的用户入口，也决定后续手机端和 Web 端能否保持同一套产品逻辑。

## 变更内容

- 新增 Expo + React Native Web Client 应用骨架。
- 新增 Server URL + Token 登录流程，本地持久保存一个 Server 地址和 Token。
- 新增「机器」与「设置」主导航，手机使用底部 Tab，Web 可使用侧边栏或顶部导航。
- 新增逐层进入的信息架构：机器列表、机器详情、Agent 详情、动作结果和设置页。
- 新增机器列表，按在线状态排序，不展示 Agent 摘要。
- 新增机器详情，展示机器基础信息、显示名编辑、删除机器入口和 Agent 摘要入口。
- 新增 Agent 详情，展示只读状态、版本、路径、PATH、配置摘要、Doctor 结果和管理动作。
- 新增管理动作交互：detect、install、upgrade、doctor、uninstall。
- 新增删除机器和卸载 Agent 的二次确认。
- 新增 WebSocket 订阅，用于自动刷新在线状态、动作状态和 Agent 状态。
- v1 不展示长日志、不提供配置写入、不提供全局审计页。

## 功能 (Capabilities)

### 新增功能

- `client-management-ui`: Web / Android 共用登录、导航、机器列表、机器详情、Agent 详情、动作状态、设置页和 WebSocket 状态同步。

### 修改功能

## 影响

- 新增 Client 应用、路由、页面和组件。
- 新增 API client、WebSocket client、本地持久化和状态管理。
- 影响 Server API 的字段需求和错误文案。
- 影响设计稿与 `docs/design/` 中的布局约定。
