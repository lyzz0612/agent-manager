---
doc_type: feature-brainstorm
feature: 2026-06-15-command-job-stream
status: confirmed
summary: 共用 Command Job 模块——SSE 流式输出、全局单任务、防死锁；覆盖安装/升级/启动/更新类 CLI 操作
tags: [jobs, sse, cli, streaming, host-jobs, ux]
---

# Command Job 流式输出 Brainstorm

> Stage 0 | 2026-06-15 | 下一步：design

## 想做什么、为什么

Web 管理页触发各类 CLI 操作（安装 skill、拉更新、装 Cursor/Paseo、daemon 启停等）时，用户目前大多只能看到「安装中…」转圈，命令黑盒运行，失败时也只有 toast。设置页的 GitHub「拉取并构建」已有后台 job + 日志面板，但是特例实现，无法复用。

用户希望：**抽一层共用模块**，让安装 / 升级 / 启动 / 更新类操作能看到实时进度和命令输出；账号轮询、状态探测等后台静默操作不在范围内。输出形态选 **SSE 流式**；**全局同时只允许一个长任务**，并显式 **防死锁**（含进程崩溃后的僵死任务）。

## 考虑过的方向

### 方向 A：轻量抽取（只统一前端 + 类型）

- 各业务自己写 job 文件，共用 `<CommandLogPanel>` + `useJobPoll`
- 价值：实现快
- 代价：backend 仍是 N 份拷贝，称不上真共用模块
- 结论：**否决**

### 方向 B：通用 Job 层 + 轮询缓冲

- 新建 `host-jobs`，`GET /api/jobs/:id` 每 1–2s 拉全量 output（复用设置页 update 模式）
- 价值：与现有 update job 一致，实现简单
- 代价：npm 下载等场景的实时感弱于流式
- 结论：**否决**（用户明确要求流式）

### 方向 C：通用 Job 层 + SSE 流式（选定）

- 新建 `host-jobs`（或扩 `host-proc`），统一 job 生命周期与 SSE 推送
- `host-proc` 增加行级流式读 stdout/stderr
- 前端共用 `useCommandJob` + `<CommandJobPanel>`
- 价值：真正共用、体验好、不踩「终端托管」边界（只观察日志，无交互输入）
- 代价：需处理 SSE 断线重连、channel 背压、与 update 特殊重启语义 eventual 迁移
- 结论：**选定**

### 方向 D：全面终端托管

- 通用 WebSocket 终端
- 结论：**否决**——与 Phase 1 requirement「不做终端托管」冲突

## 已敲定的设计点

### 范围（已确认）

**纳入：**

| 操作 | 现有入口 / 实现 |
|------|----------------|
| Skills CLI 安装 / 预览 | `POST /api/profile/skills/cli/install`、`preview`；`skills_cli.rs` 同步阻塞 |
| Cursor Agent 安装 / 升级 / 卸载 | `POST /api/agents/cursor/install|upgrade|uninstall` |
| Paseo 安装 / 升级 / 卸载 | `POST /api/plugins/paseo/install|upgrade|uninstall` |
| Paseo daemon 启停 | `POST /api/plugins/:id/daemon/:action` |
| 应用拉取并构建 | 现有 `update.rs` job（**首期可保留旧 API，后续迁入**） |

**排除：**

- Cursor 登录轮询、账号状态、`agent status` 等后台静默探测
- 纯秒回的读操作（除非后续实测需要）

**卸载：** 与安装同类，逻辑相同，**纳入 v1**（用户确认落盘时未反对）。

### 架构骨架（已确认）

```
POST /api/.../action  ──► JobRegistry.try_start(kind, params)
                              ├─ 忙 → 409「有任务进行中」+ 当前 job_id
                              └─ 成 → spawn worker + 立刻返回 { job_id }

GET /api/jobs/:id/stream ──► SSE（先回放 buffer，再订阅 live 增量）
GET /api/jobs/:id        ──► 快照（phase / message / active，重连用）

worker: host-proc 流式读 stdout/stderr
         ──► unbounded channel ──► SSE subscribers
         ──► 行写入 job log buffer（断线重连回放）
         JobGuard::drop → 释放槽位、写终态 success/failed
```

### 防死锁五条（已确认）

1. **唯一闸口** — 只有 `JobRegistry` 管互斥；移除 `skills_cli` 的 `INSTALL_LOCK`，避免锁嵌套
2. **try 不进 wait** — `try_start` 拿不到槽位立刻 409，HTTP handler 绝不阻塞等锁
3. **RAII 释放** — worker 持 `JobGuard`，`Drop` 清 `active`、标终态、通知 SSE 结束；`catch_unwind` 兜 panic
4. **无背压 channel** — worker → SSE 用 **unbounded** mpsc/broadcast，写端不因慢客户端阻塞（避免子进程 pipe 满导致死锁）
5. **僵死恢复** — 启动时扫 job state：`worker_pid` 不存在或超时 → 标 `failed` 释放槽位（复用 `update.rs` 的 `normalize_job_state` 思路）

### 前端共用件（已确认）

- `useCommandJob()` — 启动任务、订阅 SSE、聚合 output、处理 409
- `<CommandJobPanel>` — 可嵌入弹窗或页面内，显示 phase + 自动滚动日志
- App 级感知当前 job，避免跨页重复触发

### 首期接入顺序（倾向，design 可微调）

1. 基础设施（`host-jobs` + SSE API + 前端 hook/面板）
2. Skills CLI 安装（`skills-cli-install` 正在实现，最直接受益）
3. Paseo 安装 / daemon 启停
4. Cursor 安装 / 升级
5. update job 迁入（最后——detached worker + 服务重启语义最特殊）

### 与 Phase 1 非目标的关系（已确认）

- requirement 明确不做「终端托管」——本 feature 是 **特定长任务的日志观察**，不提供 stdin 交互，不开放任意 shell
- 不做「复杂任务系统」——单槽位、无任务队列/历史列表（v1）

## 选定方向与遗留问题

**选定方向：** 新建共用 `host-jobs` 模块，所有纳入范围的 CLI 操作经 `JobRegistry` 单槽调度，SSE 流式推送 stdout/stderr 行；前端统一 job 面板。全局同时只允许一个长任务，通过 try-acquire + RAII + unbounded channel + 启动僵死恢复防死锁。

**核心行为：** 用户触发安装/升级/启动/更新 → 立即拿到 job_id → 界面展示实时日志 → 结束显示成功/失败。

**明显不做（v1）：** 多任务并行、任务历史列表、交互式终端、账号类后台轮询的输出展示。

**遗留给 design 的问题：**

1. **API 形态** — 统一 `POST /api/jobs` + kind 参数，还是保留各领域 `POST /api/agents/:id/install` 但内部转 job（对外兼容）？
2. **SSE 事件格式** — 行事件 vs 结构化 `{ type: "line"|"phase"|"done", ... }`；ANSI 剥离是否复用 `skills_cli::strip_ansi`
3. **`host-jobs` crate 边界** — 独立 crate vs 并入 `host-proc` / `app-core`
4. **update 迁移策略** — adapter 双写还是第二期再动 `update.rs`
5. **超时与取消** — 是否暴露 `DELETE /api/jobs/:id` 杀进程；各操作超时沿用现有值（如 skills 120s）还是 job 层统一
6. **Docker 重启场景** — in-process job 随进程消失；update detached job 的 SSE 如何在重启后衔接（可能仅 update 阶段特殊处理）
