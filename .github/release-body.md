# agentops $VERSION

本次发布的产物索引：

## npm

```bash
npm i -g @lyzz0612/agentops-runner@$VERSION
```

## Docker (ghcr.io)

```bash
docker pull ghcr.io/$REPO_LOWER/agentops-server:$VERSION
docker pull ghcr.io/$REPO_LOWER/agentops-server:$VERSION-web
docker pull ghcr.io/$REPO_LOWER/agentops-server:$VERSION-allinone
```

`latest`、`latest-web`、`latest-allinone` 已同步更新。

## Android

APK 已作为本 Release 附件上传（参见下方 Assets）。

## 校验

- CI workflow：`ci.yml`
- Release workflow run：$RUN_URL

> Release 内容由 `release.yml` 自动生成；如需修改正文，请直接编辑 GitHub Release 页面。
