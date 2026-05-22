## 1. 本机开发脚本

- [x] 1.1 定义 `pnpm dev` 启动矩阵和环境变量
- [x] 1.2 配置 Server 本机开发启动
- [x] 1.3 配置 Client 本机开发启动和浏览器访问端口
- [x] 1.4 配置 Runner 本机开发启动并默认使用 `.agentops-dev`
- [x] 1.5 将 `.agentops-dev`、`.data` 等开发状态目录加入 gitignore

## 2. Docker Compose dev-fast

- [x] 2.1 创建 Compose dev 文件和 profile 结构
- [x] 2.2 配置 Server 容器开发模式和数据卷
- [x] 2.3 配置 Client 容器开发模式、端口映射和 HMR
- [x] 2.4 配置 Runner 容器、独立状态卷和 Server 连接
- [x] 2.5 配置源码挂载、依赖缓存和热重载

## 3. 混搭运行

- [x] 3.1 支持 Server / Client / Runner 本机或 Docker 运行选择
- [ ] 3.2 验证推荐组合：Server 本机、Client 本机、Runner Docker
- [x] 3.3 验证全本机组合
- [ ] 3.4 验证全容器组合
- [x] 3.5 编写端口、环境变量和调试说明

## 4. 测试策略落地

- [x] 4.1 建立单元测试脚本和 mock 使用边界
- [x] 4.2 建立 Runner 集成测试脚本
- [x] 4.3 为 per-agent 集成测试添加平台 skip 条件
- [x] 4.4 建立 Server + Client + Runner smoke 脚本
- [x] 4.5 确保 CI 可复用测试脚本但不在 Docker 中运行测试

## 5. all-in-one smoke

- [x] 5.1 创建 all-in-one 本地构建或运行脚本
- [ ] 5.2 验证 Server、Web 和 bundled Runner 基础连通
- [ ] 5.3 验证 all-in-one 不预装 Cursor、Codex、Claude Code
- [x] 5.4 更新开发与 Docker 文档
