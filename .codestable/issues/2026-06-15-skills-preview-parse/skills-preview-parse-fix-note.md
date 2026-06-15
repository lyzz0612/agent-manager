---
doc_type: issue-fix
issue: 2026-06-15-skills-preview-parse
status: confirmed
summary: 修复 VPS 单容器部署下 Skills CLI preview 解析失败与错误乱码
tags: [skills-cli, preview, docker]
---

# Skills Preview 解析失败 Fix Note

## 根因

`skills_cli.rs` 的 `cli_env()` 注入 `CI=true`，Skills CLI 在 CI 模式下用 Unicode 框线字符 `│` 输出表格；`parse_skill_name_line` / `parse_skill_description_line` 的正则只匹配 ASCII `|`。CLI 执行成功但解析结果为空，触发「无法获取 skill 列表」。错误摘要取 CLI 首行 spinner/框线字符，前端显示为乱码。

## 修复

**文件**：`crates/cursor-provider/src/skills_cli.rs`

1. 解析前将 `│` 等框线字符规范为 `|`，放宽 name/desc 行空格匹配以兼容 CI 与非 CI 两种表格缩进。
2. 扩展 `strip_ansi` 正则，剥离 `[?25l` 等 TTY 控制序列。
3. `summarize_cli_output` 跳过 spinner/进度行，优先返回含 error/failed 的语义行。

## 验证

- [x] `cargo test -p cursor-provider skills_cli` 通过（含 CI 格式输出样例）
- [ ] VPS 单容器：Skills 页 → 安装 → 输入 `https://github.com/liuzhengdongfortest/CodeStable` → 预览应返回 26 个 skill
- [ ] 失败场景错误信息应为可读英文/中文，非框线乱码

## 部署

需重新构建并发布镜像后 VPS 拉取新 tag 生效。
