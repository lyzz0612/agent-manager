## 1. 路线与产品定位

- [ ] 1.1 更新 `README.md` 和 `docs/README.md`，将项目定位改为 agent/provider 安装、管理和配置工具
- [ ] 1.2 改写 `docs/roadmap/README.md`，移除以对话/session 为主线的后续版本入口
- [ ] 1.3 删除或归档 `docs/roadmap/version-3-conversation.md`，新增 provider management 后续路线文档
- [ ] 1.4 更新产品细节文档，明确 Paseo 类工具负责外部对话和编排体验，本项目负责安装、配置和状态管理

## 2. Provider Catalog 与协议

- [ ] 2.1 定义 provider catalog schema，覆盖 provider 类型、平台、安装源、支持动作、配置 schema、敏感字段、MCP/skill 能力和官方文档 URL
- [ ] 2.2 在共享协议包中新增 provider catalog、provider status、auth status、config profile、config version 和 orchestrator status DTO
- [ ] 2.3 新增首批 catalog entries：Cursor、Codex、Claude Code、Paseo
- [ ] 2.4 为 catalog schema、DTO 序列化和敏感字段脱敏添加单元测试

## 3. Runner 执行层

- [ ] 3.1 将 Runner adapter 注册表从固定 agent 扩展为 catalog provider adapter 注册表
- [ ] 3.2 实现基于 catalog 的 detect/install/upgrade/uninstall/doctor 动作校验和执行
- [ ] 3.3 实现 provider login 动作，返回登录引导、用户下一步和授权状态检测结果
- [ ] 3.4 实现 configure 动作，支持配置 diff、写入前备份、写入结果上报和回滚入口
- [ ] 3.5 实现 Paseo 类 orchestrator 的 detect/install/start/stop/connection info 基础能力
- [ ] 3.6 扩展 Runner 测试，覆盖未知 provider、未声明动作、平台不支持、配置备份和 orchestrator 状态

## 4. Server 控制面

- [ ] 4.1 新增 provider catalog API，并在 Runner daemon 连接后支持 catalog 版本同步
- [ ] 4.2 扩展存储模型，保存 provider 状态、授权状态、配置 profile、配置版本和 orchestrator 状态
- [ ] 4.3 扩展管理动作创建逻辑，支持 login/configure/start/stop 并拒绝 catalog 未声明动作
- [ ] 4.4 扩展 WebSocket 事件，推送 provider 状态、授权状态、配置版本和 orchestrator 状态变化
- [ ] 4.5 扩展审计日志，覆盖配置写入、回滚和登录授权引导且禁止记录敏感值明文
- [ ] 4.6 更新 Server API 测试和协议集成测试

## 5. Client 管理界面

- [ ] 5.1 调整主导航为 Provider Catalog、Installed Providers、Profiles、Orchestrators 和 Machines
- [ ] 5.2 实现 provider catalog 列表、筛选和 provider 详情页
- [ ] 5.3 实现 profile 管理页面，支持模型、`base_url`、权限模式、MCP server、skill 和敏感值引用
- [ ] 5.4 实现 login/configure 动作 UI，展示登录引导、配置 diff、备份信息和二次确认
- [ ] 5.5 实现 orchestrator 页面，展示 Paseo 类工具的安装状态、运行状态和连接方式
- [ ] 5.6 更新 Client 测试，覆盖 catalog 展示、未声明动作隐藏、敏感值脱敏和实时状态更新

## 6. 验证与迁移

- [ ] 6.1 运行现有 CLI、protocol、client 和 server 测试，修复因 DTO 和导航变更引入的回归
- [ ] 6.2 补充迁移测试，确保现有 Cursor/Codex/Claude Code 管理能力通过 catalog 路径仍可用
- [ ] 6.3 手动验证从空环境安装 Paseo、检测版本、启动/停止和展示连接信息
- [ ] 6.4 手动验证配置 profile 写入前备份、写入失败结果、脱敏展示和回滚路径
