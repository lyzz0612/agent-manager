## 新增需求

### 需求:Orchestrator 工具管理
系统必须支持把 Paseo 类工具作为 orchestrator provider 管理，并与普通 coding agent 区分展示。

#### 场景:展示 orchestrator
- **当** 用户打开 orchestrator 页面
- **那么** Client 必须展示每个 orchestrator 的安装状态、版本、运行状态、配置状态和连接方式摘要

#### 场景:普通 agent 不展示 orchestrator 操作
- **当** provider 类型不是 orchestrator
- **那么** Client 禁止展示 daemon 生命周期、pair 或外部连接信息等 orchestrator 专属入口

### 需求:安装 Paseo 类工具
Runner 必须能够按官方文档安装、升级、检测和卸载 catalog 中声明的 Paseo 类工具。

#### 场景:安装 orchestrator
- **当** 用户对 Paseo 类工具发起 install 动作
- **那么** Runner 必须使用 catalog 声明的安装源执行安装，并在完成后检测版本和可执行路径

#### 场景:检测 orchestrator
- **当** Runner 执行 orchestrator detect
- **那么** Runner 必须上报安装状态、版本、可执行路径、配置目录和运行状态

### 需求:Orchestrator 生命周期
系统必须支持 catalog 声明的 orchestrator 生命周期动作，且必须把启动外部工具与本项目自身 daemon 区分开。

#### 场景:启动 orchestrator
- **当** 用户发起 start 动作
- **那么** Runner 必须启动对应 orchestrator 的本机 daemon 或 CLI 入口，并上报运行状态

#### 场景:停止 orchestrator
- **当** 用户发起 stop 动作
- **那么** Runner 必须停止由本项目启动或 catalog 明确可控的 orchestrator 进程，并上报结果

### 需求:连接信息展示
系统必须展示 orchestrator 的连接信息或 pairing 引导，但禁止把外部对话能力伪装成本项目内置能力。

#### 场景:生成连接信息
- **当** 用户请求 Paseo 类工具的连接方式
- **那么** Runner 必须返回官方支持的连接入口、pairing 信息或手动操作说明

#### 场景:进入外部体验
- **当** 用户需要运行 agent 对话或跨端控制
- **那么** Client 必须引导用户使用外部 orchestrator，而不是创建本项目内的 session

## 修改需求

## 移除需求
