# 文档索引

本文档列出当前仓库中与 `agent-manager` Phase 1 相关的核心说明材料。

## 项目级文档

- `README.md`
  - 仓库入口、项目定位、范围和快速导航
- `docs/project-overview.md`
  - 项目目标、范围、非目标和 Phase 1 边界
- `docs/technical-solution.md`
  - 技术方案、架构分层、模块边界、交付形态
- `docs/decisions.md`
  - 用户已拍板项与当前约束
- `docs/run-and-deploy.md`
  - 本机快启、Compose 验收和部署说明

## OpenSpec 文档

- `openspec/changes/add-cursor-vps-manager/proposal.md`
  - 本次变更的动机与影响
- `openspec/changes/add-cursor-vps-manager/design.md`
  - 当前阶段的技术设计与取舍
- `openspec/changes/add-cursor-vps-manager/tasks.md`
  - 后续实现任务清单
- `openspec/changes/add-cursor-vps-manager/specs/`
  - Phase 1 的能力规范

## 维护约定

- 产品边界、架构和已拍板项优先更新 `docs/`
- 需求、设计和任务拆解优先更新 `openspec/changes/...`
- 当实现与文档不一致时，应先更新文档或同步修正文档
