## 上下文

v1 需要把日常测试和发布分离。用户已经确定：push / PR 只触发自动测试；打包发布只在 tag 和手动触发时发生；tag 需要自动创建 GitHub Release。

## 目标 / 非目标

**目标：**

- 新增 `ci.yml`，在 push / PR 到 `master` 时运行 lint、typecheck 和测试。
- 新增 `release.yml`，由 `v*` tag 和 `workflow_dispatch` 触发。
- tag 发布全套产物：npm Runner、三种 Docker tag、Android APK 和 GitHub Release。
- 手动发布使用 boolean 参数选择产物，只上传 Artifacts，不创建 Release 页。
- Release 不重复跑测试，信任 master CI。

**非目标：**

- 不在 CI 中包一层 Docker 跑测试。
- 不在 release workflow 中执行测试。
- 不在 release job 中提交版本号变更。
- 不支持非 `master` 分支的 workflow 维护。

## 决策

### CI 与 Release 分离

`ci.yml` 只做验证，`release.yml` 只做发布。tag 推送建议让 CI 忽略 `v*` tag，避免重复执行。

### tag 默认全套发布

推送 `v*` tag 时从 tag 解析版本号，并发布 npm、`agentops-server:<version>`、`<version>-web`、`<version>-allinone`、对应 `latest*` 和 Android APK。

### 手动发布按参数选择

`workflow_dispatch` 提供 `version` 和多个 boolean 参数。至少选择一个发布项，否则 workflow 失败。手动发布不创建 GitHub Release，Android 产物上传为 Actions Artifact。

### GitHub Release 失败策略

tag 发版时创建 GitHub Release。全部发布成功则 Published；任一发布失败则保留 Draft 供人工检查。

## 风险 / 权衡

- Release 不跑测试可能发布未验证 commit → 约定只从已合并且 CI 通过的 master 打 tag。
- 手动发布范围灵活但参数较多 → workflow 输入必须清晰命名，并在 summary 中输出最终发布范围。
- Android 签名 secret 配置复杂 → 初期任务中单独列出签名与 artifact 上传验证。
