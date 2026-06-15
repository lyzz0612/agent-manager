---
doc_type: requirement
slug: command-job-stream
pitch: 长 CLI 操作有实时日志、不卡页面，同时全局只允许一个命令在跑
status: current
last_reviewed: 2026-06-15
implemented_by:
  - ARCHITECTURE
tags: [jobs, sse, cli, streaming]
---

# Command Job 流式长任务

## 用户故事

- 作为在网页里安装 Agent / Plugin / Skill 的维护者，我希望点下按钮后立刻看到任务 ID 和滚动日志，而不是盯着空白按钮等几分钟。
- 作为同时管多个模块的人，我希望同一时间只有一个长命令在跑；再点别的安装时明确提示「另一个任务进行中」，并能看到那个任务的日志。
- 作为需要中止误操作的人，我希望运行中的任务可以取消，取消后马上能发起新任务。

## 为什么需要

Phase 1 各安装/升级/卸载 API 原先同步阻塞到 CLI 结束，前端只有本地 loading，看不到 npx/npm/curl 输出，也难以判断卡在哪。Settings 的 App Update 虽有后台任务，但是独立轮询模型，无法复用到 Skills / Agents / Plugins。

## 怎么解决

抽取共用 **Command Job**：领域 POST 立即返回 `job_id`，worker 流式执行 CLI 并经 SSE 推送 `phase` / `line` / `done`；前端全局 `CommandJobPanel` 展示日志。`JobRegistry` 单槽互斥，冲突返回 409。

## 边界

- v1 **不做**交互式终端、stdin、任务历史列表、磁盘日志、多任务并行。
- **不做** Cursor / GitHub 登录轮询的输出展示；登录路由保持原同步/轮询模型。
- **不做** App Update 迁入 Command Job（设置页仍 `GET /api/app/update/status` 轮询）。
- Skills `find`、纯秒回 GET 不 job 化。

## 变更日志

- 2026-06-15：随 `2026-06-15-command-job-stream` feature 首次落地（`host-jobs` crate、`/api/jobs/*`、前端 `useCommandJob` + 全局面板）。
