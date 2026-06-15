---
doc_type: learning
track: pitfall
date: 2026-06-15
slug: windows-npx-cmd-subprocess
component: host-proc / skills-cli
severity: medium
tags: [windows, npx, subprocess, skills-cli, dev]
related_feature: 2026-06-15-skills-cli-install
related_issue:
---

# Windows 下 Rust 子进程调不到 `npx`

## 问题

在 Windows 本机 dev 环境，`GET /api/profile/skills/cli/status` 返回 `ready: false`（`node_version` 有值，`skills_cli_version` 为 null），Skills 页「安装 Skill」按钮被禁用；但同一终端里手动执行 `npx skills --version` 正常。

## 症状

- HTTP：`{"ready":false,"node_version":"v22.x.x","skills_cli_version":null,"message":"未检测到 Skills CLI，请确认 npx skills 可用"}`
- Playwright / 浏览器：按钮 disabled + 同上提示
- 交互式 shell：`npx skills --version` → 正常输出版本号
- **Linux / Docker runtime 不受影响**（镜像内 `npx` 为 ELF 可执行文件，无 `.cmd` 后缀问题）

## 没用的做法

- 反复重启 `cargo run` 或重装 Node——`node -v` 一直正常，问题不在 Node 安装
- 仅看前端或 API 契约——接口行为符合 design，是子进程启动失败被当成「CLI 不可用」
- 在 acceptance 里标「已知偏差暂不处理」——Windows dev 会长期误判，后续 feature 凡调 `npx`/`npm` 都会中招

## 解法

**短期（验收 / 自测）**

1. 用 **Compose 或 Linux 环境** 验证 `ready: true` 与 preview/install 全链路（与线上一致）
2. Windows 本机若必须测 CLI：确认 `where npx` 返回 `npx.cmd`；在 `host-proc` 或调用侧对 Windows 解析 `program.cmd`（或 `cmd /c npx …`）后再跑探测

**长期（代码）**

在 `host-proc::run_command_capture_with_env_timeout` 统一处理 Windows 可执行文件解析：`npx` → 先试 `npx.exe` / `npx.cmd`，`npm` 同理。`node` 已是 `.exe` 故不受影响。

## 为什么有效

Windows 上 `Command::new("npx")` **不会**像 cmd/PowerShell 那样自动解析 `PATHEXT` 里的 `.cmd`；`CreateProcess` 需要完整文件名或显式走 shell。Linux 无此差异。

实测 PATH：`D:\nvm\nodejs\npx`（无扩展名脚本）+ `npx.cmd`；Rust 直接 `new("npx")` 失败 → `read_command_version` 返回 `None` → `ready: false`。

## 预防

- **implement / accept 测 CLI 能力时**：Windows 本机看到 `ready: false` 先查 `where npx` 与子进程解析，不要先怀疑业务逻辑
- **新增 `run_command_*` 调用方**：凡程序名是 `npx` / `npm` / `yarn` 等 Node 生态命令，默认走 `host-proc` 统一解析，禁止在各 crate 散落 workaround
- **验收证据分级**：Windows 上 status/preview/install 的 L1 证据可标注「环境限制，Compose 补测」——参见 `compound/2025-06-15-learning-feature-self-test-workflow.md` L1/L3 区分
- 若团队主要在 Windows 本机 dev：考虑把该条写入 `attention.md`「命令与脚本陷阱」（需用户确认后 `cs-note` 追加）
