## 1. CLI 基础

- [ ] 1.1 创建 Runner package 和 npm 包配置
- [ ] 1.2 实现 Runner 命令入口和基础帮助信息
- [ ] 1.3 实现 Runner 本地状态目录解析和 `AGENTOPS_HOME` 支持
- [ ] 1.4 定义 Runner 与 Server 的共享协议类型
- [ ] 1.5 添加 CLI 基础单元测试

## 2. 登录与 daemon

- [ ] 2.1 实现 `login` 命令，提交 Server URL 和 Token
- [ ] 2.2 保存 machineId、Runner 凭据和 Server 地址
- [ ] 2.3 实现 `daemon` 命令和主动连接 Server
- [ ] 2.4 实现心跳、断线重连和旧凭据失效提示
- [ ] 2.5 daemon 连接成功后自动触发一次 detect

## 3. Agent Adapter

- [ ] 3.1 定义 AgentAdapter 接口和注册表
- [ ] 3.2 实现 Cursor adapter detect / install / upgrade / doctor / uninstall
- [ ] 3.3 实现 Codex adapter detect / install / upgrade / doctor / uninstall
- [ ] 3.4 实现 Claude Code adapter detect / install / upgrade / doctor / uninstall
- [ ] 3.5 为每个安装、升级、卸载动作记录官方文档来源

## 4. 动作执行

- [ ] 4.1 实现动作执行器和状态上报
- [ ] 4.2 实现同 Agent 串行、不同 Agent 并行
- [ ] 4.3 实现动作超时和失败摘要
- [ ] 4.4 实现 ActionLog 采集和简短结果摘要
- [ ] 4.5 确保 v1 不暴露取消动作入口

## 5. 测试

- [ ] 5.1 添加 Agent detect 单元测试
- [ ] 5.2 添加 Runner login / daemon 集成测试
- [ ] 5.3 添加 per-agent 集成测试与平台 skip 条件
- [ ] 5.4 添加容器内 Runner 开发验证说明
