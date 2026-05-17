# Lumimax MVP Architecture Rules

你是 Lumimax 项目的资深 NestJS + TypeScript 微服务开发 Agent。

当前项目采用 **四服务**运行时架构（逻辑边界）；**默认部署**为单镜像 + Docker Compose 多进程（见 [docs/项目架构总览与开发约束.md](../docs/项目架构总览与开发约束.md) §2.4），上 K8s 时可拆 Deployment 或多镜像，**无需改事件契约**。

1. gateway
2. base-service
3. biz-service
4. **iot-service**（设备总线 / 传输层：ingress、bridge 队列、EMQX/AWS 下行发布）

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
- meal 饮食记录
- food analysis 食物识别
- nutrition 营养分析
- ota
- telemetry
- device command
- **IoT 领域 ingest**（消费 biz queue，如 `biz.iot.message.received`）

biz-service **不**直接对 EMQX/云 IoT 做下行发布；下行意图通过 RabbitMQ（`iot.down.publish`）交给 iot-service。

## iot-service 职责

iot-service 是设备总线 / 传输层，包含：

- 云 IoT 入站（EMQX webhook、RMQ、SQS 等）
- topic 解析、归一化、iot_messages outbox
- 下行发布与退避重试（消费 iot queue 的 `iot.down.publish`）
- 向 biz queue 发布 `biz.iot.message.received`

**严禁**饮食/营养等领域逻辑；**无**对外业务 HTTP（除 health / 内网 ingest）。

## 通信规则

- Client / App / Admin 只允许访问 gateway
- gateway 通过 gRPC 调用 base-service / biz-service
- biz-service 如需用户、权限、配置、存储、通知等基础能力，通过 gRPC 调用 base-service
- base-service 不允许反向依赖 biz-service
- iot-service 可 gRPC 只读查询 biz 设备元数据；biz 通过 RabbitMQ 与 iot-service 协作，**不**反向依赖 iot-service 的编译期模块
- RabbitMQ：**目标**双队列——**iot queue**（仅 bridge 消费）、**biz queue**（仅 biz 消费）；每个服务进程 **一个** RMQ consumer
- 不要新增 user-service、device-service、diet-service、storage-service、notification-service 等独立部署单元（见项目总规范 §3.7）

## 部署（Agent 须知）

| 形态 | 说明 |
| --- | --- |
| **默认** | [`docker/Dockerfile`](../docker/Dockerfile) 单镜像 + supervisord：nginx + gateway + base + biz（+ 未来 iot-service 第 4 进程） |
| **Compose** | [`compose.stack.yml`](../compose.stack.yml) 单机 + PG/Redis/RabbitMQ/EMQX |
| **K8s（可选）** | 同一镜像多 Deployment（不同 command/env），或 `api/Dockerfile` 每服务一镜像；iot-service 与 biz **分别扩缩容** |

禁止把多个服务塞进 **一个 Node 进程**；允许 **一个容器多个 Node 进程**。

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
- `@lumimax/iot-kit`（供 iot-service 使用）

## ID 规则

所有业务主键使用项目统一的全小写 32 位 ULID。

## 代码要求

- 优先复用 libs/common、libs/config、libs/logger、libs/database、libs/redis、libs/grpc、iot-kit
- 遵循现有目录结构和代码风格
- 不引入不必要依赖
- 不写伪代码
- 不生成无用抽象
- 不破坏现有 build
- 每个模块边界清晰；IoT **传输**（`iot-service`）与 **业务 ingest**（`biz-service`）目录分离

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
| **BizDeviceAgent** | 设备域：device、binding、command、ota | `apps/biz-service/src/device/` |
| **IoTServiceAgent** | 传输层：EMQX/RMQ、上下行发布、upstream/downstream 队列 | `apps/iot-service/` |
| **BizIoTAgent** | 领域 ingest、dispatcher 与 diet/device 衔接 | `apps/biz-service/src/iot/` |
| **MessagingAgent** | RabbitMQ exchange/queue 命名、消息 envelope、消费者注册 | `packages/mq/`、`internal/config/rabbitmq-topology` |
| **FrontendAgent** | 前端 monorepo：admin 后台 + web 官网 | `web/apps/admin`、`web/apps/www` |
| **Validator** | 单测、e2e、回归命令 | `*.spec.ts`、`*.e2e-spec.ts` |

### 交接物（每个 Agent 结束时必须留给下一个）

1. 已满足的接口/事件名（对齐 [docs/设备接入协议规范v1.3.md](docs/设备接入协议规范v1.3.md) 或 gRPC operation 名）；设备请求须说明 **`meta.locale`** 策略（见 v1.3 §1.1）。
2. **未**改动的目录声明（避免「顺手重构 gateway」）。
3. 已执行验证命令与结果（与本文件「输出要求」一致）。

### PR 切片规则

- 按 **Reviewer 边界** 切：gateway 与 biz-service 尽量不同 PR；**iot-service 与 biz IoT ingest** 分 PR；biz 内 **providers 工厂** 与 **业务编排** 拆开。
- 跨服务契约变更（proto / DTO / RabbitMQ routing key）必须先合，再合调用方。
- 禁止 `git add .` / `git add -A`；只 stage 计划内文件或 hunks。
- 大批量改动前先 `git stash create` 创建备份 ref。
- 合并顺序优先级：路线图 > 项目总规范 > Doc-MVP > Doc-Auth > Doc-IoT（详见 [docs/分阶段路线图.md](docs/分阶段路线图.md) §1）。
- **iot-bridge** 仅作代码包/模块名（如 `iot-bridge.rabbitmq.ts`）时可保留；**运行时服务名**统一 **`iot-service`**。

### 与产品「逻辑 Agent」的关系

[docs/food-provider-strategy.md](docs/food-provider-strategy.md) §3 中描述的 IngestAgent / VisionAgent / SourceLookupAgent 等是**产品/编排层的逻辑节点**，不是开发协作角色，也不会拆成独立微服务。当前阶段它们都落在 biz-service 的 diet / iot pipeline 模块内。
