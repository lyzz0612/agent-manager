## 新增需求

### 需求:CI 自动测试
仓库必须提供 `ci.yml`，在 push / PR 到 `master` 时运行 lint、typecheck 和测试。

#### 场景:Push 到 master
- **当** 有代码 push 到 `master`
- **那么** GitHub Actions 必须运行 CI 测试 workflow

#### 场景:CI 不发布
- **当** CI workflow 运行
- **那么** workflow 禁止发布 npm、push Docker 镜像或创建 GitHub Release

### 需求:Release 触发
仓库必须提供 `release.yml`，仅由 `v*` tag 或手动 `workflow_dispatch` 触发发布。

#### 场景:推送版本 tag
- **当** 用户推送 `v*` tag
- **那么** release workflow 必须按 tag 版本执行全套发布

#### 场景:手动触发
- **当** 用户手动触发 release workflow
- **那么** workflow 必须根据输入参数选择发布产物

### 需求:tag 全套发布
tag 发布必须发布 npm Runner、三种 Docker 镜像 tag、Android APK，并创建 GitHub Release。

#### 场景:tag 发布成功
- **当** 所有发布 job 成功
- **那么** GitHub Release 必须为 published 状态并包含 Android 附件

#### 场景:tag 发布失败
- **当** 任一发布 job 失败
- **那么** GitHub Release 必须保留为 draft 状态供人工核对

### 需求:手动发布参数
手动发布必须要求填写版本号，并通过 boolean 参数选择 npm、Docker 和 Android 发布范围。

#### 场景:未选择产物
- **当** 手动触发时未选择任何发布产物
- **那么** release workflow 必须失败并提示至少选择一项

### 需求:Release 不重复测试
release workflow 必须禁止执行完整测试流程，并信任 master 上已通过的 CI。

#### 场景:Release workflow 运行
- **当** release workflow 被 tag 或手动触发
- **那么** workflow 禁止运行 `pnpm test` 作为发布前置 job

### 需求:版本来源
发布版本必须来自 tag 或手动输入，release workflow 禁止提交版本号变更到 git。

#### 场景:手动发布
- **当** 用户输入版本号并触发手动发布
- **那么** workflow 必须使用该版本号标记产物且禁止修改并提交 `package.json`

## 修改需求

## 移除需求
