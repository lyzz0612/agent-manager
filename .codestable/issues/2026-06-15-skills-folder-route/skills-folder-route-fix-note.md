---
doc_type: issue-fix
issue: 2026-06-15-skills-folder-route
status: confirmed
summary: 修复通用 Skills 文件夹路由将完整 id 写入 URL 导致文件列表无法加载
tags: [skills, routing, frontend]
---

# Skills 文件夹路由错误 Fix Note

## 根因

`skill.id` 为 API 格式 `common/cs-brainstorm`，但 `SkillsPage` 导航时把完整 id 作为 URL 的 `folderId` 传入 `buildSkillsPath(scope, skill.id)`。scope 已在路径中，导致 URL 变成 `/skills/common/common%2Fcs-brainstorm`。

- 页面标题匹配 `skill.id === folderId` 失败，显示 `common%2Fcs-brainstorm`
- 请求 `/api/profile/skills/{folderId}/files` 时 id 错误，文件列表为空

磁盘路径 `~/.agents/skills` 由后端 `agent_skills_root` 正确映射，问题仅在前端路由。

## 修复

**文件**：`apps/web/src/routing.ts`、`apps/web/src/pages/SkillsPage.tsx`

1. URL 中 folder/file 使用短名（`cs-brainstorm`、`SKILL.md`）
2. 新增 `buildSkillApiFolderId` / `buildSkillApiFileId` 调 API 时拼回完整 id
3. `parseRoute` 对 path segment 做 `decodeURIComponent`，兼容旧链接

## 验证

- [ ] `npm run typecheck`（web）通过
- [ ] 通用 tab → 点击 skill 文件夹 → URL 为 `/skills/common/cs-brainstorm`
- [ ] 文件列表正常展示，`SKILL.md` 等可打开编辑
