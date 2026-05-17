# lumimax

NestJS + TypeScript 微服务 monorepo（pnpm workspace + turbo）。

## 快速启动

```bash
pnpm install
pnpm infra:up
pnpm dev
```

`pnpm dev` 默认启动 `gateway`、`base-service`、`biz-service`、`iot-service`（本地开发）；**目标运行时**为四服务（含 **`iot-service`** 传输层，见 [`docs/项目架构总览与开发约束.md`](../docs/项目架构总览与开发约束.md)）。生产默认 **单镜像 + Compose 多进程**（[`docker/README.md`](../docker/README.md)），上 K8s 可拆 Deployment，无需改 RabbitMQ 契约。

单独启动 IoT：`pnpm dev:iot`（或 `pnpm --filter @lumimax/iot-service dev`）。环境变量模板见 `configs/iot-service.env.example`（详见 [`docs/IoT通讯模块规范.md`](../docs/IoT通讯模块规范.md) §10）。
如需无 watch 运行，使用 `pnpm dev:no-watch`。`pnpm dev:full` / `pnpm dev:full:no-watch` 当前仅表示对仓库保留工作区执行完整启动，不再包含已删除旧服务。
启动前会先自动编译当前平台依赖的 `packages/*` 与 `internal/*` 共享包，避免共享层 `dist` 过期导致运行时注入异常。

启动前至少补齐这些本地环境变量：

```env
JWT_SECRET=change-me-in-dev
RABBITMQ_URL=amqp://root:rd@localhost:5672
# IOT_RABBITMQ_URL=amqp://root:rd@localhost:5672
REDIS_URL=redis://localhost:6379
DB_URL=postgresql://postgres:rd@localhost:5432/lumimax
```

环境变量加载约定：

- 默认配置写在根目录 `.env`
- 环境差异覆盖写在 `.env.<env>`（例如 `.env.development`、`.env.production`）
- 启动脚本通过 `cross-env` 设置 `NODE_ENV`，应用按 `NODE_ENV` 自动叠加加载（`.env.<env>` 优先于 `.env`）
- 可通过 `ENV_FILE`（或 `DOTENV_CONFIG_PATH`）显式指定 env 文件，优先级最高

示例：

```bash
pnpm exec cross-env NODE_ENV=development pnpm dev
pnpm exec cross-env NODE_ENV=production pnpm dev:gateway
pnpm exec cross-env NODE_ENV=development pnpm db:migrate
```

单服务启动示例：

```bash
pnpm dev:gateway
pnpm dev:base
pnpm dev:biz
```

## Docker Compose

```bash
docker compose up --build
```

- `docker-compose.yml` 当前仅通过 `expose` 暴露容器内部端口，不映射宿主机端口。
- `docker-compose.yml` 默认只编排重构后的核心服务：`gateway`、`base-service`、`biz-service`，以及所需基础设施。
- 如需在宿主机直接访问 `/docs`、`/health`，使用本地 `pnpm dev` 方式启动。

常用命令：

```bash
pnpm infra:up
pnpm infra:down
pnpm infra:platform:up
pnpm infra:platform:down
```

## 默认端口与文档地址

| Service      | Port                     | Health                         | Docs                                     |
| ------------ | ------------------------ | ------------------------------ | ---------------------------------------- |
| gateway      | 4000                     | `http://localhost:4000/health` | `http://localhost:4000/docs`（聚合入口） |
| base-service | 4020 (HTTP), 4120 (gRPC) | `http://localhost:4020/health` | -                                        |
| biz-service  | 4030 (HTTP), 4130 (gRPC) | `http://localhost:4030/health` | -                                        |

Gateway 提供统一文档聚合入口：

- `GET /docs`：gateway 自身 Swagger UI
- `GET /docs/hub`：文档聚合首页
- `GET /docs/services`：服务文档清单
- `GET /docs/openapi/:service`：代理对应服务的 `/docs-json`
- `GET /docs/:service`：gateway 内统一 Swagger UI（加载 `/docs/openapi/:service`）

说明：

- 客户端统一访问 gateway 文档入口，不直接访问微服务 `/docs`。
- 微服务不再暴露 Swagger 文档，由 gateway 统一维护与展示。

## 基础设施配置

- `RABBITMQ_URL`：异步事件总线连接串
- `RABBITMQ_EVENTS_EXCHANGE`：业务 + IoT 共用的 topic 交换机（默认 `lumimax.bus`）
- `RABBITMQ_EVENTS_EXCHANGE_TYPE`：交换机类型（默认 `topic`）
- `RABBITMQ_QUEUE`：业务事件队列（默认 `lumimax.q.biz.events`）
- `RABBITMQ_DLX_QUEUE`：统一死信队列（默认 **`lumimax.q.dead`**；须与业务 / IoT 主队列名不同；`dead.#` 统一绑定到该队列）
- `IOT_RABBITMQ_URL`：IoT bridge / EMQX 桥接链路专用 RabbitMQ 连接串；未配置时会回退复用 `RABBITMQ_URL`
- `IOT_RABBITMQ_QUEUE`：iot-service 消费的上下行共用队列（默认 `lumimax.q.iot.stream`，绑定 `iot.up.#` / `iot.down.#`）
- `IOT_RABBITMQ_MESSAGE_TTL_MS`：IoT 主队列 TTL（毫秒，默认不声明 TTL；如需启用，必须先确保 RabbitMQ 现有队列参数一致）
- `RABBITMQ_IDEMPOTENCY_TTL_MS`：消费幂等窗口（毫秒，默认 `86400000`）
- `BASE_SERVICE_GRPC_ENDPOINT / BIZ_SERVICE_GRPC_ENDPOINT`：gateway 调用内部核心服务的 gRPC 地址
- `IOT_VENDOR` / `IOT_RECEIVE_MODE`：iot-service 与 biz-service 均需一致；`emqx` + `mq` 为默认主线
- `AWS_SQS_*`、`EMQX_HTTP_*`、`EMQX_MQTT_*`：**仅 iot-service**（传输与下行发布）；详见 `configs/iot-service.env.example`
- `AWS_IOT_ENDPOINT / AWS_IOT_POLICY_NAME`：设备证书签发（biz-service `device/identity`）与 AWS ingress（iot-service）按需配置
- `EMQX_BROKER_URL / EMQX_REGION / EMQX_ROOT_CA_*`：biz 签发设备 mTLS；iot 连接 broker / HTTP API
- `EMQX_AUTH_SECRET`：**gateway** 校验 EMQX webhook / internal auth；与 iot-service 配置一致
- `HOST / HTTP_PORT / GRPC_PORT`：各服务本地监听配置（按服务类型分别使用）
- `REDIS_URL`：全局 Redis 连接串（gateway 限流、system 字典缓存、storage 上传令牌等统一复用）
- `DB_URL`：各服务统一使用的 PostgreSQL 连接串
- `GATEWAY_TRUST_PROXY`：gateway 是否信任反向代理头，默认 `true`
- `GATEWAY_CORS_ORIGIN`：gateway 允许的跨域来源，默认 `*`
- `GATEWAY_RATE_LIMIT_ENABLED`：是否启用 gateway 令牌桶限流（默认 `true`）
- `GATEWAY_RATE_LIMIT_CAPACITY`：令牌桶容量（默认 `60`）
- `GATEWAY_RATE_LIMIT_REFILL_PER_SECOND`：每秒回填令牌数（默认 `30`）
- `GATEWAY_DOCS_CACHE_TTL_MS`：gateway docs 聚合 OpenAPI 缓存时长（毫秒，默认 `8000`）
- `GATEWAY_DOCS_FETCH_TIMEOUT_MS`：gateway 拉取 `/docs-json` 超时（毫秒，默认 `6000`）
- `GATEWAY_GRPC_TIMEOUT_MS`：gateway 调用内部 gRPC 服务统一超时（毫秒，默认 `5000`）
- `DB_URL`：PostgreSQL 配置

RabbitMQ 共用建议：

推荐最小配置：

```env
RABBITMQ_URL=amqp://root:rd@localhost:5672
RABBITMQ_EVENTS_EXCHANGE=lumimax.bus
RABBITMQ_QUEUE=lumimax.q.biz.events
RABBITMQ_DLX_QUEUE=lumimax.q.dead
IOT_RABBITMQ_QUEUE=lumimax.q.iot.stream
```

约定：

- 默认共用一个 RabbitMQ 实例与默认 `vhost`（`/`）及同一个 topic 交换机 `lumimax.bus`
- IoT 接入链路默认复用 `RABBITMQ_URL`；只有需要单独连接时才额外设置 `IOT_RABBITMQ_URL`（须与 `RABBITMQ_URL` 落在同一 vhost，否则启动配置校验会报错）
- **队列分工**：`lumimax.q.iot.stream` 由 **iot-service** 消费 `iot.up.#` / `iot.down.#`；`lumimax.q.biz.events` 由 **biz-service** 消费 `biz.iot.message.received`；`lumimax.q.dead` 统一承接 `dead.#`
- **iot-service** 启动时 `ensureIotDeadLetterTopology()` 声明 exchange / 队列 / 死信；biz 不再重复 assert bridge 拓扑
- `pnpm mq:setup` 为可选的管理 API 预创建 / topology 检查入口

## Storage 路径规范

- objectKey 不包含 provider、tenantId，provider 仅存储在 metadata 与数据库字段。
- 临时路径：
  - 已绑定用户：`tmp-file/user/{userId}/{filename}`
  - 未绑定用户：`tmp-file/device/{deviceId}/{filename}`
- 默认文件：`file/default/{category}/{mediaType}/{filename}`
- 用户头像：`file/user/{userId}/avatar/image/{filename}`
- 用户业务文件：`file/user/{userId}/{bizType}/{bizId}/{mediaType}/{filename}`
- 设备业务文件（未绑定用户）：`file/device/{deviceId}/{bizType}/{bizId}/{mediaType}/{filename}`

## Storage 临时上传令牌

- Redis key：`storage:upload-token:{tokenId}`
- tokenId：`ut_{ULID}`
- Redis TTL 与 token 有效期一致，token 可在有效期内重复上传多张图。
- prefix 规则：
  - 有 `userId`：`tmp-file/user/{userId}/`
  - 无 `userId`：`tmp-file/device/{deviceId}/`
- 上传 objectKey 必须属于 token 的 prefix。

## RabbitMQ 事件规范

- Shared vhost: `/`
- Exchange: `lumimax.bus`（topic，业务与 IoT 共用）
- Queues: **`lumimax.q.biz.events`**（biz 领域）、**`lumimax.q.iot.stream`**（iot bridge 上下行）、**`lumimax.q.dead`**（统一死信）
- Type: `topic`
- Routing Keys:
  - `audit.admin.action`
  - `device.telemetry`
  - `device.status`
  - `device.telemetry.reported`
  - `device.status.changed`
  - `device.command.requested`
  - `device.command.ack`
  - `device.shadow.synced`
  - `storage.upload.token.requested`
  - `storage.upload.token.issued`

说明：

- **iot-service** 处理 broker ingress、bridge 队列与 EMQX/AWS 下行发布。
- **biz-service**（`src/iot`）消费 `biz.iot.message.received`，衔接饮食 / 设备域；下行意图经 `IotDownlinkService` 入队 `iot.down.publish`。
- 共用 vhost `/` 与交换机 `lumimax.bus`，通过 **独立队列 + 路由键** 隔离。
- 上传凭证等仍由 biz ingest 转发至 `base-service` storage。
- 主线：`Device → EMQX → upstream queue → iot-service → biz.iot.message.received → biz-service`；下行：`biz-service → iot.down.publish → downstream queue → iot-service → EMQX HTTP API`。

统一事件结构：

```json
{
  "eventId": "01HZX...",
  "eventName": "xxx",
  "occurredAt": "2026-04-22T06:00:00.000Z",
  "source": "xxx-service",
  "data": {
    "orderId": "ord_xxx"
  },
  "requestId": "uuid32xxx"
}
```

## 数据库初始化与升级脚本

项目已提供 SQL 迁移体系，目录：

- `data/db/migrations/*.sql`
- `data/db/seeds/*.sql`
- `scripts/db/migrate.ts`
- `scripts/db/seed.ts`

常用命令：

```bash
# 查看状态（已执行/待执行）
pnpm db:migrate:status

# 执行迁移（包含初始化脚本）
pnpm db:migrate

# 查看 seed 状态
pnpm db:seed:status

# 执行初始化数据
pnpm db:seed

# 清空旧数据并重建 public schema
pnpm db:reset

# 从当前数据库导出新的重建基线 SQL
pnpm db:baseline:export

# 一次性完成 schema + seed
pnpm db:setup

# 部署初始化：只执行 schema migration，不写入 seed
pnpm infra:setup

# 需要初始化基础数据的环境：schema migration + seed
pnpm infra:setup:with-seed

# 清空旧数据后，重新执行 migration + seed
pnpm db:reinit

# 创建新的升级脚本模板
pnpm db:migration:create add_xxx_table

# 创建新的 seed 脚本模板
pnpm db:seed:create init_demo_data
```

说明：

- `pnpm db:setup` 现在会先执行自动建库；若目标库不存在，会先连接维护库（默认 `postgres`）创建目标库
- 可用 `DB_BOOTSTRAP_DATABASE` 覆盖维护库名称；执行账号需要具备 `CREATE DATABASE` 权限
- 当前全新基线 migration 为 `data/db/migrations/20260503100000_init_platform_schema.sql`
- 当前全新基线 seed 为 `data/db/seeds/20260503101000_init_platform_seed.sql`
- 基线直接对应现行 `base-service` / `biz-service` 实体模型，不再保留旧表兼容层
- 应用侧旧 TypeORM migration 已下线，当前以 `data/db/*` 为唯一数据库基线
- 当前统一基础实体主键为 `varchar(36)`，审计字段使用 `creator_id` / `editor_id`
- 当前实体时间字段统一映射为 `timestamp` 精度 3；当前 PostgreSQL 基线使用 `timestamp(3) without time zone`，按 UTC 读写
- `pnpm db:reset` 会直接删除 `public` schema 下全部旧数据，仅适用于本地/测试环境重建
- 后续每次数据库变更，新增一个 migration 文件，不要改已执行文件
- 后续每次新增固定初始化数据，新增一个 seed 文件，不要改已执行文件
- 迁移执行记录保存在 `public.schema_migrations`
- seed 执行记录保存在 `public.schema_seeds`
- 如需按数据库目标执行，可传入仓库脚本支持的 `--target=...` 参数；默认主路径以当前 `base-service` / `biz-service` 聚合后的 schema 为准
- API 启动时 Nest RMQ 会自动 assert exchange、主消费队列与消费者 bindings；`pnpm mq:setup` 保留为可选的 topology 预创建 / 检查工具，适合需要提前创建 dead queue / bindings 或做管理面巡检的环境
- 部署时推荐在启动 API 服务前执行 `pnpm infra:setup`；需要初始化基础数据的环境才执行 `pnpm infra:setup:with-seed`

本地推荐执行顺序：

```bash
docker compose up -d postgres rabbitmq redis
pnpm db:setup
```

### OTP 通知本地验证

当前 OTP 外部 HTTP 接口还未在新 gateway 中完成迁移；但 `base-service` 已可本地承接 `internal.notifications.otp.send` 并写入 `notification_messages`。

完成 `db:setup` 后，可按以下步骤验证通知落库：

```bash
# 1) 启动核心服务
pnpm dev:base

# 2) 通过现有内部链路或测试代码触发 internal.notifications.otp.send
#    预期结果：notification_messages 表新增一条 event_name=notification.otp.send 记录
```

验证 SQL（PostgreSQL）：

```sql
-- 最近 OTP 消息
select id, event_name, template_code, status, created_at
from notification_messages
where event_name = 'notification.otp.send'
order by created_at desc
limit 20;

-- 最近投递明细（确认 channel/provider/status）
select message_id, channel, provider, target, status, failure_reason, retry_count, created_at
from notification_deliveries
order by created_at desc
limit 20;
```

默认会写入一组可联调账号：

- B 端管理员：`admin / 123456`
- 默认权限域：`tenant_default`

## Gateway 限流

gateway 已接入基于 Redis 的令牌桶限流（Token Bucket）。

规则：

- 默认全局生效，挂载在 gateway 全部路由上
- 默认容量 `60`，默认回填速率 `30/s`
- 每次请求消耗 `1` 个令牌
- 限流键优先按登录用户 `userId`，其次按请求头 `x-user-id`，最后按客户端 `IP`
- 限流键会附带一级路径作用域；当前大多数接口位于 `/api/*` 下，因此通常共享同一组 `api` 配额
- 默认跳过路径：`/health`、`/api/docs`、`/api/docs-json`、`/api/gateway-docs`、`/favicon.ico`

超限行为：

- 返回 HTTP `429`
- 保持统一错误响应协议，包含 `requestId`
- 响应头包含 `x-ratelimit-limit`、`x-ratelimit-remaining` 和可选 `retry-after`

限制说明：

- 这是网关入口层的粗粒度限流，不是按单个接口单独配额
- 已登录流量主要按用户维度限制，匿名流量主要按 `IP` 限制
- Redis 不可用时会自动降级为 `fail-open`，即记录告警并放行请求，不会因为限流组件故障阻断业务
- 限流 Redis 统一复用 `REDIS_URL`；gateway 限流、system 字典缓存、storage 上传令牌可共用同一 Redis，并通过各自 key prefix / 使用场景隔离

并发与容量说明：

- 默认配置下，单个限流键可持续通过约 `30 请求/秒`，并允许最多约 `60` 个请求的短时突发
- 这里描述的是 gateway 入口限流阈值，不等同于整套系统经过压测验证的最大并发处理能力
- 系统实际可承载并发还取决于 gateway 实例数、数据库、Redis、RabbitMQ、下游服务处理耗时以及具体接口类型；如需对外声明“最大并发”，应以专项压测结果为准

## Swagger 访问方式

1. 启动目标服务（默认可用 `pnpm dev` 启动核心三服务）。
2. 对外统一入口：默认打开 gateway 的 `/docs`。
3. 查看其他服务文档时，继续通过 gateway 访问 `/docs/:service`，不要直接访问微服务地址。

## 通信架构

- Client -> Gateway：HTTP / HTTPS
- Gateway -> 内部业务服务：默认 gRPC
- 微服务同步调用：gRPC
- 微服务异步事件：RabbitMQ
- 内部少量 HTTP 保留给 `/health`、`/docs-json`、webhook / callback

当前实现里：

- gateway 默认按域路由到 `base-service` 与 `biz-service`
- gateway 聚合 Swagger 文档仍通过 HTTP 拉取各服务 `/docs-json`
- 客户端不直接访问内部微服务业务接口

3. gateway 自身 Swagger 仍保留在 `/gateway-docs`（本地调试可用）。
4. 微服务 `/docs` 建议仅用于本地联调，不作为客户端入口。
5. 需要鉴权的接口在页面中使用 Bearer Token 调试。

## Base Service User/Auth

- C 端登录：`POST /auth/user/login`
- B 端登录：`POST /auth/admin/login`
- Token 刷新：`POST /auth/refresh`
- 第三方登录预留：
  - `GET /auth/google/url`
  - `GET /auth/google/callback`
  - `POST /auth/wechat/login`
- 用户与后台基础能力现已归并到 `base-service`，统一通过后台管理与系统配置相关接口暴露
- 隐私请求接口：
  - `POST /privacy/requests/export`
  - `POST /privacy/requests/delete`
- JWT payload（B 端）包含：`userId`、`type`、`tenantId`、`roles`、`policies`、`permissions`
- `/admin/*` 鉴权链路：`JwtAuthGuard` + `InternalPrincipalGuard` + `PolicyGuard`（含 tenant scope 校验）

## Base Service Notification

- 监听业务事件：`order.created`、`order.paid`、`payment.success`、`device.status.changed`、`device.telemetry.reported`
- 消息中心编排：消息落库 -> 模板渲染 -> 偏好判断 -> 渠道路由 -> 投递记录 -> 重试
- 渠道路由：
  - `push` -> APNs/FCM/JPush adapter
  - `email/sms/webhook` -> 默认 adapter（预留替换真实 SDK）
- 管理接口（B 端）：
  - `GET /admin/notifications`
  - `POST /admin/notifications/test`
  - `GET /admin/templates`
  - `POST /admin/templates`
  - `PATCH /admin/templates/:id`
  - `GET /admin/device-tokens`

## Biz Service Device API

- `GET /admin/devices`
- `GET /admin/devices/:id`
- `POST /admin/devices`
- `POST /admin/devices/:id/bind`
- 鉴权：`JwtAuthGuard` + `InternalPrincipalGuard` + `PolicyGuard`

## AWS IoT Device Provisioning (MVP)

当前最小链路：

- Client/Admin -> `gateway`：`POST /admin/devices`
- `gateway` -> `biz-service`：设备管理 facade
- `biz-service` -> 云 IoT（AWS IoT Core）：
  - AWS: `CreateThing` / `CreateKeysAndCertificate` / `AttachPolicy` / `AttachThingPrincipal`
- `biz-service` 落库：
  - `devices`
  - `devices_iot`
- `gateway` 返回统一响应协议（`code/msg/data/timestamp/requestId`）

`POST /admin/devices` 示例请求：

```json
{
  "name": "Smart Lock A1",
  "provider": "aws",
  "deviceType": "smart-lock",
  "desiredThingName": "smart-lock-a1",
  "region": "ap-southeast-1",
  "policyName": "lumimax-device-policy",
  "tenantId": "tenant_default",
  "metadata": {
    "model": "A1",
    "batch": "2026Q2"
  }
}
```

说明：

- 客户端不直接调用云厂商 IoT API。
- 云侧 IoT 证书签发在 `iot-service`；设备主数据与编排仍在 `biz-service`（经 `IOT_SERVICE_GRPC_ENDPOINT` 调用）。
- 设备协议统一为 v1.0（`meta + data` / `v1/{channel}/{deviceId}/{direction}`）。
- 上行统一转 RabbitMQ， 下行统一通过 `PublishToDevice` -> provider 发布。
- `AWS_IOT_ENDPOINT` 可选；未配置时 AWS provisioning 会通过 `DescribeEndpoint(iot:Data-ATS)` 查询。

### IoT Bridge 配置（MVP）

最小配置项：

```env
IOT_VENDOR=emqx
IOT_PROTOCOL_VERSION=1.0
IOT_V1_UPLINK_TOPICS=v1/connect/+/req,v1/connect/+/status,v1/event/+/req,v1/attr/+/res,v1/cmd/+/res
IOT_RECEIVE_MODE=mq
AWS_SQS_QUEUE_URL=<queue_url>
EMQX_BROKER_URL=<internal-iot-service-broker-url, usually mqtts://emqx:8883>
EMQX_DEVICE_ENDPOINT=<device-facing-broker-endpoint, usually mqtts://devices.example.com:8883>
EMQX_ROOT_CA_PEM=<optional_ca_pem>
EMQX_ROOT_CA_KEY_PEM=<optional_ca_key_pem>
EMQX_MQTT_USERNAME=lumimax_iot
EMQX_MQTT_CLIENT_CERT_PEM=<optional_iot_service_client_cert>
EMQX_MQTT_CLIENT_KEY_PEM=<optional_iot_service_client_key>

# AWS IoT
IOT_REGION=ap-southeast-1
AWS_IOT_POLICY_NAME=lumimax-device-policy
AWS_IOT_ENDPOINT=<optional>
IOT_ACCESS_KEY_ID=<for provisioning>
IOT_ACCESS_KEY_SECRET=<for provisioning>

```

### IoT 当前代码结构（v1.4）

| 服务 | 路径 | 职责 |
| --- | --- | --- |
| `iot-service` | `apps/iot-service/src/` | ingress（EMQX/AWS）、`transport/iot-bridge.*`、upstream/downstream 消费、下行发布 |
| `biz-service` | `apps/biz-service/src/iot/` | `pipeline/*`（ingest/normalizer/dispatcher）、`transport/iot-biz-events.*`、`transport/iot-downlink.*` |
| `biz-service` | `apps/biz-service/src/device/` | 设备主数据；证书经 gRPC 委托 `iot-service` |
| `iot-service` | `apps/iot-service/src/provisioning/` | 设备证书签发（EMQX mTLS / AWS provisioning） |

规范与 env 分文件说明：[`docs/IoT通讯模块规范.md`](../docs/IoT通讯模块规范.md)。

设备协议 v1.0 / v1.3 不变；`gateway` webhook 与 gRPC 入口不变。

## 统一响应协议

以下规则适用于当前核心 HTTP 服务：`gateway`、`base-service`、`biz-service`。

`/ws` 已下线。

### 成功响应

```json
{
  "code": 0,
  "msg": "ok",
  "data": {},
  "timestamp": 1710000000000,
  "requestId": "6d8c9517-f451-40f2-87e2-09a6ea2cb8ad"
}
```

### 分页响应

```json
{
  "code": 0,
  "msg": "ok",
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5,
    "hasMore": true
  },
  "timestamp": 1710000000000,
  "requestId": "6d8c9517-f451-40f2-87e2-09a6ea2cb8ad"
}
```

### 错误响应

```json
{
  "code": 40000,
  "msg": "Bad Request",
  "data": null,
  "timestamp": 1710000000000,
  "requestId": "6d8c9517-f451-40f2-87e2-09a6ea2cb8ad",
  "error": {
    "details": {}
  }
}
```

### 业务错误码映射

- `BadRequestException -> 40000`
- `UnauthorizedException -> 40100`
- `ForbiddenException -> 40300`
- `NotFoundException -> 40400`
- `ConflictException -> 40900`
- `UnprocessableEntityException -> 42200`
- `InternalServerErrorException / unknown -> 50000`

### RequestId 规则

- 请求头优先读取 `x-request-id`，无则自动生成 `${uuid32}`。
- 响应头始终返回 `x-request-id`。
- 响应体中的 `requestId` 与响应头保持一致，便于跨服务链路排查。

## Shared Utils

通用能力已拆分到 `packages/*`，工程内部能力放在 `internal/*`。

推荐导入方式：

```ts
import { generateId, generateRequestId } from '@lumimax/runtime';
import { HashUtil } from '@lumimax/crypto-utils';
```

可用能力：

- `@lumimax/runtime`: request context、trace、ID 生成
- `@lumimax/crypto-utils`: 摘要、HMAC、AES 等通用加解密能力
- `@lumimax/http-kit`: 统一响应、异常过滤、Swagger、validation 装配
- `@lumimax/contracts`: 业务错误码、协议常量、IoT schema

示例：

```ts
const orderId = generateId(); // ULID, 业务主键
const requestId = generateRequestId(); // 链路追踪 ID
const now = DateUtil.format(DateUtil.now());
const port = EnvUtil.getNumber('HTTP_PORT', 4001);
```

## Logging

全仓统一使用 `pino + nestjs-pino`，开发环境优先可读性，生产环境保留结构化 JSON。

### 环境变量

- `LOG_LEVEL=error|warn|info|debug`（默认 `info`）
- `LOG_PRETTY=true|false`（开发环境默认 `true`）
- `LOG_DIR`（开发环境日志文件目录，默认项目根目录 `logs`）
- `LOG_STACK_MAX_LINES`（默认 `6`，用于精简堆栈）
- `LOG_SUPPRESS_HEALTHCHECK=true|false`（默认 `true`，抑制 `/health` `/docs` `/docs-json` 请求日志）
- `LOG_THIRD_PARTY_ERROR_THROTTLE_MS`（默认 `10000`，第三方重复错误节流窗口）

开发环境会同时输出两路日志：

- 控制台：按 `LOG_LEVEL` 输出
- 文件：额外写入 `logs/<service>.dev.log`（包含 `debug` 级别，用于完整排查）

路由摘要（`[...][Routes] ...`）降为 `debug` 级别，默认不打印到控制台，但会保留在开发日志文件中。

### requestId 用法

- 请求头可传 `x-request-id`，未传时自动生成 `${uuid32}`。
- 响应头和统一响应体都会回写同一个 `requestId`。
- HTTP、gRPC、RabbitMQ 事件均透传 `requestId`。
- 排查时先定位错误响应中的 `requestId`，再全仓检索同值日志即可串起链路。

### 如何看错误日志

- 错误日志会输出：
  - `service`
  - `context`
  - `requestId`
  - `errorType`
  - `rootCause`
  - `shortMessage`
  - `hint`
  - 精简后的 `stack`
- 常见依赖错误（Redis/RabbitMQ/gRPC/axios）会做根因提炼和节流，避免刷屏。

### 如何开启 Debug

```bash
LOG_LEVEL=debug pnpm dev:gateway
```

如需查看健康检查与 docs 请求日志，可设置：

```bash
LOG_SUPPRESS_HEALTHCHECK=false pnpm dev
```

### Redis / RabbitMQ 排障建议

1. 先看 `rootCause` 和 `hint` 字段。
2. Redis 常见问题：
   - `NOAUTH Authentication required`：检查 `REDIS_URL`/密码。
   - `ECONNREFUSED`：检查 Redis 服务与网络。
3. RabbitMQ 常见问题：
   - 连接失败：检查 `RABBITMQ_URL`、账号权限、broker 存活。
   - 事件发布失败：检查 queue/exchange 与消费者是否就绪。
