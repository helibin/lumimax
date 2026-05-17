# 配置文件规范

本仓库采用统一配置目录，并按「环境 + 服务」分层管理。

推荐结构（优先读取）：

- 共享配置：`configs/{env}/shared.env`
- 服务配置：`configs/{env}/{service}.env`

根目录兜底结构（兼容）：

- `configs/shared.env`
- `configs/{service}.env`

历史平铺结构（兼容）：

- `configs/shared.{env}.env`
- `configs/{service}.{env}.env`

提交到仓库的模板文件放在 `configs/` 根目录：

- `configs/shared.env.example`
- `configs/{service}.env.example`

这些模板遵循一个原则：

- `*.env.example` 只保留最小必填项和常改项
- 其余大部分配置依赖代码默认值
- 高级调优项统一写在本文档，不再堆进 example 文件

## 推荐环境

建议统一使用以下环境名：

- `development`
- `test`
- `staging`
- `production`

示例：

- `configs/development/shared.env`
- `configs/development/gateway.env`
- `configs/test/shared.env`
- `configs/staging/base-service.env`

## 加载优先级（非生产）

对于服务 `{service}` 和环境 `{env}`，按以下顺序加载（前面优先级更高）：

1. `configs/{env}/{service}.local.env`（可选，最高优先级）
2. `configs/{env}/shared.local.env`（可选）
3. `configs/{env}/{service}.env`
4. `configs/{env}/shared.env`
5. `configs/{service}.local.env`（根目录兜底）
6. `configs/shared.local.env`（根目录兜底）
7. `configs/{service}.env`（根目录兜底）
8. `configs/shared.env`（根目录兜底）
9. `configs/{service}.{env}.local.env`（历史兼容兜底）
10. `configs/shared.{env}.local.env`（历史兼容兜底）
11. `configs/{service}.{env}.env`（历史兼容兜底）
12. `configs/shared.{env}.env`（历史兼容兜底）

同名变量以后加载的值覆盖先加载的值。

## 环境选择规则

- 运行环境由 `NODE_ENV` 决定。
- 未设置 `NODE_ENV` 时，默认 `development`。
- 可通过 `ENV_FILE` 或 `DOTENV_CONFIG_PATH` 显式指定文件（支持逗号分隔多个路径）。

## 变量归属建议（shared / service）

放到 `shared` 的变量（多服务复用）：

- `DB_URL`
- `RABBITMQ_URL`
  默认使用 RabbitMQ vhost `/`，例如 `amqp://root:***@rabbitmq:5672`
- `RABBITMQ_EVENTS_EXCHANGE`
  默认建议为 `lumimax.bus`
- `REDIS_URL`
- `JWT_SECRET`（若确实使用统一鉴权密钥）

放到服务文件的变量（仅单服务使用）：

- `HOST`、`HTTP_PORT`、`GRPC_PORT` -> 各服务自己的监听配置
- `GATEWAY_*`、`BASE_SERVICE_GRPC_ENDPOINT`、`BIZ_SERVICE_GRPC_ENDPOINT` -> `gateway`
- `BASE_SERVICE_*` -> `base-service`
- `BIZ_SERVICE_*`、饮食 / Food Query 相关 -> `biz-service`
- `IOT_*`（厂商、EMQX、SQS、bridge 队列、离线扫描）-> `iot-service`；biz-service 仅保留领域 ingest（`RABBITMQ_QUEUE` / `biz.iot.message.received`）
- `IOT_RABBITMQ_QUEUE` -> `iot-service`（bridge）；`RABBITMQ_QUEUE` -> `biz-service`（`lumimax.q.biz.events`）；`RABBITMQ_DLX_QUEUE` -> 统一死信队列
- `RABBITMQ_QUEUE` -> biz-service；`IOT_RABBITMQ_QUEUE` -> iot-service

## 生产环境规则

生产环境（`NODE_ENV=production`）不读取 env 文件，必须通过部署平台注入变量，例如：

- Kubernetes Secret / ConfigMap
- 云厂商密钥管理服务
- CI/CD 环境变量

## 提交规则

允许提交：

- `*.env.example`

禁止提交：

- `configs/**/*.env`
- `configs/**/*.local.env`
- 任何真实敏感信息（如 `JWT_SECRET`、`*_API_KEY`、`*_ACCESS_KEY*`、数据库密码）

## 快速开始（development）

```bash
mkdir -p configs/development
cp configs/shared.env.example configs/development/shared.env
cp configs/gateway.env.example configs/development/gateway.env
cp configs/base-service.env.example configs/development/base-service.env
cp configs/biz-service.env.example configs/development/biz-service.env
cp configs/iot-service.env.example configs/development/iot-service.env
```

复制后请填写本地真实配置值。

## 最小部署清单

绝大多数环境只需要确认下面这些值：

- `JWT_SECRET`
- `REDIS_URL`
- `DB_URL`
- `RABBITMQ_URL`
  默认使用 RabbitMQ vhost `/`，例如 `amqp://root:***@rabbitmq:5672`
- `RABBITMQ_EVENTS_EXCHANGE`
  默认 `lumimax.bus`
- `RABBITMQ_QUEUE`
  默认 `lumimax.q.biz.events`
- `RABBITMQ_DLX_QUEUE`
  默认 `lumimax.q.dead`（须与业务 / IoT 主队列名不同；`dead.#` 统一落入此队列）
- `IOT_RABBITMQ_QUEUE`
  默认 `lumimax.q.iot.stream`；由 **iot-service** 消费（`iot.up.#`、`iot.down.#`）
- `IOT_RABBITMQ_MESSAGE_TTL_MS`
  默认不声明 TTL；如需启用，必须先确保 RabbitMQ 现有队列参数一致
- `STORAGE_ACCESS_KEY_ID` / `STORAGE_ACCESS_KEY_SECRET`（base-service 对象存储）
- `IOT_ACCESS_KEY_ID` / `IOT_ACCESS_KEY_SECRET`（iot-service EMQX HTTP API / AWS IoT / SQS）
- `IOT_RECEIVE_MODE`
  默认 `mq`；`mq` 表示下行走消息队列通道，AWS 上行对应 SQS，EMQX 上行对应 `iot-service` MQTT 共享订阅；`callback` 适合 EMQX webhook / internal auth 链路
- `IOT_VENDOR`
  默认 `emqx`；当前推荐运行形态也是 EMQX 为主、AWS 为辅
- `AWS_SQS_QUEUE_URL`（当 `IOT_RECEIVE_MODE=mq` 且 vendor=aws 时）
  常用于 AWS SQS
- `AWS_IOT_ENDPOINT`
- `AWS_IOT_POLICY_NAME`
- `EMQX_BROKER_URL`
  `iot-service` 自己连接 broker 的地址。当前推荐方案 A：`mqtts://emqx:8883`，并同时配置 `EMQX_MQTT_CLIENT_CERT_*` 与 `EMQX_ROOT_CA_PEM*`。
- `EMQX_DEVICE_ENDPOINT`
  设备侧下发的 broker 地址，推荐显式配置为 `mqtts://<device-facing-host>:8883`。未设置时，设备证书签发会回退到 `EMQX_BROKER_URL`。
- `EMQX_HTTP_BASE_URL`
  **推荐显式配置**。Compose 同网：`http://emqx:18083`；宿主机调试：`http://127.0.0.1:28083`。未设置时从 `EMQX_BROKER_URL` 推导（8883→18083）。**18083 为明文 HTTP**，勿写 `https://…:18083`。详见 [`docs/emqx-self-hosted-runbook.md`](../../docs/emqx-self-hosted-runbook.md) §4.2。
- `EMQX_HTTP_TLS_INSECURE`
  为 `true` 时 EMQX HTTP 发布跳过 TLS 证书校验（仅本地自签；生产勿用）
- `EMQX_ROOT_CA_PEM` / `EMQX_ROOT_CA_PEM_PATH`：信任 EMQX HTTPS API 的 CA；`EMQX_ROOT_CA_KEY_PEM`（当使用 EMQX mTLS 服务端签发时）
- `LLM_VISION_AK`（当食物识别启用 LLM 视觉能力时）
- `LLM_NUTRITION_AK`（当营养兜底估算启用 LLM 能力时）

## 高级配置参考

以下配置通常不需要显式写入 env，代码内已有默认值；只有在调优或接第三方能力时再覆盖：

- Gateway：
  `HOST`、`HTTP_PORT`、`BASE_SERVICE_GRPC_ENDPOINT`、`BIZ_SERVICE_GRPC_ENDPOINT`、`IOT_SERVICE_GRPC_ENDPOINT`
- Base-service：
  `SERVICE_NAME`、`HOST`、`HTTP_PORT`、`GRPC_PORT`、`STORAGE_VENDOR`、`STORAGE_REGION`、`STORAGE_UPLOAD_TTL_SECONDS`
- Iot-service：
  `SERVICE_NAME`、`HOST`、`HTTP_PORT`（默认 4040）、`GRPC_PORT`（默认 4140）、`BASE_SERVICE_GRPC_ENDPOINT`、`IOT_VENDOR`、`IOT_RECEIVE_MODE`、`EMQX_*`、`AWS_SQS_*`、`IOT_RABBITMQ_*`
- Biz-service：
  `SERVICE_NAME`、`HOST`、`HTTP_PORT`、`GRPC_PORT`、`BASE_SERVICE_GRPC_ENDPOINT`、`IOT_SERVICE_GRPC_ENDPOINT`、`RABBITMQ_QUEUE`、`IOT_VENDOR`、`IOT_RECEIVE_MODE`、`IOT_RABBITMQ_URL`、设备离线扫描；**不**配置 EMQX/AWS 证书与 `IOT_*`
- AI / Nutrition：
  `LLM_VISION_PROVIDER`、`LLM_VISION_MODEL`、`LLM_VISION_AK`、`LLM_VISION_TIMEOUT_MS`、`LLM_NUTRITION_PROVIDER`、`LLM_NUTRITION_MODEL`、`LLM_NUTRITION_AK`、`NUTRITION_DATA_PROVIDERS`、`OPENAI_BASE_URL`、`GEMINI_BASE_URL`、`NUTRITIONIX_BASE_URL`、`NUTRITIONIX_TIMEOUT_MS`、`USDA_FDC_BASE_URL`、`USDA_FDC_TIMEOUT_MS`、`OPEN_FOOD_FACTS_BASE_URL`、`OPEN_FOOD_FACTS_TIMEOUT_MS`、`EDAMAM_BASE_URL`、`EDAMAM_TIMEOUT_MS`
- Shared：
  `LOG_LEVEL`、`LOG_PRETTY`、`LOG_DIR`、`LOG_STACK_MAX_LINES`、`LOG_SUPPRESS_HEALTHCHECK`、`LOG_THIRD_PARTY_ERROR_THROTTLE_MS`、`TENANT_DEFAULT_ID`、`GATEWAY_*`、`AES_KEY`

## Test / Staging 示例

```bash
mkdir -p configs/test configs/staging
cp configs/shared.env.example configs/test/shared.env
cp configs/base-service.env.example configs/test/base-service.env
cp configs/biz-service.env.example configs/test/biz-service.env
cp configs/shared.env.example configs/staging/shared.env
```

说明：

- 当前默认运行组合为 `gateway` + `base-service` + `biz-service` + `iot-service`。
- `gateway.env.example` 已切到新架构默认值；旧服务 gRPC endpoint 仅保留为注释形式的 Phase 7 兼容项。
- `configs/development/archive/` 已归档旧服务 development env，仅用于历史回放或 fallback 调试。
- `/ws` 已下线；仓库默认 app 包含 `gateway`、`base-service`、`biz-service`、`iot-service`。
- 已删除服务的模板不再作为默认入口；如需历史回放，请使用 `configs/development/archive/` 中已归档文件，或自行从 Git 历史恢复。

启动时设置 `NODE_ENV=test` 或 `NODE_ENV=staging` 即可。
