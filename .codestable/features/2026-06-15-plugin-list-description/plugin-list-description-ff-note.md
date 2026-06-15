---
doc_type: feature-ff-note
feature: plugin-list-description
date: 2026-06-15
requirement:
tags: [plugin, ui]
---

## 做了什么

Plugins 列表卡片在名称下方展示各插件的简短描述，帮助用户未安装时也能快速了解用途。

## 改了哪些

- `crates/host-fs/src/lib.rs` — `PluginDefinition` 增加 `description` 静态文案
- `crates/host-model/src/lib.rs` — `PluginSummary` 增加 `description` 字段
- `crates/gh-provider/src/lib.rs`、`crates/paseo-provider/src/lib.rs` — `plugin_summary` 填充 description
- `apps/web/src/types.ts` — 前端类型对齐
- `apps/web/src/pages/PluginsPage.tsx` — 列表卡片渲染描述
- `apps/web/src/styles.css` — `.agent-card__description` 样式

## 怎么验证的

`cargo check`（host-fs / host-model / gh-provider / paseo-provider）与 `tsc --noEmit` 通过。
