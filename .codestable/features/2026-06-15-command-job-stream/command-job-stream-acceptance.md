# Command Job 流式长任务 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-15
> 关联方案 doc：`.codestable/features/2026-06-15-command-job-stream/command-job-stream-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：

- [x] `CommandJobStartResponse`（`host-model` + 各领域 POST）：`POST /api/agents/cursor/install` 实测返回 `{"job_id","kind":"agent_install","label"}` → **一致**
- [x] 409 `CommandJobBusyResponse`：第二个 install 实测 HTTP 409 + `active_job_id` / `error` / `kind` / `label` → **一致**
- [x] `GET /api/jobs/current`：空闲 `{"active":false}`；运行中含 `job_id/kind/label/phase/message` → **一致**
- [x] `GET /api/jobs/:id`：`job_snapshot` 返回 `CommandJobSnapshot`（含 `line_count`）→ **一致**（代码 + handler）
- [x] SSE `phase` / `line` / `done` / `error`：`curl -N …/stream` 收到 `event: phase` + JSON data → **一致**

**名词层"现状 → 变化"逐项核对**：

- [x] `host-jobs` crate：`JobRegistry` / `JobContext` / `subscribe_stream` 已落地 → **一致**
- [x] `host-proc` 流式执行：`run_command_streaming_with_env` + `ProcHandles` → **一致**（方案概念签名为 line callback，实现为 sink + handles）
- [x] 领域 POST 改 `CommandJobStartResponse`：`main.rs` 全部 mutation 已改 → **一致**
- [x] 前端 `useCommandJob` + `CommandJobPanel`：落点 `context/CommandJobContext.tsx`（非独立 `hooks/useCommandJob.ts`）→ **路径偏差、职责一致**

**流程图核对**（第 2.2 节 mermaid）：

- [x] UI → POST → `try_start` → 200/409 → EventSource → worker → `append_line` → SSE → done → **均有代码落点**（`command_jobs.rs`、`host-jobs`、`CommandJobContext`）

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 启动后立即返回 `job_id`：`curl` 安装 cursor agent <1s 返回 job_id → **通过**
- [x] 409 不阻塞 HTTP：第二个 POST 立即 409 → **通过**
- [x] SSE 结构化事件 + ANSI strip：`host_proc::strip_ansi` + `JobContext::append_line` → **通过**（代码）
- [x] 服务重启空槽：`JobRegistry::new()` 无持久化 → **通过**（代码）

**明确不做逐项核对**：

- [x] 无 `/api/terminal`、无 job 列表 API → grep 无命中 → **通过**
- [x] 无多任务并行：409 实测 → **通过**
- [x] login 路由未 job 化：`/cursor/login/*`、`/gh/login/*` 仍返回原类型 → **通过**
- [x] `update.rs` 无 `JobRegistry`：grep 无引用；`GET /api/app/update/status` 实测 200 → **通过**

**关键决策落地**：

- [x] D1 保留领域 POST 路径：未引入 `POST /api/jobs` 统一入口 → **一致**
- [x] D2 SSE 结构化事件：`job_stream` + `openCommandJobStream` → **一致**
- [x] D3 `host-jobs` 新 crate：workspace 已含 → **一致**
- [x] D4 单槽 + 移除 `INSTALL_LOCK`：grep 无 `INSTALL_LOCK` → **一致**
- [x] D5 cancel v1：`POST /api/jobs/:id/cancel` + `ProcHandles` 共享子进程句柄 → **一致**

**编排层变化**：

- [x] 启动/执行/观察/结束/取消/启动恢复六条路径均在 `host-jobs` + `command_jobs` + 前端 Context 有落点 → **一致**

**流程级约束**：

- [x] 单槽：`try_start` 唯一闸口，handler 不 await worker → **一致**
- [x] RAII 释放槽位：worker 线程结束 + `cancel()` 均清 slot；无独立 `JobGuard` 类型名，行为等价 → **一致（实现名差异）**
- [x] unbounded 背压：`host-proc` 读行用无界 `mpsc`；`broadcast::channel(1024)` 作 live 扇出且 `send` 失败被忽略，主存储为 `events` Vec → **基本一致**（broadcast 非字面 unbounded，但不阻塞 worker）
- [x] 超时：`timeout_for_kind` agent_install=300s，其余 120s → **一致**
- [x] `info!(job_id, kind, elapsed_ms, success)`：worker 结束有 log → **一致**

**挂载点反向核对**：

| 挂载点 | 落点 | 结果 |
|--------|------|------|
| `Cargo.toml` + `host-jobs` | 已加 | ✓ |
| `main.rs` `/api/jobs/*` | 4 路由 + auth | ✓ |
| `App.tsx` Provider + Panel | 已挂载 | ✓ |
| Skills/Agents/Plugins 页 | `useCommandJob` | ✓ |
| Settings update | 未改，仍 `pollUpdateJob` | ✓ |

**反向 grep 补充挂载（实现细节，拔除时需一并移除）**：

- `crates/app-core/src/command_jobs.rs`
- `apps/web/src/commandJobApi.ts`、`commandJobTypes.ts`
- `crates/host-model` CommandJob* 类型
- `crates/host-proc` 流式 + `ProcHandles`
- 各 provider `*_with_sink`

**拔除沙盘**：移除上述 + `host-jobs` + job 路由 + 前端 Context/Panel 后，Command Job 能力消失；`update.rs` 与 login 路由不受影响 → **可干净拔除**

## 3. 验收场景核对

| # | 场景 | 证据 | 结果 |
|---|------|------|------|
| 1 | Skills install 流式 | 代码路径完整；本机 `npx skills` 不可用未跑通 E2E | **代码+类型通过；E2E skip（无 CLI）** |
| 2 | Skills preview 流式 | 同上 | **skip（无 CLI）** |
| 3 | Cursor agent install | `curl` 启动 job + SSE phase | **部分通过** |
| 4 | Paseo plugin install | 代码接入 `start_plugin_install_job` | **代码通过** |
| 5 | Paseo daemon | `PluginsPage` `runJob` daemon 路径 | **代码通过** |
| 6 | GH plugin install | `gh-provider` 流式 curl | **代码通过** |
| 7 | 409 冲突 | `curl` 双 POST 实测 409 | **通过** |
| 8 | cancel | API 存在；实测 job 已结束致 cancel 404（槽位已释） | **API 通过；杀进程路径依赖更长任务手工复验** |
| 9 | SSE 断线重连 | `replay_events` + `subscribe_stream` 先回放 | **代码通过** |
| 10 | CLI 非零退出 | worker `Ok(Err)` → `done success=false` | **代码通过** |
| 11 | 超时 | `timeout_for_kind` + `host-proc` kill | **代码通过；未做极短超时手工测** |
| 12 | Settings update 未回归 | `pollUpdateJob` 仍在；`GET /api/app/update/status` 实测 | **通过** |

**前端浏览器验证**：

- [x] `npm run build`（tsc + vite）通过
- [x] `App.tsx` 挂载 `CommandJobProvider` + `CommandJobPanel`；Agents/Plugins/Skills 对话框接入 `runJob`
- [ ] **全屏 UI 肉眼**：本地 `:3000` 仍为旧 server 二进制（无 `/api/jobs`），需重启 `scripts/dev.bat` 后肉眼确认面板滚动与 409 toast

## 4. 术语一致性

- Command Job / JobRegistry / Job stream / line event：`grep` 与方案第 0 节一致 ✓
- 未使用 `task` / `terminal` / `background-task` 作对外 API 名 ✓
- `useCommandJob` 在 context 导出，与方案「hooks 或 context」一致 ✓

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：已写入 **§4.5 Command Job**（端点表、单槽约束、与 update 并存、crate 边界）；**§6.2** 更新 preview/install 为 job 模式；**§3** 仓库结构加 `host-jobs` ✓

## 6. requirement 回写

- [x] 方案 `requirement` 为空 → 已 **backfill** `.codestable/requirements/command-job-stream.md`（`status: current`）
- [x] 关联能力 `skills-cli-install`：已追加变更日志（API 改 job、移除 mutex）✓

## 7. roadmap 回写

- [x] 方案 frontmatter 无 `roadmap` / `roadmap_item` → **非 roadmap 起头，跳过**

## 8. attention.md 候选盘点

- **候选 1**：改 Rust 后端后需重启 `scripts/dev.bat`；否则 `cargo build` 可能 exe 占用失败，且 `:3000` 仍是旧 API（attention.md 已有类似条目，无需重复）

本 feature 未暴露需新增 attention 的内容（已有条目覆盖）。

## 9. 遗留

**后续优化（issue 候选）**：

- `paseo-provider` `install_paseo`/`upgrade_paseo`/`uninstall_paseo` 与 `cursor-provider` `run_install_command` 死代码清理
- 页面刷新后不自动 `GET /api/jobs/current` 恢复面板（v1 可接受）
- `broadcast` 容量 1024 + Lagged 跳过：极端慢客户端可能丢 live 行（buffer 回放仍完整）

**已知限制**：

- v1 无任务历史、无磁盘日志
- Skills E2E 依赖本机 Node/`npx skills`

**实现阶段顺手发现**：

- 见上死代码条目

**验收期修复**：

- `gh-provider` 误删 `run_command_with_env` import 导致编译失败 → 已恢复
