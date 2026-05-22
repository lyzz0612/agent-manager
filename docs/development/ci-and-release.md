# CI 与 Release

Workflow 文件位于 **`.github/workflows/`**：

| 文件 | 触发 | 作用 |
|------|------|------|
| `ci.yml` | `push` / `pull_request` → `master`（`tags-ignore: 'v*'`） | **仅测试**（`pnpm -r lint / typecheck / test`） |
| `release.yml` | `push` tag `v*`；`workflow_dispatch` | **发布**；tag 时创建 GitHub Release |
| `_publish-image.yml` | reusable，由 `release.yml` 调用 | 构建并推送单个 `agentops-server` 镜像 tag |

## 触发隔离

- `ci.yml` 的 push 入口已配置 `tags-ignore: ['v*']`，避免 `v*` tag 推送时与 release 重复执行测试。
- `release.yml` **不包含** `run_tests` job；测试只在 `ci.yml`。

## CI（`ci.yml`）

```text
push / PR → master
  → checkout
  → pnpm install --frozen-lockfile
  → pnpm -r --if-present lint
  → pnpm -r --if-present typecheck
  → pnpm -r --if-present test
```

CI 严禁执行 `npm publish` / `docker push` / `gh release create`，workflow 末尾包含一个静态 grep 防呆步骤。

## Release（`release.yml`）

### 入口一：tag `v*`

| 项 | 行为 |
|----|------|
| 版本号 | 从 `github.ref_name` 解析，如 `v0.1.0` → `0.1.0` |
| 发布范围 | **全套**（npm + 三种镜像 + Android + Release） |
| GitHub Release | 自动创建为 **Draft**；全部 publish job 成功后由 `finalize-release` 翻为 Published |
| 测试 | **不跑**（信任 master CI） |

### 入口二：手动 `workflow_dispatch`

| 项 | 行为 |
|----|------|
| `version` | 必填字符串（`0.1.0`），workflow **不修改/不提交** 任何 `package.json` |
| 范围 | 五个 boolean 入参 `publish_npm`、`publish_image_server/web/allinone`、`publish_android` |
| 至少一项 | `prepare` job 强校验，全 false 时立即失败并报 `::error::` |
| GitHub Release | **不创建** |
| Docker `latest*` | **不推送**（只推送 `<version>(-suffix)`），避免 `0.x-rc1` 之类的 dispatch 误更新 latest |
| Android | 仅上传 **Actions Artifact**，不上传 Release 附件 |

### 手动发布参数

| 参数 | 说明 |
|------|------|
| `version` | 必填发布版本字符串 |
| `publish_npm` | 发布 `@lyzz0612/agentops-runner@<version>` |
| `publish_image_server` | 镜像 tag `<version>` |
| `publish_image_web` | 镜像 tag `<version>-web` |
| `publish_image_allinone` | 镜像 tag `<version>-allinone` |
| `publish_android` | 构建 APK 上传到 Actions Artifact |

### Workflow Summary

`prepare` step 会向 `$GITHUB_STEP_SUMMARY` 输出本次发布的版本、触发来源与 5 个 publish flag，便于 review。`finalize-release` 也会输出 Release 是否被 publish，以及失败 job 列表。

### Release Body 模板

`.github/release-body.md` 是 release 正文模板，使用 `envsubst` 渲染下列变量：

| 变量 | 含义 |
|------|------|
| `$VERSION` | 解析出的版本号（如 `0.1.0`） |
| `$REPO_LOWER` | 仓库小写完整名（如 `lyzz0612/agent-manager`） |
| `$RUN_URL` | 当前 workflow run 的 URL，便于追溯 |

### Release 失败策略

| 情况 | Release 状态 |
|------|----------------|
| `release-draft` + 所有 `publish-*` job 全部 success | `finalize-release` 调用 `gh release edit --draft=false` → **Published** |
| 任一 publish job 失败 / 取消 | 保留 **Draft** 状态；`finalize-release` 输出失败 job 表格并以 `exit 1` 标红，提示人工核对后手动 publish |

### 版本与仓库

- Release workflow **不提交**版本号到 git。
- npm 发布前在 CI 工作区执行 `npm pkg set version=<version>`，**仅修改运行时文件**，不会 push 回仓库。
- 若需 npm 与 git 中的 `cli/package.json` 完全同步，由维护者本地改完再合并，再打 tag。

## Secrets

`release.yml` 用到的 secret：

| Secret | 用途 | 必需 |
|--------|------|------|
| `NPM_TOKEN` | `npm publish @lyzz0612/agentops-runner`（自动登录到 npmjs.org） | 仅 `publish_npm=true` 时 |
| `GITHUB_TOKEN` | 默认注入；workflow 已声明 `contents: write` + `packages: write`，用于 GHCR push、`gh release create/edit/upload` | 总是 |
| `ANDROID_KEYSTORE_BASE64` | base64 编码的 release keystore 文件 | 仅 `publish_android=true` 时；缺省会回退为 unsigned/debug 构建并打 `::warning::` |
| `ANDROID_KEYSTORE_PROPERTIES` | `storeFile=app/release.keystore` 等 gradle keystore 配置文本 | 同上 |

CI workflow（`ci.yml`）**不需要**任何 secret。

### 配置 Secrets 的步骤

1. 仓库 → Settings → Secrets and variables → Actions → "New repository secret"。
2. `NPM_TOKEN`：在 npmjs.com 创建 Automation Token，粘贴值。
3. `ANDROID_KEYSTORE_BASE64`：本地 `base64 -w0 release.keystore | clip`，粘贴值。
4. `ANDROID_KEYSTORE_PROPERTIES`：示例：
   ```properties
   storeFile=app/release.keystore
   storePassword=...
   keyAlias=...
   keyPassword=...
   ```

### 仓库权限设置

- Repository Settings → Actions → General → "Workflow permissions"：选 **Read and write permissions**（已通过 workflow YAML 声明 `contents: write` / `packages: write`，此处只是兜底）。
- Settings → Packages：确认 `ghcr.io` 接收推送（默认开启）。

## Dry Run / 测试 tag 验证

正式发布前推荐至少做一次"非破坏性演练"，覆盖 release workflow 的解析路径与 job 走向：

### 1. 使用预发布 tag（推荐）

在 fork 或私有 fork 上：

```bash
git checkout master
git tag v0.0.0-rc.1
git push origin v0.0.0-rc.1
```

观察 Actions：

- `prepare` 应解析 `version=0.0.0-rc.1`、`is_tag=true`、五个 flag 全为 true。
- `release-draft` 创建 Draft `v0.0.0-rc.1`。
- 若仓库还没有 Dockerfile / `client/android`，对应 publish job 会**显式失败**并打印路径。
- `finalize-release` 输出失败矩阵，Release 保留 Draft → 在 GitHub UI 删除该 Draft 即可。

> 这是当前阶段验证 workflow 拓扑的最佳方式；不会污染正式 `latest*` 镜像（只发预发版本号）。

### 2. 使用 `workflow_dispatch` 走干净路径

- 在 Actions → Release → "Run workflow"。
- `version` 填 `0.0.0-dryrun`，**只勾**最少风险的产物（如只勾 `publish_image_server`）。
- 不勾任何项时应当看到 `prepare` 立即失败，提示"至少选择一项"。

### 3. 真正发布前

确保以下都已成功：

- `master` 最新 commit 的 `ci.yml` ✅。
- `_publish-image.yml` 引用的 `server/Dockerfile{,.web,.allinone}` 均已合入。
- `client/android/` 已经过 `expo prebuild` 或保留在仓库。
- 在 Settings → Secrets 中已配置 `NPM_TOKEN`，需要 Android 时配置 keystore 系列。

```bash
git checkout master
git pull
git tag v0.1.0
git push origin v0.1.0
```

`finalize-release` 全绿后 Release 会自动 publish。

## 实现状态

- [x] `.github/workflows/ci.yml`
- [x] `.github/workflows/release.yml`
- [x] `.github/workflows/_publish-image.yml`（reusable）
- [x] `.github/release-body.md`
- [ ] `server/Dockerfile{,.web,.allinone}`（在 docker dev/testing 变更里实现）
- [ ] `client/android/`（在 client-management-ui 或 docker dev/testing 变更里实现，Expo prebuild）
- [ ] Android keystore secret（部署时配置）

命名与镜像 tag 约定见 [Docker 镜像](../operations/docker-images.md)。
