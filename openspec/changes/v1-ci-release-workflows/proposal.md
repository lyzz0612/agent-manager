## 为什么

v1 需要明确的 GitHub Actions 边界：日常 push / PR 只做自动测试，tag 和手动触发才做打包发布。这样可以保持开发迭代快，同时让 npm、Docker、Android 和 GitHub Release 的发布流程可重复、可审计。

## 变更内容

- 新增 `.github/workflows/ci.yml`，在 push / PR 到 `master` 时执行 lint、typecheck 和测试。
- CI 不做 Docker build、不发布 npm、不 push 镜像。
- 新增 `.github/workflows/release.yml`，仅由 `v*` tag 或 `workflow_dispatch` 触发。
- tag 发版默认发布全套产物：npm Runner、三种 `agentops-server` 镜像 tag、Android APK，并创建 GitHub Release。
- 手动发版通过 boolean 参数选择发布范围，不创建 GitHub Release，Android 等产物上传为 Actions Artifacts。
- release workflow 不重复跑测试，信任 master 的 CI 结果。
- 预发布 tag 无特殊流程，按普通 `v*` tag 发布。
- GitHub Release 在全成功时发布，任一发布失败时保留 Draft 供人工核对。

## 功能 (Capabilities)

### 新增功能

- `ci-release-workflows`: push / PR 自动测试、tag / 手动发布、npm Runner 发布、Docker 镜像发布、Android 产物和 GitHub Release。

### 修改功能

## 影响

- 新增 GitHub Actions workflow。
- 新增发布脚本、Release body 模板和构建参数。
- 需要配置 `NPM_TOKEN`、GitHub packages 权限和 Android 签名相关 secret。
- 影响 Docker 镜像 tag、npm 包版本和 Android Artifact 产出方式。
