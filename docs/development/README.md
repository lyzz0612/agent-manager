# 开发指南

本目录说明本地开发、测试策略，以及 GitHub Actions 与发版约定。实现细节（Dockerfile、`compose` 文件、workflow YAML）在编码阶段落地，此处只记录已达成共识的行为与命名。

## 文档索引

| 文档 | 内容 |
|------|------|
| [本地开发](./local-development.md) | 本机 / Docker 混搭、端口与浏览器、状态目录 |
| [测试策略](./testing.md) | 测什么、mock 边界、runner 用例与 CI 关系 |
| [CI 与 Release](./ci-and-release.md) | `ci.yml` / `release.yml`、tag、手动发版、Artifacts |

## 相关目录

- [v1 版本目标与验收](../roadmap/version-1-framework.md)
- [Docker 镜像与部署](../operations/docker-images.md)
- [规范与共识](../standards/decisions-and-conventions.md)

## 分支

开发与 workflow 均只在 **`master`** 分支进行；不在其他分支维护重复的 workflow 文件。
