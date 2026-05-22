## 新增需求

### 需求:Agent 授权状态
系统必须管理每个 provider 在每台机器上的授权状态摘要，禁止上传或展示真实 token、API key 或 OAuth 凭据明文。

#### 场景:授权状态上报
- **当** Runner 完成 provider 授权状态检测
- **那么** Server 必须保存脱敏后的授权状态、检测时间、状态来源和需要用户处理的下一步

#### 场景:敏感值脱敏
- **当** Client 展示授权状态或配置摘要
- **那么** Client 必须隐藏真实敏感值，并只展示脱敏值、引用名称或存在性状态

### 需求:登录引导
系统必须支持 provider 的登录或授权引导动作，并清楚区分自动登录、手动登录和仅检查状态。

#### 场景:启动登录引导
- **当** 用户对 provider 发起 login 动作
- **那么** Runner 必须返回该 provider 支持的登录方式、需要用户执行的步骤或本机命令输出

#### 场景:登录后刷新状态
- **当** 用户完成 provider 登录引导
- **那么** Runner 必须重新检测授权状态并向 Server 上报最新摘要

### 需求:模型端点配置
系统必须支持管理 provider profile 中的模型、`base_url`、权限模式和环境变量引用。

#### 场景:创建配置 profile
- **当** 用户创建 provider 配置 profile
- **那么** Server 必须保存 profile 名称、目标 provider、非敏感配置值、敏感值引用和版本号

#### 场景:应用配置 profile
- **当** 用户将配置 profile 应用到某台机器的 provider
- **那么** Runner 必须在本机生成配置变更摘要，完成确认后写入配置并上报新的配置版本

### 需求:MCP 与 Skill 配置
系统必须支持在 provider profile 中管理 MCP server 和 skill 配置，且必须按 provider catalog 声明的格式生成配置。

#### 场景:新增 MCP server
- **当** 用户在支持 MCP 的 provider profile 中新增 MCP server
- **那么** Server 必须保存该 MCP server 的非敏感字段和敏感值引用，并标记需要下发的目标 provider

#### 场景:新增 skill
- **当** 用户在支持 skill 的 provider profile 中新增 skill
- **那么** Server 必须保存 skill 来源、启用状态和 provider 适配信息

### 需求:配置备份与回滚
Runner 写入 provider 配置前必须创建备份，并在写入失败时保留可诊断结果。

#### 场景:写入前备份
- **当** Runner 准备修改 provider 本机配置文件
- **那么** Runner 必须先创建备份并将备份引用写入动作结果

#### 场景:回滚配置
- **当** 用户请求回滚到上一配置版本
- **那么** Runner 必须使用对应备份恢复本机配置，并重新执行配置状态检测

## 修改需求

## 移除需求
