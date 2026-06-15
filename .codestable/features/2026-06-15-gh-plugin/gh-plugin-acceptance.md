# GitHub CLI 插件 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-15
> 关联方案 doc：`.codestable/features/2026-06-15-gh-plugin/gh-plugin-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：
- [x] `GET /api/gh/account` → `GhAccountStatus`（`host-model` + `gh-provider::account_status`）：字段 `logged_in` / `username` / `hostname` / `note` 与 design 一致
- [x] `POST /api/gh/login/start` → `GhLoginStartResult`：含 `device_code` 字段；`gh-provider::start_login` 返回结构匹配
- [x] `GET /api/gh/login/status` → `GhLoginSessionStatus`：`active` / `auth_url` / `device_code` / `message` / `error`
- [x] `GET /api/plugins` 含 gh：`host-fs::SUPPORTED_PLUGINS` 注册 `id: gh`，`app-core::collect_plugin_summaries` 合并 gh 列表

**名词层「现状 → 变化」逐项核对**：
- [x] Plugin 注册：`SUPPORTED_PLUGINS` 追加 gh，`plugin_home_dir` 特判 `~/.config/gh`
- [x] Plugin 生命周期：`app-core` 按 `plugin_id` 路由至 `gh-provider` / `paseo-provider`
- [x] `PluginDetail` 对 gh 填空 Paseo 专有字段：`gh-provider::plugin_detail`

**流程图核对**（第 2.2 节 mermaid）：
- [x] `GET /plugins/gh` → `app-core::plugin_detail` → `gh-provider::plugin_detail`
- [x] `GET /gh/account` → `gh_account_status` → `gh auth status`
- [x] `POST /gh/login/start` → `spawn_login_process` + stdout 解析
- [x] `GET /gh/login/status` → `login_session_status`
- [x] `POST /gh/logout` → `gh auth logout --hostname github.com --yes`

验收中修复偏差：`gh auth login` 子进程原无 10 分钟超时，已在 `spawn_login_process` 用 `try_wait` + `LOGIN_TIMEOUT` 补齐（对齐 design 2.2 流程级约束）。

## 2. 行为与决策核对

**需求摘要逐项验证**：
- [x] Plugins 列表含 gh 卡片：前端 `PluginsPage` 渲染 `list_plugins` 结果；后端注册已落地
- [x] 安装/升级/卸载：`gh-provider::install_gh` 从 GitHub releases API 拉官方包
- [x] 详情授权 UI：`GhPluginDetailView` 对标 Cursor 账号 tab

**明确不做逐项核对**：
- [x] 无 `with-token` / PAT UI（grep 无命中）
- [x] 无 GHE hostname 表单（grep 无 enterprise 配置 UI）
- [x] 无 `gh repo` / PR 业务入口（grep 无命中）
- [x] `/api/cursor/*` 路由未改语义（仅新增 `/api/gh/*`）

**关键决策落地**：
- [x] 仅 github.com：`GH_HOSTNAME` 常量 + CLI `--hostname github.com`
- [x] Web device flow：`BROWSER=false` + `--web` + `device_code` 解析
- [x] `gh-provider` 独立 crate + `app-core` 路由
- [x] `/api/gh/*` 平行 `/api/cursor/*`

**编排层变化**：
- [x] 安装路径：tarball/zip → `~/.local/share/gh` → `~/.local/bin/gh`
- [x] 授权路径：后台 spawn + 轮询 session；前端 2s 轮询
- [x] `RuntimeCache::gh_account` + `RefreshScope::GhAccount`

**流程级约束**：
- [x] 登录超时 10 分钟：验收中已补 `try_wait` 循环 + `child.kill()`
- [x] session 互斥：`login_session` mutex，active 时复用 session
- [x] logout 幂等：未登录返回友好 `ActionMessage`，不 500
- [x] 可观测：`info!` on install / login complete

**挂载点反向核对**：
- [x] `host-fs::SUPPORTED_PLUGINS` + `gh_cli_install_command` ✓
- [x] `crates/gh-provider/` ✓
- [x] `app-core` plugin/gh 委托与缓存 ✓
- [x] `apps/server` `/api/gh/*` 五条路由 ✓
- [x] `GhPluginDetailView` + `PluginsPage` 分支 ✓
- [x] `Dockerfile` 未预装 gh ✓

**grep 反向核查**：`gh-provider`、`/gh/`、`GhPluginDetailView`、`GH_PLUGIN_ID` 均落在上述挂载点；`PluginProviderRef` 为 app-core 内部路由辅助，拔除时随 app-core 一并移除。

**拔除沙盘**：移除 `SUPPORTED_PLUGINS` gh 项、删除 `gh-provider`、删 `/api/gh` 路由与 UI 分支后，feature 在用户视角消失；`~/.config/gh` 按设计保留。

## 3. 验收场景核对

- [x] **S1** `GET /api/plugins` 含 gh：`host-fs` 注册 + 代码路径确认；**活体验证需重启 dev 服务**（当前运行实例为旧二进制，仅返回 paseo）
- [x] **S2** 未安装展示 `install_command`：`PluginsPage` 卡片逻辑 + `install_command` 字段
- [x] **S3** 安装：`gh-provider::install_gh` 实现完整；**手工**：重启服务后点安装验证 `gh --version`
- [x] **S4** 详情为授权 Panel：`pluginId === "gh"` → `GhPluginDetailView`（`tsc` + 代码审查）
- [x] **S5** 登录展示 device URL/验证码：`GhPluginDetailView` + `start_login` 解析
- [ ] **S6** 外部浏览器完成授权后自动已登录：**需用户重启服务后手工 device flow**（验收环境未跑通 live 登录）
- [x] **S7** 注销：`logout_gh` + `gh auth logout`；逻辑与 Cursor 对称
- [x] **S8** 未安装时 `start_login` → `started: false` + 提示先安装：`gh-provider::start_login` 首行检测
- [x] **S9** 卸载保留 config：`uninstall_plugin` 删二进制与 install root，不删 `~/.config/gh`
- [x] **S10** `gh_account` 缓存刷新：`RefreshScope::GhAccount` + `cacheRefresh.ts` scope

**前端浏览器验证**：
- [x] Plugins 列表 / gh 详情 UI 结构：`npm run build:web` 通过；组件拆分 `GhPluginDetailView` / `PaseoPluginDetailView`
- [ ] **S6 完整 device flow**：需重启 `scripts/dev.bat` 后肉眼确认（阻塞：旧 server 进程）

## 4. 术语一致性

- [x] plugin id `gh`（非 `github` / `github-cli`）：全库一致
- [x] `device_code` / `auth_url` / `GhAccountStatus`：与 design 第 0 节一致
- [x] 禁用词 grep：`with-token`、GHE 配置 UI、PAT 输入无命中

## 5. 架构归并

- [x] `ARCHITECTURE.md` §2 分层图：已补充 Plugin 管理
- [x] `ARCHITECTURE.md` §3 crates：已列 `gh-provider` / `paseo-provider`
- [x] `ARCHITECTURE.md` §4.4 缓存：已含 gh 账号
- [x] `ARCHITECTURE.md` §5.3 **新增**：GitHub CLI 安装与 `/api/gh/*` 契约、边界

## 6. requirement 回写

- [x] 方案 frontmatter 无 `requirement` 字段 → 触发 **backfill**
- [x] 已创建 `.codestable/requirements/gh-plugin.md`（`status: current`）
- [x] 已更新 `VISION.md` 索引

## 7. roadmap 回写

- [x] 方案 frontmatter 无 `roadmap` / `roadmap_item` → **非 roadmap 起头，跳过**

## 8. attention.md 候选盘点

- [x] 候选：开发中若 `agent-manager-server.exe` 被占用，`cargo build` 会失败；改代码后需重启 `scripts/dev.bat` 才能验收新 API。**建议**用户确认后通过 `cs-note` 写入 attention「运行与本地起服务」节。

## 9. 遗留

- **已知限制**：S6 完整 device flow 需重启 dev 服务后手工验证；验收时 live server 仍为旧构建。
- **后续优化**（非本 feature）：`app-core` 抽象 `PluginProvider` trait（design 2.5 观察项）；`PluginDetail` 按 plugin 拆类型。
- **顺手发现**：无

---

**验收结论**：代码与方案对齐；架构与 req 已归并。请 **重启 dev 服务** 后补做 S3/S6 手工 device flow，即可视为全场景闭环。
