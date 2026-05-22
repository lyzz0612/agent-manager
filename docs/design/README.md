# 设计稿与布局约定

本目录存放产品设计稿和设计约束。

当前参考图：

- `v1-gpt-image2.png`：更接近 v1 推荐的信息架构。
- `v1-cursor.png`：可参考视觉风格，但其中 Web 宽屏的主从分栏布局不作为 v1 推荐方案。

## v1 布局原则

v1 Client 使用 Expo + React Native Web，同一套信息架构同时服务 Web 与 Android。

核心原则：

- Web 与手机都采用逐层进入结构。
- 不采用「左侧机器列表 + 右侧机器详情 + Agent 卡片」同时展开的宽屏主从布局。
- Web 可以在外壳上使用侧边栏或顶部导航，但内容区仍按页面层级前进。
- 手机使用底部 Tab；Web 和手机共享路由、状态模型和操作语义。

推荐层级：

```text
登录
  -> 机器列表
      -> 机器详情
          -> Agent 详情
              -> 动作结果
  -> 设置
```

对应路由：

```text
/login
/machines
/machines/:machineId
/machines/:machineId/agents/:agentType
/machines/:machineId/actions/:actionId
/settings
```

## Web 布局

Web 宽屏可以增加留白、最大宽度和更舒适的卡片排版，但不改变信息层级。

推荐：

- `/machines` 只展示机器列表，不在同屏右侧展开机器详情。
- `/machines/:machineId` 只展示单台机器详情和 Agent 列表。
- `/machines/:machineId/agents/:agentType` 展示单个 Agent 的完整信息和动作入口。
- `/machines/:machineId/actions/:actionId` 展示单次动作的状态和简短结果。

不推荐：

- 机器列表和机器详情并排。
- 机器详情和多个 Agent 详情并排。
- 为了利用宽屏而在同一屏展示过多层级。

## 手机布局

手机端遵循同一层级，只在展示上更紧凑：

- 机器列表为一列。
- 机器详情纵向展示基础信息和 Agent 摘要卡片。
- Agent 详情单独进入，避免详情页卡片过长。
- 删除机器、卸载 Agent 使用确认弹窗或底部确认面板。

## 设计取舍

逐层进入会少一些桌面端的信息密度，但能换来：

- Web 与 Android 维护成本更低。
- Expo 多端复用更自然。
- 后续 Agent 数量增加时页面不失控。
- 后续接入对话、任务、实时输出时路由层级更清晰。
