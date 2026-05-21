# AgentOps 管理工具文档索引

## 项目概述

本项目目标是构建一个网页版优先、未来支持手机 App 的 AI agent 管理工具，用于统一检测、安装、配置和管理开发者机器上的 AI coding agent。

第一阶段聚焦三层架构的搭建：

```text
Client
  Web 优先，未来 App 复用同一套客户端能力

Server
  负责账号、机器、状态、配置、审计和管理动作调度

CLI / Runner
  安装在被管理机器上，负责本机 agent 检测、安装、配置和状态上报
```

初版不以 agent 对话、workspace、任务执行为主目标，而是先把客户端、服务器和 CLI/Runner 三层能力打通。

## 文档索引

### 产品与架构

- [架构文档](./architecture/README.md)
- [技术选型和分层](./architecture/technical-architecture.md)
- [达成共识的细节和规范](./standards/decisions-and-conventions.md)

### 版本线

- [版本路线](./roadmap/README.md)
- [v1：三层框架与基础安装管理](./roadmap/version-1-framework.md)
- [v2：完善多机器与管理能力](./roadmap/version-2-management.md)
- [v3：对话、任务执行与实时反馈](./roadmap/version-3-conversation.md)

### 开源项目探索

- [调研文档](./research/README.md)
- [Happy 项目探索记录](./research/happy.md)
- [cc-connect 项目探索记录](./research/cc-connect.md)

### 后续预留目录

- [API 与协议](./api/README.md)
- [开发指南](./development/README.md)
- [部署与运维](./operations/README.md)
- [架构决策记录](./adr/README.md)
- [规范与共识](./standards/README.md)

## 目录结构

```text
docs/
  README.md
  architecture/   # 系统架构、技术选型、分层设计
  roadmap/        # 版本线、里程碑、阶段目标
  research/       # 外部项目、竞品、技术调研
  standards/      # 共识、规范、命名、协议约定
  api/            # 后续 API、事件协议、Runner 协议
  development/    # 后续本地开发、测试、调试指南
  operations/     # 后续部署、自托管、备份、升级文档
  adr/            # 后续 Architecture Decision Records
```

## 当前共识

- 产品从第一版开始就是三层架构，不做单机本地网页工具。
- 初版先做安装与管理，不做 workspace 和 agent 对话。
- Server 初期优先考虑 TypeScript/Node.js + SQLite，降低本机开发成本。
- CLI/Runner 初期优先使用 Node.js CLI，通过 npm 分发，降低安装门槛。
- 客户端优先选择 Web/App 可复用路线，倾向 Expo + React Native Web。
- 数据库初期优先 SQLite，等 SaaS 化、多副本或高并发需求明确后再评估 Postgres。

