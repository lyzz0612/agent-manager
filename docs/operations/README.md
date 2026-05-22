# 部署与运维

本目录说明自托管部署、Docker 镜像与 Runner 安装方式。

## 文档索引

| 文档 | 内容 |
|------|------|
| [Docker 镜像](./docker-images.md) | `agentops-server` tag 含义、pull 与 allinone |

## 相关文档

- [本地开发](../development/local-development.md)
- [CI 与 Release](../development/ci-and-release.md)
- [v1 交付形态](../roadmap/version-1-framework.md)

## CLI 安装（被管机）

```bash
npm i -g @lyzz0612/agentops-runner
agentops-runner login --server <url>
agentops-runner daemon
```

具体子命令以实现阶段 CLI 为准。

## 实现阶段待补

- SQLite 备份与恢复
- 升级与迁移
- 日志与排障
- 生产环境变量与安全配置
