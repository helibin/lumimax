# Lumimax MVP Architecture Rules

你是 Lumimax 项目的资深 NestJS + TypeScript 微服务开发 Agent。

当前项目采用 MVP 三服务架构：

1. gateway
2. base-service
3. biz-service

## gateway 职责

gateway 是唯一外部入口，只负责：

- HTTP API
- 鉴权拦截
- 请求转发
- 参数聚合
- 限流
- 统一响应
- Swagger 聚合
- requestId 注入
- 访问日志

gateway 不允许承载核心业务逻辑。

## base-service 职责

base-service 是基础能力服务，包含：

- auth 认证
- user 用户
- role 角色
- permission 权限
- menu 菜单
- system config 系统配置
- dictionary 字典
- notification 通知
- storage 存储
- audit log 审计日志

## biz-service 职责

biz-service 是核心业务服务，包含：

- device 设备管理
- device binding 设备绑定
- iot bridge 云 IoT 对接
- meal 饮食记录
- food analysis 食物识别
- nutrition 营养分析
- ota
- telemetry
- device command

## 通信规则

- Client / App / Admin / Device 只允许访问 gateway
- gateway 通过 gRPC 调用 base-service / biz-service
- biz-service 如需用户、权限、配置、存储、通知等基础能力，通过 gRPC 调用 base-service
- base-service 不允许反向依赖 biz-service
- 当前阶段不要新增 user-service、device-service、iot-bridge-service、diet-service、storage-service、notification-service 等独立服务

## 技术栈

- NestJS
- TypeScript
- pnpm workspace
- Turbo
- PostgreSQL
- Redis
- gRPC
- Protobuf
- TypeORM 或项目现有 ORM
- 项目统一 logger / config / database / redis / exception / response 规范

## ID 规则

所有业务主键使用项目统一的全小写 32 位 ULID。

## 代码要求

- 优先复用 libs/common、libs/config、libs/logger、libs/database、libs/redis、libs/grpc
- 遵循现有目录结构和代码风格
- 不引入不必要依赖
- 不写伪代码
- 不生成无用抽象
- 不破坏现有 build
- 每个模块边界清晰，为未来拆分独立微服务保留可能性

## 输出要求

每次完成任务后必须输出：

1. 修改文件列表
2. 核心实现说明
3. 已执行的验证命令
4. 验证结果
5. 未完成事项
6. 下一步建议

---

## 多 Agent 开发协作

> 本节用于约束多个 Cursor / Codex / 人类开发 Agent 并行或串行协作时，不踩服务边界、不重复改同一层、可小 PR 审查。
> 与 [docs/分阶段路线图.md](docs/分阶段路线图.md) 配套使用：路线图定**做什么**与**阶段范围**，本节定**谁来做**与**怎么交接**。

### 角色分工

每个会话或子任务**只认领一个主角色**，避免越界。

| 角色 | 职责 | 典型路径 |
| --- | --- | --- |
| **Planner** | 拆需求、定接口与验收、输出 PR 切片顺序；不写大段业务代码 | 文档 + issue |
| **Explorer** | 只读摸清调用链、gRPC、配置入口 | 全仓 grep + 读 facade/controller |
| **GatewayAgent** | HTTP/gRPC DTO、路由、鉴权、转发 | `apps/gateway/` |
| **BaseAgent** | 用户、凭证、权限、字典、存储等基础能力 | `apps/base-service/` |
| **BizDietAgent** | 饮食域：facade、meal、vision、nutrition、providers | `apps/biz-service/src/diet/` |
| **IoTAgent** | EMQ X 接入与协议落地（v1.3）；MQTT→RabbitMQ 桥接侧 | `apps/biz-service/src/iot/`（或现有 IoT bridge） |
| **MessagingAgent** | RabbitMQ exchange/queue 命名、消息 envelope、消费者注册 | `packages/messaging/`（或项目约定路径） |
| **FrontendAgent** | 前端 monorepo：admin 后台 + web 官网；i18n 与 admin 设计系统 | 前端仓库 `apps/admin`、`apps/web`（路径以仓库为准） |
| **Validator** | 单测、e2e、回归命令 | `*.spec.ts`、`*.e2e-spec.ts` |

### 交接物（每个 Agent 结束时必须留给下一个）

1. 已满足的接口/事件名（对齐 [docs/设备接入协议规范v1.3.md](docs/设备接入协议规范v1.3.md) 或 gRPC operation 名）；设备请求须说明 **`meta.locale`** 策略（见 v1.3 §1.1）。
2. **未**改动的目录声明（避免「顺手重构 gateway」）。
3. 已执行验证命令与结果（与本文件「输出要求」一致）。

### PR 切片规则

- 按 **Reviewer 边界** 切：gateway 与 biz-service 尽量不同 PR；biz 内 **providers 工厂/配置** 与 **业务编排** 拆成前后两个 PR（先 factory 后调用方）。
- 跨服务契约变更（proto / DTO）必须先合，再合调用方。
- 禁止 `git add .` / `git add -A`；只 stage 计划内文件或 hunks。
- 大批量改动前先 `git stash create` 创建备份 ref。
- 合并顺序优先级：路线图 > Doc-MVP > Doc-Auth > Doc-IoT（详见 [docs/分阶段路线图.md](docs/分阶段路线图.md) §1）。

### 与产品「逻辑 Agent」的关系

[docs/food-provider-strategy.md](docs/food-provider-strategy.md) §3 中描述的 IngestAgent / VisionAgent / SourceLookupAgent 等是**产品/编排层的逻辑节点**，不是开发协作角色，也不会拆成独立微服务（详见路线图 §2.6 不做清单）。当前阶段它们都落在 biz-service 的 diet 模块内。
