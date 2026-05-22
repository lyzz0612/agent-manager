# 测试策略

## 分层

```text
┌─────────────────────────────────────────┐
│ 单元测试                                 │
│ 解析、状态机、schema；可用 mock           │
└─────────────────┬───────────────────────┘
                  ▼
┌─────────────────────────────────────────┐
│ 集成测试（agentops-runner 包内定义）      │
│ 真 detect / install / doctor；装谁、     │
│ Linux 是否 skip Cursor 等由用例决定      │
└─────────────────┬───────────────────────┘
                  ▼
┌─────────────────────────────────────────┐
│ 端到端（可选，实现阶段）                  │
│ Server + Client + Runner 联调脚本        │
└─────────────────────────────────────────┘
```

## 共识

| 项 | 约定 |
|----|------|
| Mock | **仅**用于单元测试；集成/E2E **不以 mock adapter 作为主路径** |
| 装哪些 agent | 属于 **`agentops-runner` 测试用例**设计，不在 workflow 里做 matrix |
| 本机开发 | 通过 Web/CLI 触发 **真实** install；状态在 `.agentops-dev` 或 Runner 容器卷 |
| GitHub Actions | 在 `ubuntu-latest` 上 **直接** `pnpm test`（不为此再包一层 Docker） |
| 脚本复用 | `scripts/smoke.sh`、`scripts/test-integration.sh` 等供本机与 CI 共用（实现阶段添加） |

## CI 与发版

- **push / PR → `master`**：只跑 `ci.yml`（lint、单元、集成）。
- **tag / 手动 release**：**不**在 `release.yml` 里跑测试；默认信任合并进 master 时 CI 已通过。
- 若对旧 commit 打 tag 且跳过 CI，可能无测试发版——发版流程不重复兜底。

详见 [CI 与 Release](./ci-and-release.md)。

## 实现阶段待补

- `packages/runner`（或等价包）内 per-agent 测试与 `skip` 条件
- CI 内 `AGENTOPS_HOME=$RUNNER_TEMP/...` 与安装后清理
- 平台支持矩阵（例如某 agent 在 Linux CI 不可用时的文档说明）
