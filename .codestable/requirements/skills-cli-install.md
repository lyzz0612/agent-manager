---
doc_type: requirement
slug: skills-cli-install
pitch: 在管理页里从 GitHub 仓库挑选并安装 skill，不用手敲命令
status: current
last_reviewed: 2026-06-15
implemented_by:
  - ARCHITECTURE
tags: [skills, install, web-ui]
---

# 从远程仓库安装 Skill

## 用户故事

- 作为在 VPS 上维护 Cursor 环境的人，我希望在 Skills 页输入一个 GitHub 仓库地址，就能看到里面有哪些 skill 可以装，而不是自己查文档再跑 `npx skills`。
- 作为要给多个 agent 目录同步 skill 的人，我希望勾选「通用」和「Cursor CLI」后一次装好，装完列表立刻刷新。
- 作为容器里跑管理页的人，我希望运行时缺 Node 或 Skills CLI 时按钮直接禁用并说明原因，而不是点了才静默失败。

## 为什么需要

Phase 1 原本只能浏览和编辑本机已有的 skill 文件夹。要从 vercel-labs 等仓库引入新 skill，得 SSH 进容器手敲 CLI，记不住参数还容易装错目录。Web 向导把「预览 → 多选 → 选 agent → 安装」收成几步点击。

## 怎么解决

Skills 页增加「安装 Skill」入口：输入仓库或链接 → 后端列出可选 skill → 勾选要装的项和要写入的 agent scope → 确认后写入用户级 skill 目录。安装前自动检查 Node 与 `npx skills` 是否可用。

## 边界

- v1 **仅** preview + install，不做搜索（`find`）、更新、卸载的可视化。
- 只校验工具链可用，不校验 skill 与 agent 的业务兼容性。
- 统一全局用户目录（`-g`），不做项目级安装。
- 不负责删除已安装的 skill（原有删除能力若未实现仍不在范围）。

## 变更日志

- 2026-06-15：preview/install API 改为 Command Job 模式（立即返回 `job_id`，结果在 SSE `done.result`）；移除服务端 install mutex，改由全局 `JobRegistry` 单槽互斥。
- 2026-06-15：随 `2026-06-15-skills-cli-install` feature 首次落地（Web 向导 + 三条 `/api/profile/skills/cli/*` 端点 + runtime 镜像含 Node）。
