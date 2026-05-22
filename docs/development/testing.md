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
│ 端到端 / smoke                           │
│ Server + Client + Runner 闭环 +          │
│ all-in-one 镜像基础连通                  │
└─────────────────────────────────────────┘
```

## 共识

| 项 | 约定 |
|----|------|
| Mock | **仅**用于单元测试；集成/E2E **不以 mock adapter 作为主路径** |
| 装哪些 agent | 属于 **`agentops-runner` 测试用例**设计，不在 workflow 里做 matrix |
| 本机开发 | 通过 Web/CLI 触发**真实** install；状态在 `.agentops-dev` 或 Runner 容器卷 |
| GitHub Actions | 在 `ubuntu-latest` 上 **直接** `pnpm test`（不为此再包一层 Docker） |
| 脚本复用 | `scripts/test-runner-integration.mjs`、`test/smoke/*.mjs` 等供本机与 CI 共用 |

## 脚本

| 命令 | 用途 | 何时使用 |
|------|------|----------|
| `pnpm test` / `pnpm test:unit` | 各 workspace 子包的 `vitest` / `node --test` | 默认；CI |
| `pnpm test:runner:integration` | 调用 `scripts/test-runner-integration.mjs`，跑 cli 包的 per-agent 集成用例 | 本机 / CI；默认全 skip |
| `pnpm smoke` | `test/smoke/server-client-runner.mjs`：进程内启 Server，spawn 真 Runner CLI，验证注册闭环 | 本机；release smoke |
| `pnpm smoke:allinone` | `test/smoke/allinone.mjs`：build allinone 镜像，docker run，验证 `/healthz` 和未预装 Cursor/Codex/Claude Code | 本机；release smoke |

### Runner 集成测试 skip 条件

`cli/test/integration/*.test.ts` 内每个 adapter 单独检查 `AGENTOPS_E2E_AGENTS`：

```bash
# 默认全部 skip（CI 与开发机的默认行为）
pnpm test:runner:integration

# 仅运行 cursor
AGENTOPS_E2E_AGENTS=cursor pnpm test:runner:integration

# 全跑（仅本机；CI 默认不允许，因为会真改宿主机）
AGENTOPS_E2E_AGENTS=all pnpm test:runner:integration
```

平台 skip：每个 adapter 根据 `process.platform` 决定是否跳过（例如 Linux 上 Cursor 桌面端不可用时直接 skip 并打印原因）。

## Smoke 工作流

### `pnpm smoke`（Server + Client + Runner）

```text
1. 启动 Server (in-memory SQLite)
2. spawn `agentops-runner login` → 获取 runnerToken
3. spawn `agentops-runner daemon` → WebSocket 注册
4. 轮询 Server，断言至少 1 个 machine 已注册
5. 退出 + 清理临时 AGENTOPS_HOME
```

### `pnpm smoke:allinone`

```text
1. docker build -f server/Dockerfile.allinone -t agentops-server:smoke-allinone .
2. docker run -d -p 18080:4000 -e AGENTOPS_TOKEN=...
3. wait for /healthz; 调 /api/auth/check 验证 token 链
4. docker exec 验证 cursor / codex / claude-code / claude 均不在 PATH
5. docker exec 验证 /app/cli/bin/agentops-runner.mjs 存在
6. docker rm -f
```

> 若本机没有 Docker，`smoke:allinone` 会打印一条日志后 **以 0 退出**（视为 skip），便于在没有 Docker 的开发机也能跑全部 `pnpm` 脚本。

## CI 与发版

- **push / PR → `master`**：只跑 `ci.yml`（lint、单元、集成默认 skip 真 agent）。
- **tag / 手动 release**：**不**在 `release.yml` 里跑测试；默认信任合并进 master 时 CI 已通过。
- 若对旧 commit 打 tag 且跳过 CI，可能无测试发版——发版流程不重复兜底。

CI 中调用：

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm -r --if-present lint
- run: pnpm -r --if-present typecheck
- run: pnpm test
# 可选：
- run: pnpm test:runner:integration   # 默认 skip 所有 adapter
```

CI 不在 Docker 里跑测试（除非未来增加跨平台矩阵），保持本机 / CI 共用同一套命令。

详见 [CI 与 Release](./ci-and-release.md)。

## 实现阶段已落地

- ✅ `scripts/test-runner-integration.mjs`：临时 `AGENTOPS_HOME` 隔离
- ✅ `cli/test/integration/{cursor,codex,claude-code}-adapter.test.ts`：`AGENTOPS_E2E_AGENTS` opt-in
- ✅ `test/smoke/server-client-runner.mjs`：进程内 Server + 真 Runner CLI
- ✅ `test/smoke/allinone.mjs`：镜像 build + run + 反注入校验
