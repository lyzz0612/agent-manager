---
doc_type: requirement
slug: gh-plugin
pitch: 在管理页安装 GitHub CLI 并完成 GitHub.com 网页授权，不用 SSH 手敲 gh auth
status: current
last_reviewed: 2026-06-15
implemented_by:
  - ARCHITECTURE
tags: [plugin, gh, github-cli, auth]
---

# GitHub CLI 插件与授权

## 用户故事

- 作为在容器里运维 agent 环境的人，我希望在 Plugins 页一键安装官方 `gh`，而不是自己找 release 包解压。
- 作为 headless 服务器上的部署者，我希望在网页里发起 GitHub.com 登录、看到 device 验证码和链接，在外部浏览器完成授权后回到页面即显示已登录用户名。
- 作为需要切换账号的人，我希望在插件详情页点「注销」即可退出 GitHub.com，无需记 CLI 参数。

## 为什么需要

Phase 1 已有 Paseo 等 Plugin 的安装生命周期，但缺少 GitHub 官方 CLI 与授权管理。许多后续自动化（PR、release、Actions）依赖 `gh` 且需 OAuth 登录；SSH 进容器跑 `gh auth login` 在 headless 环境体验差且难审计。

## 怎么解决

Plugins 页注册 **GitHub CLI** 插件：支持安装/升级/卸载；详情页对标 Cursor「账号」tab，通过 Web device flow 管理 GitHub.com 授权（登录状态、用户名、登录、注销）。

## 边界

- v1 **仅** GitHub.com，不支持 GitHub Enterprise Server。
- **仅** Web device flow，不支持 PAT 粘贴登录。
- **仅** 授权管理 UI，不做 repo / PR / issue 等业务操作界面。
- 不编辑 `~/.config/gh` 配置文件；卸载保留用户配置目录。

## 变更日志

- 2026-06-15：随 `2026-06-15-gh-plugin` feature 首次落地（`gh-provider` crate + `/api/gh/*` + `GhPluginDetailView`）。
