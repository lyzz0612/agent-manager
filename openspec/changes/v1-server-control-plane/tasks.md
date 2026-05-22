## 1. 项目与数据层

- [x] 1.1 创建 Server 应用结构、配置读取和启动入口
- [x] 1.2 定义共享 domain schema 与 API DTO
- [x] 1.3 建立 SQLite 迁移和数据访问层
- [x] 1.4 实现 Machine、Runner、AgentInstallation、DoctorCheck、ManagementAction、ActionLog、AuditLog 表结构
- [x] 1.5 为 Machine 软删除和未删除唯一性添加索引约束

## 2. 认证与机器注册

- [x] 2.1 实现部署环境 Token 配置和鉴权中间件
- [x] 2.2 实现 Runner 登录 / 绑定机器接口
- [x] 2.3 实现机器显示名更新接口
- [x] 2.4 实现机器软删除接口和旧凭据拒绝逻辑
- [x] 2.5 实现 Runner 连接 online / offline 状态更新

## 3. 状态与动作

- [x] 3.1 实现 Agent 状态和 Doctor 结果上报接口
- [x] 3.2 实现管理动作创建接口
- [x] 3.3 实现同机器同 Agent 串行、不同 Agent 并行的调度规则
- [x] 3.4 实现动作状态、结果摘要和 ActionLog 写入
- [x] 3.5 实现基础 AuditLog 写入

## 4. 实时通道与验证

- [x] 4.1 实现 Client WebSocket 鉴权和订阅
- [x] 4.2 实现 Runner Channel 命令下发和结果上报
- [x] 4.3 推送机器状态、动作状态和 Agent 状态变化事件
- [x] 4.4 添加 Server 单元测试和 API 集成测试
- [x] 4.5 补充错误码和基础 API 文档
