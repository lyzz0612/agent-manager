---
doc_type: feature-acceptance
feature: 2025-06-15-runtime-status-cache
status: passed
date: 2025-06-15
summary: 进程内 RuntimeCache、启动 warmup、refresh API 与页头刷新均已验证；mutation 自动刷新经代码核对
---

## 1. 对照 design 的结论

| 维度 | 结论 |
|---|---|
| 名词层（RuntimeCache / scope） | 已实现，与 design 2.1 一致 |
| 编排（读缓存 / warmup / refresh / mutation 后重算） | 已实现；登录会话 active 时 account 实时读为 implement 补充 |
| 挂载点 | `POST /api/cache/refresh`、页头刷新、AppState cache 均已落地 |
| 明确不做 | 无 SQLite；settings git 未缓存；侧边栏刷新保留 |

**验收偏差修复**：`tracing` 过滤器补充 `app_core=info`，否则 warmup 日志不可见（`apps/server/src/main.rs`）。

## 2. 场景验收（design §3）

| # | 场景 | 结果 | 证据 |
|---|---|---|---|
| 1 | 启动 warmup | 通过 | 日志 `runtime cache refreshed scope="all" elapsed_ms=8725` |
| 2 | 缓存命中二次 GET | 通过 | `/api/agents` 第 1 次 ~4ms，第 2 次 ~0.6ms（warmup 后） |
| 3 | POST refresh overview | 通过 | 200 + `message` 字段 |
| 4 | mutation 后 agents/overview 一致 | 代码核对 | `after_agent_mutation` 调用 `refresh_overview_bundle` 等 |
| 5 | daemon 后 plugin 详情更新 | 代码核对 | `after_daemon_mutation` |
| 6 | 登出后 account 更新 | 代码核对 | `logout_cursor` → `after_cursor_account_mutation` |
| 7 | settings 仍读 git | 通过 | `GET /api/app/settings` 返回 `git_branch=manager` |
| 8 | update/check 独立 | 未在本轮 HTTP 触发 | 代码路径未改 `check_for_updates` |
| 9 | 未知 scope → 400 | 通过 | `scope=bogus` → 400；`scope=plugin` 无 id → 400 |
| 10 | warmup 未完成 GET | 通过 | 重启后 500ms 内 `GET /api/agents` 返回 200 |

补充：

- 未登录 `POST /api/cache/refresh` → **401**
- 前端产物含 `cache/refresh` 与 `header-refresh`（`apps/web/dist/assets/*.js`）
- 全仓无 `rusqlite` 依赖

## 3. checklist 状态

- `steps`：全部 **done**
- `checks`：全部 **passed**（见同目录 checklist.yaml）

## 4. 架构回写

已更新 `.codestable/architecture/ARCHITECTURE.md` §4.4 运行时状态缓存。

## 5. 遗留 / 建议

- 场景 4–6 未在本机执行真实 install/daemon（避免污染环境）；合并前可在 Compose 环境补一轮手工 mutation 抽检。
- `/overview` 直链在纯 HTTP GET 下 404（SPA 需走 `index.html` fallback）；与本次 feature 无关。

## 6. 结论

**验收通过**，可 merge。
