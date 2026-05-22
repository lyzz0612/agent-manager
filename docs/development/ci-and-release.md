# CI 与 Release

Workflow 文件位于 **`.github/workflows/`**（仅 `master` 分支）。实现阶段创建具体 YAML；本文约定触发条件与行为。

## 文件职责

| 文件 | 触发 | 作用 |
|------|------|------|
| `ci.yml` | `push` / `pull_request` → `master` | **仅测试**（lint、typecheck、`pnpm test`） |
| `release.yml` | `push` tag `v*`；`workflow_dispatch` | **发布**；tag 时创建 GitHub Release |

### 触发隔离

- `ci.yml` 的 `push` 建议 **`tags-ignore: 'v*'`**，避免 tag 推送时与 release 重复跑测试（发版**信任** master 上已通过的 CI）。
- `release.yml` **不包含** `run_tests` job；测试只在 `ci.yml`。

## CI（`ci.yml`）

```text
push / PR → master
    → checkout
    → pnpm install
    → pnpm lint && pnpm typecheck && pnpm test
    → （集成测在 runner 包用例内；Actions 上可为 ubuntu 安装依赖）
```

- **不** `docker build` 测。
- **不** `npm publish` / **不** `docker push`。

## Release（`release.yml`）

### 入口一：tag `v*`

| 项 | 行为 |
|----|------|
| 版本号 | 从 tag 解析，如 `v0.1.0` → `0.1.0` |
| 发布范围 | **全套**（默认，见下表） |
| GitHub Release | **自动创建** |
| 测试 | **不跑**（信任 master CI） |

### 入口二：手动 `workflow_dispatch`

| 项 | 行为 |
|----|------|
| 版本号 | 必填 input（如 `0.1.0`）；**不修改**仓库内 `package.json` |
| 发布范围 | 通过 **boolean 参数**勾选要发的产物 |
| GitHub Release | **从不创建** |
| Artifacts | 勾选 Android 等时 **upload Actions Artifacts**（在 run 页下载） |
| 测试 | **不跑** |

### 手动发布参数（规划）

| 参数 | 说明 |
|------|------|
| `version` | 发布版本字符串 |
| `publish_npm` | 发布 `@lyzz0612/agentops-runner` |
| `publish_image_server` | 镜像 tag `<version>` + `latest` |
| `publish_image_web` | 镜像 tag `<version>-web` + `latest-web` |
| `publish_image_allinone` | 镜像 tag `<version>-allinone` + `latest-allinone` |
| `publish_android` | 构建 APK 等 |

至少勾选一项，否则 workflow 应失败。

### tag 默认全套产物

| 产物 | 说明 |
|------|------|
| npm | `@lyzz0612/agentops-runner@<version>` |
| Docker | `agentops-server` 三种 tag + 对应 `latest*` |
| Android | 构建并作为 **Release 附件**；手动发版时为 **Artifact** |
| GitHub Release | 见下文 |

预发布 tag（如 `v0.2.0-beta.1`）**无特殊流程**，与正式 tag 相同全套发布。

## GitHub Release（仅 tag）

| 情况 | Release 状态 |
|------|----------------|
| 全部 publish job 成功 | **Published** |
| 任一 publish job 失败 | 仍创建 Release，状态为 **Draft**，人工核对后 Publish |

Release 内容建议包括：

- `generate_release_notes: true`（可选）
- 固定模板：Docker pull、npm install 命令
- 附件：Android APK 等（由 publish job 上传）

权限：`contents: write`（创建 Release、上传 assets）；镜像 push 需 `packages: write`。

## 版本与仓库

- 发版 job **不提交**版本号到 git；版本以 **tag / 手动 input** 为准。
- 若需 npm 与 git 一致，由维护者在本地自行改 `package.json` 后合并，再打 tag。

## Secrets（release）

| Secret | 用途 |
|--------|------|
| `NPM_TOKEN` | 发布 `@lyzz0612/agentops-runner` |
| `GITHUB_TOKEN` | Release、ghcr push（权限在 workflow 声明） |
| Android 相关 | keystore 等（实现阶段按需） |

CI job 不需要 `NPM_TOKEN`。

## 实现清单

- [ ] `.github/workflows/ci.yml`
- [ ] `.github/workflows/release.yml`
- [ ] `scripts/` 与 runner 集成测试
- [ ] Release body 模板

命名与镜像 tag 见 [Docker 镜像](../operations/docker-images.md)。
