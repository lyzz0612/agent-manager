---
doc_type: learning
track: knowledge
date: 2025-06-15
slug: feature-self-test-workflow
component: feature-acceptance
tags: [feature, acceptance, self-test, dev-server, evidence]
related_feature: 2025-06-15-runtime-status-cache
---

# Feature 本地自测通用流程

## 背景

`runtime-status-cache` 验收时暴露的问题不是「功能没写好」，而是**自测流程缺步骤**——旧进程占端口、日志过滤器漏 crate、后台任务 exit code 被误判为崩溃、mutation 场景只写「代码核对」却未在 acceptance 里说明边界。本文档给后续 feature 的 implement / accept 阶段复用，减少重复踩坑。

来源：`.codestable/features/2025-06-15-runtime-status-cache/runtime-status-cache-acceptance.md` 及同次会话中的重启与 HTTP 验收。

## 指导原则

1. **先确认「在测新二进制」再测行为**——停旧进程 → 编译 → 启动 → `health` 探活。
2. **每条 design §3 场景都要有可引用证据**——日志行、HTTP 状态码、耗时对比、grep 结果；写「通过」时必须能复制粘贴证据。
3. **区分三类验证强度**，在 acceptance 里如实标注，不混称为「全通过」：
   - **L1 实机**：真实 HTTP / 日志 / 浏览器
   - **L2 产物**：静态构建产物 grep（dist 含新字符串）
   - **L3 代码核对**：mutation 等破坏性操作未执行时，指向具体函数/调用链
4. **观测不到 ≠ 没发生**——日志、指标、过滤器要先对齐再下结论。

## 为什么重要

acceptance 报告是 feature 工作流唯一「行为已确认」的对外凭证。流程缺口会导致：假阴性（功能好但测法错）、假阳性（报告通过但生产行为未覆盖）、后人重复花 1 小时排查「服务器是不是挂了」。

## 何时适用

- `cs-feat-impl` 最后一步「联调验收」之前
- `cs-feat-accept` 跑 HTTP / 日志证据之前
- 任何跨 **Rust 后端 + Vite 前端 + 单进程托管静态资源** 的 feature

不适用于：纯文档 / 纯 refactor（无运行时行为）——可裁剪对应步骤。

## 示例：推荐自测清单（按顺序）

### 0. 读输入（5 分钟）

- [ ] `{slug}-design.md` §3 关键场景 + 「明确不做」反向核对项
- [ ] `{slug}-checklist.yaml` 的 `checks` 来源列
- [ ] `.codestable/reference/attention.md` 里的启动入口（`scripts/dev.bat` / `PORT` / 默认 Token）

### 1. 环境就绪

```text
1. 查占用端口（Windows 例：Get-NetTCPConnection -LocalPort 3000）
2. 停止旧 agent-manager-server / cargo run 后台任务
3. cargo build -p agent-manager-server   # 确认 exe 未被占用
4. 若 feature 含前端且 server 托管 dist：npm run build --prefix apps/web
5. 启动服务（开发：APP_ENV=development ADMIN_TOKEN=123456 PORT=3000 cargo run -p agent-manager-server）
6. 探活：GET /api/health → 200 ok
```

**常见误判**：后台 `cargo run` 的 exit code 1 常因 **Stop-Process 杀进程**（Windows 上常为 `0xffffffff`），不代表启动失败。以 **`/api/health` 为准**。

### 2. 观测对齐（有日志型验收点时必做）

- [ ] 确认 `tracing` / 日志过滤器包含**实际打日志的 crate**（例：`app_core=info`），否则 warmup 等 INFO 不可见会被误判为「没执行」。
- [ ] 等待异步后台任务完成（warmup、spawn 等）再测「第二次 GET 应更快」类场景。

### 3. 按 design §3 映射 HTTP 证据

**通用前置**：先 `POST /api/auth/login`（带 session cookie），再测需登录 API。

| 场景类型 | 建议证据 | 注意 |
|---|---|---|
| 读 API / 缓存 | 同一 GET 连续两次，记录耗时差 | CLI 未安装时单次也可能很快，不能单靠耗时 |
| 写 API / refresh | POST body + 200 + 响应 JSON | 非法参数测 400；未登录测 401 |
| 启动 / 预热 | 日志含关键字 + elapsed | 过滤器要先配对 |
| 冷启动 / miss 兜底 | 重启后 **500ms 内** 立即 GET，仍 200 | 需刻意抢在 warmup 之前 |
| 范围守护 | `rg` 禁止项（如 `rusqlite`）+ 未改路径的 GET 仍可用 | settings 类「维持现状」要单独 GET |
| 前端挂载 | `rg` `apps/web/dist` 或 `src` 中新路由/文案 | SPA 路由勿用 `GET /overview` 期望 HTML（会 404） |

PowerShell 下中文 `message` 可能乱码，验收记录优先写 **状态码 + 字段存在**，或 `[Console]::OutputEncoding = utf8`。

### 4. Mutation / 破坏性场景

若本机不宜执行 install / uninstall / daemon：

- acceptance **必须**标为 **L3 代码核对**，并写出函数名（如 `after_agent_mutation`）。
- 在「遗留 / 建议」中写清：**Compose 或 staging 补测项**，不要 silent skip。

### 5. 收尾与落盘

- [ ] 更新 `{slug}-checklist.yaml`：`steps` → done，`checks` → passed（仅对已有证据的项）
- [ ] 写 `{slug}-acceptance.md`：场景表含 **结果 + 证据列 + L1/L2/L3**
- [ ] design §4 要求的 architecture 回写
- [ ] 验收中发现的小 fix（如 log filter）**当场改代码**，在 acceptance「偏差修复」节记录

### 6. 最小 HTTP 冒烟模板（可复制改路径）

```powershell
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/auth/login' -Method POST `
  -ContentType 'application/json' -Body '{"token":"123456"}' -WebSession $session | Out-Null

Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -WebSession $session

# 替换为 design §3 中的 GET/POST
# 负例：未知 scope → 期望 400；未带 cookie → 期望 401
```

## 反例（本次 feature 已踩）

| 现象 | 实际原因 | 应做 |
|---|---|---|
| warmup「没有日志」 | `RUST_LOG` 未含 `app_core` | 启动前核对 filter |
| 后台任务 exit 1 | 验收时手动 kill | 用 health 判断存活 |
| `cargo build` 失败 | 旧 exe 仍运行 | 先停进程再编译 |
| 场景 4–6 写通过但无 HTTP | 只看了代码 | 标 L3 + 遗留 Compose 补测 |
| `/overview` GET 404 | SPA fallback 未走 | 测 API 或浏览器入口 `/` |

## 与 CodeStable 流程的衔接

- **implement 联调步**：按本文 §1–3 跑到 design §3 全覆盖（允许 L3 标注 pending）。
- **accept 阶段**：把 L3 pending 要么补测要么写入遗留；禁止把「没证据」标 passed。
- 更大部署形态差异（Compose 单容器）仍用 `scripts/compose-check.bat` 作 **L1 补充**，不替代 design §3 本地证据。
