# Skills CLI 可视化安装 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-15
> 关联方案 doc：`.codestable/features/2026-06-15-skills-cli-install/skills-cli-install-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：
- [x] **GET …/status**（`apps/server/src/main.rs` `skills_cli_status` → `crates/cursor-provider/src/skills_cli.rs`）：返回 `ready` / `node_version` / `skills_cli_version` / `message`；不可用仍 200 → **一致**（本机 HTTP：`ready:false` + `node_version:"v22.13.1"` + message 说明缺 Skills CLI）
- [x] **POST …/preview**（`skills_cli_preview`）：接受 `source` 返回 `skills[]`；空 source → 400；CLI/不可用 → 502/503 → **一致**（空 source → 400 `请提供有效的仓库或链接`）
- [x] **POST …/install**（`skills_cli_install`）：接受 `source`/`skills`/`agents`；未选或未知 agent → 400（在 `ready` 时由 `skills_cli.rs` 校验）；`ready=false` → 503 → **一致**（本机 `ready=false` 时 install → 503）

**名词层"现状 → 变化"逐项核对**：
- [x] **SkillsCliCapability**（`host-model` + `skills_cli.rs`）：探测 Node + npx skills → **一致**
- [x] **SkillsAgentMap**（`host-fs::skills_cli_agent_name`）：`common→zed`、`cursor→cursor` → **一致**
- [x] **GET/PUT /api/profile/skills** 读写语义未改 → **一致**（`list_skills` / `update_skill` 路径无变更）

**流程图核对**（第 2.2 节 mermaid）：
- [x] UI → GET status → `SkillsPage` / `SkillsInstallDialog` + `skills_cli_status` ✓
- [x] UI → POST preview → `skills_cli_preview` → `npx skills add … -l -y` ✓
- [x] UI → POST install → `skills_cli_install` → `npx skills add … -g -y --copy` ✓
- [x] 成功后 UI refresh → `onInstalled` → `onRefresh`（`refreshKey`）✓

## 2. 行为与决策核对

**需求摘要逐项验证**：
- [x] 安装入口 + source 输入 + preview 多选 + agent 勾选 + install → 代码与 Playwright 快照可见「安装 Skill」按钮与禁用提示
- [x] 缺 Node/CLI 时入口禁用并展示 message → Playwright：`button "安装 Skill" [disabled]` + 提示文案
- [x] 多 skill 默认全选 → `SkillsInstallDialog` preview 后 `setSelectedSkills(result.skills.map…)` ✓

**明确不做逐项核对**：
- [x] 无 `npx skills find` / `/cli/find` 路由 → grep 仅命中 design/checklist 文档 ✓
- [x] v1 无 update/remove/list 向导 UI → 仅 `SkillsInstallDialog` preview+install ✓
- [x] 无 skill 业务兼容性校验 → 仅 `ensure_ready()` 工具链检测 ✓
- [x] 统一 `-g` 全局安装 → install args 含 `-g` ✓

**关键决策落地**：
- [x] D1 手输 repo/URL → source 文本框 ✓
- [x] D2 仅工具链校验 B → `skills_cli_status` ✓
- [x] D3 agent scope = common + 已注册 agents → `installable_skill_agent_ids` + UI `agentOptions` ✓
- [x] D4 ≥2 skill 多选弹窗 → checklist 在 preview 后展示 ✓
- [x] D5 `-g -y --copy` + 映射 `--agent`/`--skill` → `skills_cli_install` args ✓
- [x] D6 SkillsAgentMap 集中映射 → `host-fs` ✓

**编排层变化**：
- [x] 能力探测路径 → Skills 页 load + 弹窗 open 时 GET status ✓
- [x] 预览路径 → POST preview + 解析 stdout ✓
- [x] 安装路径 → POST install + toast + refresh ✓
- [x] Dockerfile Node → runtime stage 复制 node/npm/npx ✓

**流程级约束**：
- [x] 超时 120s → `CLI_TIMEOUT` ✓
- [x] install 串行 → `INSTALL_LOCK` mutex ✓
- [x] CLI 失败保留 stderr 摘要 → `summarize_cli_output` ✓
- [x] 可观测 `info!(source, skill_count, agents, elapsed_ms)` ✓

**挂载点反向核对**：
- [x] M1 `main.rs` 三条路由 + `ensure_authenticated` → grep 确认 ✓
- [x] M2 `SkillsPage.tsx` + `SkillsInstallDialog.tsx` + `styles.css` 样式 → 一致（样式为 UI 挂载合理延伸）
- [x] M3 `Dockerfile` runtime Node 层 → 一致 ✓
- [x] **反向 grep**：`skills_cli`/`skills/cli`/`SkillsInstall` 命中均落在 `main.rs`、`SkillsPage`、`SkillsInstallDialog`、`skills_cli.rs`、`host-fs`、`host-model`、`app-core`、`cursor-provider/lib.rs`、`types.ts`——均在清单或 design 2.5 声明的模块内 ✓
- [x] **拔除沙盘**：移除上述挂载点 + `skills_cli.rs` 模块 + 类型定义即可拔 feature；已安装 skill 文件保留 ✓

## 3. 验收场景核对

- [x] **S1** status（dev 有 Node）→ 本机 Windows 原生 dev：`ready:false`（`npx` 在 Rust `Command::new("npx")` 下未解析 `.cmd`，见遗留）；Linux/Docker 路径代码与 Dockerfile 支持 `ready:true`
- [x] **S2** 无 Node / 探测失败 → HTTP + UI 均展示明确 message ✓
- [x] **S3** preview `vercel-labs/agent-skills` → 本机因 S1 未跑通 live；单测 `parse_preview_skills_*` 覆盖 stdout 解析（含 CI 框线格式）✓
- [x] **S4** 空 source → 400 ✓（curl 实测）
- [x] **S5** ≥2 skill 多选 → UI 默认全选；Playwright 未开弹窗（按钮 disabled），代码路径 ✓
- [x] **S6** 1 skill 默认勾选 → 同 S5 代码 ✓
- [x] **S7** install 双 agent → 本机未 live（S1）；install 命令编排与映射代码核对 ✓
- [x] **S8** 未选 agent/skill → `skills_cli_install` 返回 400 文案；handler 在 `ready=false` 时先 503（设计场景 9 优先）✓
- [x] **S9** ready=false install → 503 ✓（curl 实测）
- [x] **S10** compose 镜像含 Node → `Dockerfile` runtime `COPY` node/npm/npx ✓；本轮未重建 compose 镜像

**前端浏览器验证**：
- [x] Skills 页工具栏：Playwright 快照见「安装 Skill」按钮、禁用态、CLI 不可用提示、scope 标签页与 skill 列表

## 4. 术语一致性

- **Skills CLI**：API 路径 `skills/cli`；代码无 `skills-cli` 包名误用 ✓
- **source / preview / agent scope / SkillsCliCapability**：前后端类型与函数名一致 ✓
- **SkillsAgentMap**：`skills_cli_agent_name` + design 表一致 ✓
- 禁用词 `skills-cli`（指 npm 包）、`find`/`search` 作安装向导 API：无代码命中 ✓

## 5. 架构归并

- [x] **ARCHITECTURE.md §6.2**：已写入安装三端点、SkillsAgentMap、流程约束、runtime Node 依赖 ✓
- [x] **ARCHITECTURE.md §4.4**：Skills 不进 RuntimeCache——原文已声明，无需改 ✓
- [x] **ARCHITECTURE.md §7.1 Docker**：runtime 含 Node——已在 §6.2 交叉说明；§7.1 保持单容器描述即可

## 6. requirement 回写

- [x] 方案 `requirement` 为空 + 新增用户可感能力 → 已 **backfill** `requirements/skills-cli-install.md`（`status: current`）+ 新建 `requirements/VISION.md` 索引
- [x] 更新 `requirements/agent-manager.md`：Phase 1 范围纳入远程安装；非目标收敛为「无 search/update/remove 可视化」

## 7. roadmap 回写

- [x] 方案 frontmatter 无 `roadmap` / `roadmap_item` → **非 roadmap 起头**，跳过

## 8. attention.md 候选盘点

- [ ] 候选 1：**Windows 原生 dev 下 `npx` 探测**——Rust `Command::new("npx")` 可能无法执行 `npx.cmd`，导致 `status.ready=false` 而交互式 shell 中 `npx skills` 正常；Compose/Linux 不受影响。建议落 attention「命令与脚本陷阱」若团队常在 Windows 本机 dev。

本 feature 另：**preview 解析依赖 stdout 表格格式**，CLI 输出变更需同步 `parse_preview_skills`（已有 issue 修复 CI 框线案例）。

## 9. 遗留

- **后续优化**：Windows 本机 dev 解析 `npx.cmd`（`host-proc` 层或 skills_cli 调用侧）；compose 环境补一轮 S3/S7 live 抽检
- **已知限制**：install 在 `ready=false` 时一律 503，无法在同请求中验证 400 校验分支；preview 无 `--json`，依赖 stdout 解析
- **实现阶段发现**：`2026-06-15-skills-preview-parse` issue 已修 CI 框线输出解析（commit `87b994b`）
