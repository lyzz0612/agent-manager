## 1. CI

- [ ] 1.1 创建 `.github/workflows/ci.yml`
- [ ] 1.2 配置 push / PR 到 `master` 触发
- [ ] 1.3 配置 tag ignore，避免 `v*` tag 重复触发 CI
- [ ] 1.4 配置 pnpm 安装、缓存、lint、typecheck 和 test
- [ ] 1.5 验证 CI 不发布 npm、不 push Docker、不创建 Release

## 2. Release 输入与版本

- [ ] 2.1 创建 `.github/workflows/release.yml`
- [ ] 2.2 配置 `v*` tag 和 `workflow_dispatch` 触发
- [ ] 2.3 实现从 tag 或手动 input 解析版本号
- [ ] 2.4 实现手动发布 boolean 参数和至少选择一项校验
- [ ] 2.5 确保 release workflow 不提交版本号变更

## 3. 发布产物

- [ ] 3.1 实现 `@lyzz0612/agentops-runner` npm 发布 job
- [ ] 3.2 实现 `agentops-server:<version>` 镜像构建和 push
- [ ] 3.3 实现 `agentops-server:<version>-web` 镜像构建和 push
- [ ] 3.4 实现 `agentops-server:<version>-allinone` 镜像构建和 push
- [ ] 3.5 实现 `latest`、`latest-web`、`latest-allinone` 更新
- [ ] 3.6 实现 Android APK 构建和上传

## 4. GitHub Release

- [ ] 4.1 tag 发布时创建 GitHub Release
- [ ] 4.2 成功时发布 Release，失败时保留 Draft
- [ ] 4.3 附加 Android APK 等 Release assets
- [ ] 4.4 手动发布时只上传 Actions Artifacts
- [ ] 4.5 编写 Release body 模板和 workflow summary

## 5. Secrets 与验证

- [ ] 5.1 配置 `NPM_TOKEN` 使用说明
- [ ] 5.2 配置 packages / contents 权限
- [ ] 5.3 配置 Android 签名 secret 文档
- [ ] 5.4 使用 dry run 或测试 tag 验证 workflow 路径
