# Agent Manager · Client

Web + Android client built with **Expo + React Native Web** and **React Navigation**.
Implements the `client-management-ui` capability described in
`openspec/changes/v1-client-management-ui/`.

## 目录结构

```text
client/
├── App.tsx                       # 应用根组件
├── index.js                      # Expo 注册入口
├── app.json                      # Expo 配置
├── babel.config.js
├── metro.config.js
├── tsconfig.json
├── package.json
├── src/
│   ├── api/                      # REST client、WebSocket client、错误处理、类型
│   ├── components/               # 通用组件（Button、Card、Field、ConfirmDialog 等）
│   ├── hooks/                    # useMachines / useMachine / useAgent / useAction
│   ├── navigation/               # Stack + BottomTab 导航与 Web URL 链接配置
│   ├── screens/                  # Login / Machines / MachineDetail / AgentDetail / ActionResult / Settings
│   ├── store/                    # AuthProvider、EventsProvider、AsyncStorage shim
│   ├── theme/                    # 颜色、间距、字号
│   └── utils/                    # 排序、文案格式化
└── __tests__/                    # Jest 单元测试
```

## 主要功能

- **Server URL + Token 登录**：进入应用前必须提供 Server URL 和 Token；本地仅保存一个 Server。
- **逐层导航**：Web 与 Android 共用同一信息层级（`/machines` → `/machines/:id` →
  `/machines/:id/agents/:type` / `/machines/:id/actions/:id`），不使用主从分栏。
- **机器列表**：按 `online → offline → 显示名` 排序，展示机器名、平台、在线状态。
- **机器详情**：基础信息、显示名编辑、Agent 摘要入口、删除机器（带二次确认）。
- **Agent 详情**：状态、版本、路径、PATH、配置摘要、Doctor 结果；
  detect/install/upgrade/doctor/uninstall 动作入口；卸载带二次确认。
- **动作结果页**：仅展示 `queued/running/succeeded/failed/cancelled` 状态及简短摘要。
- **设置页**：展示 Server URL、登录状态、WebSocket 连接状态、修改 Server URL（清理 Token）、退出登录、版本和关于。
- **WebSocket 同步**：指数退避重连，分发 `machine.status` / `machine.updated` /
  `machine.deleted` / `agent.updated` / `action.updated` 事件到对应页面 hooks。

## 假设的 Server 接口

> Server 仍在另一个 OpenSpec 变更里同步实现，这里先按合约编码：

| 方法 | 路径 | 描述 |
|------|------|------|
| `GET`    | `/api/me`                                           | Token 探活 |
| `GET`    | `/api/machines`                                     | 机器列表 |
| `GET`    | `/api/machines/:id`                                 | 机器详情 |
| `PATCH`  | `/api/machines/:id`                                 | 更新机器显示名 |
| `DELETE` | `/api/machines/:id`                                 | 软删除机器 |
| `GET`    | `/api/machines/:id/agents`                          | Agent 列表 |
| `GET`    | `/api/machines/:id/agents/:type`                    | Agent 详情 |
| `POST`   | `/api/machines/:id/actions`                         | 发起管理动作 |
| `GET`    | `/api/machines/:id/actions/:actionId`               | 动作详情 |
| `WS`     | `/api/ws?token=...`                                 | 实时事件流 |

Server 实现完成后可在 `src/api/client.ts` 中调整路径或参数。

## 本地命令

```bash
# 在 client/ 目录内：
npm install
npm run web        # 启动 Web
npm run android    # 启动 Android（需要 Android SDK / 模拟器）
npm run typecheck  # TypeScript 检查
npm test           # Jest 单元测试
```

> 仓库根目录还没有 workspace 配置（`pnpm-workspace.yaml` 等）。Client 当前是自包含项目，
> 直接在 `client/` 目录运行 `npm install` 即可，不依赖根目录 install。

## 已知遗留

- 实际 Server / WebSocket 接口需要等 `v1-server-control-plane` 落地后联调。
- Web 与 Android 的端到端测试、设计稿对齐放到后续迭代。
