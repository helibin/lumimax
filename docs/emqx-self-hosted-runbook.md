# Lumimax 自建 EMQX 与设备全链路联调 Runbook

> **端口与 HTTP 下行约束**：§4.1–§4.2（平台默认 `http://emqx:18083` 发布；设备 `mqtts://:8883`；Compose 内勿用 `localhost` 访问 EMQX）。

本文把当前仓库里已经存在的 `EMQX -> /api/internal/iot/* -> biz-service -> iot ingest/downlink` 能力整理成一条可执行链路，目标是完成两件事：

1. 自建一套可控的 EMQX
2. 打通 `设备 -> EMQX -> iot-bridge(biz-service)` 全链路通信，并把证书、认证、ACL 一起落地

## 1. 仓库现状

当前仓库已经具备这些关键能力：

- `compose.stack.yml` 和 `api/docker-compose.infra.yml` 里已经包含 `emqx`
- `biz-service` 已提供内部回调入口：
  - `POST /api/internal/iot/auth`
  - `POST /api/internal/iot/acl`
  - `POST /api/internal/iot/ingest`
  - `POST /api/internal/iot/webhook`
- `InternalMqttAuthService` 会用 `EMQX_AUTH_SECRET` 校验 EMQX 回调请求
- `EmqxIngressService` 会把 EMQX 的认证、ACL、上行消息、生命周期事件转成内部标准入口
- `DeviceAccessValidationService` 会基于 `device_credentials` 中的 `credential_id`、`fingerprint`、设备状态、topic 规则做鉴权
- `issueEmqxDeviceCertificate()` 已支持两种证书模式：
  - `mtls-ca-signed`
  - `mtls-self-signed`
- `api/tools/mqttx` 已提供联调脚本

所以这次不是从零造，而是把部署面、证书面和操作面补齐。

## 2. 推荐落地方式

建议按下面顺序做：

1. 先起 `postgres / redis / rabbitmq / emqx / lumimax`
2. 先用 `1883 + HTTP auth/acl` 跑通控制面
3. 再开启 `8883 + mTLS`
4. 最后用 `mqttx` 或真实设备做全链路回归

这样可以把“broker 起不来”和“TLS 不通”这两类问题拆开。

## 3. 目录和新增脚手架

本次仓库里新增了这些文件：

- [docker/emqx/base.hocon](/Volumes/dev/workspace/@ai/lumimax/docker/emqx/base.hocon:1)
- [tools/emqx/generate-dev-certs.sh](/Volumes/dev/workspace/@ai/lumimax/tools/emqx/generate-dev-certs.sh:1)

用途：

- `base.hocon`：给自建 EMQX 预留 listener 配置入口
- `generate-dev-certs.sh`：本地生成开发环境用 CA、EMQX 服务端证书、测试设备证书

## 4. 环境变量

至少确认这些变量：

```env
IOT_VENDOR=emqx
IOT_RECEIVE_MODE=callback
EMQX_BROKER_URL=emqx:8883
EMQX_REGION=self-hosted
EMQX_AUTH_SECRET=replace-with-long-random-token
```

### 4.1 平台下行：默认 HTTP API（与 AWS / 阿里云等统一）

**硬约束**：自建 EMQX 时，**`iot-service`** 向设备下发，默认走 **EMQX HTTP API**，与 AWS IoT Data Plane、阿里云 IoT OpenAPI 等「控制面 HTTPS」对齐；**不是**让应用容器去 `mqtts://emqx:8883` 发下行（`EMQX_PUBLISH_MODE=mqtt` 仅作例外）。biz-service 只将 `iot.down.publish` 入队。

```env
EMQX_PUBLISH_MODE=http
EMQX_HTTP_BASE_URL=http://emqx:18083
IOT_ACCESS_KEY_ID=...
IOT_ACCESS_KEY_SECRET=...
```

- **优先显式配置** `EMQX_HTTP_BASE_URL`，不要依赖从 `EMQX_BROKER_URL=emqx:8883` 推导（易误配成 `https://…:18083` 导致 TLS 握手失败）。
- `EMQX_BROKER_URL` 仍表示 **MQTT broker**（设备连接、证书联调），常与 `emqx:8883` / `mqtts://…:8883` 同义；与 HTTP API 端口 **18083** 职责不同。
- 本地自签：开发可用 `EMQX_HTTP_TLS_INSECURE=true`，或配置 `EMQX_ROOT_CA_PEM` 校验 `https://emqx:18084`；**禁止**对 **18083** 使用 HTTPS（该口在 EMQX 上默认为明文 HTTP）。

仅当 `EMQX_PUBLISH_MODE=mqtt` 时，平台下行才需要下列 MQTT 客户端凭据（一般 **不必** 与 HTTP 下行同时配）：

```env
EMQX_MQTT_USERNAME=
EMQX_MQTT_PASSWORD=
# 或 mTLS
EMQX_MQTT_CLIENT_CERT_PEM=
EMQX_MQTT_CLIENT_KEY_PEM=
```

### 4.2 端口与谁连谁（Compose 内网 vs 宿主机）

`api/docker-compose.infra.yml` 中 EMQX 监听与宿主机映射（示例）：

| EMQX 容器端口 | 宿主机映射（默认） | 协议 / 用途 | 谁使用 |
| --- | --- | --- | --- |
| **8883** | `8883` | **MQTTS** | **设备**、MQTTX、固件联调（必须对「网外」暴露时映射） |
| **1883** | `2883` | 明文 MQTT | 本地快速测试（可选，生产设备用 8883） |
| **18083** | `28083` | **HTTP** REST API + Dashboard | 平台 **HTTP 下行**（Compose 内：`http://emqx:18083`）；本机浏览器/curl 用 `localhost:28083` |
| **18084** | `28084` | **HTTPS** REST API | 需要 TLS 调 API 时；本机 `https://localhost:28084`；**非** Compose 内 HTTP 下行默认口 |

**Compose 全在同一 `lumimax` 网络时（`compose.stack.yml`）**：

| 调用方 | 应使用的地址 | 不要用 |
| --- | --- | --- |
| `lumimax` / `biz-service` / `iot-service` 容器 → EMQX **下行 API** | `http://emqx:18083` | `localhost:18083`、`https://emqx:18083`、`mqtts://emqx:8883` 发 HTTP API |
| EMQX → gateway **webhook**（`IOT_RECEIVE_MODE=callback`） | `http://lumimax:80/api/internal/iot/...` | `http://127.0.0.1:4000/...`（容器内 127.0.0.1 不是 gateway） |
| 宿主机 MQTTX / 真机 → **broker** | `mqtts://127.0.0.1:8883`（或公网 IP:8883） | 18083 / 18084（设备不走 HTTP API 收消息） |

说明：应用容器内的 **`localhost` 指向自身**，不是 EMQX。平台访问 broker API 必须用服务名 **`emqx`**。

端到端：

```text
设备 ──MQTTS:8883──► EMQX ◄──HTTP:18083── iot-service（POST /api/v5/publish）
                              ▲
                         RabbitMQ（mq 模式下行任务）
```

### 4.3 设备证书（CA 签发）

如果要让平台直接给设备签发 CA 证书，再配置：

```env
EMQX_ROOT_CA_PEM=
EMQX_ROOT_CA_KEY_PEM=
```

说明：

- `EMQX_ROOT_CA_PEM + EMQX_ROOT_CA_KEY_PEM` 存在时，`issueEmqxDeviceCertificate()` 会签发 CA-signed 设备证书
- 两者都不配时，代码会退回 self-signed 模式
- 生产环境建议只保留 CA-signed，不建议长期使用 self-signed

## 5. 起自建 EMQX

### 5.1 纯 TCP 先跑通

先不启用 TLS，直接启动：

```bash
docker compose -f compose.stack.yml up -d emqx
```

Dashboard 默认走：

- `http://127.0.0.1:28083`

EMQX 官方文档说明：

- `base.hocon` 适合持久化 listener 配置
- `18083` 是 Dashboard HTTP 默认监听口
- `8883` 是 SSL listener 常用端口

来源：

- EMQX Listener Configuration: https://docs.emqx.com/en/emqx/latest/configuration/listener.html
- EMQX Dashboard Configuration: https://docs.emqx.com/en/emqx/latest/configuration/dashboard.html

### 5.2 生成开发证书

```bash
chmod +x ./tools/emqx/generate-dev-certs.sh
./tools/emqx/generate-dev-certs.sh
```

会生成：

- `docker/emqx/certs/ca.crt`
- `docker/emqx/certs/ca.key`
- `docker/emqx/certs/server.crt`
- `docker/emqx/certs/server.key`
- `docker/emqx/certs/device.crt`
- `docker/emqx/certs/device.key`

### 5.3 开启 TLS listener

编辑 [docker/emqx/base.hocon](/Volumes/dev/workspace/@ai/lumimax/docker/emqx/base.hocon:1)，把 `listeners.ssl.default` 和需要的话 `listeners.wss.default` 注释去掉，然后重启：

```bash
docker compose -f compose.stack.yml restart emqx
```

当前 compose 已经预留这些端口映射：

- `1883 -> ${EMQX_MQTT_PORT:-2883}`
- `8883 -> ${EMQX_MQTTS_PORT:-8883}`
- `18083 -> ${EMQX_DASHBOARD_PORT:-28083}`
- `18084 -> ${EMQX_DASHBOARD_TLS_PORT:-28084}`

## 6. 配置 EMQX 认证与 ACL

仓库里的后端是按 HTTP 回调模式准备好的，EMQX 端只需要把认证和授权请求转到 `biz-service`。

### 6.1 认证接口

回调地址：

```text
POST http://lumimax:80/api/internal/iot/auth
```

Header 建议至少带：

```text
Content-Type: application/json
Authorization: Bearer ${EMQX_AUTH_SECRET}
```

请求体建议至少包含：

```json
{
  "clientid": "${clientid}",
  "username": "${username}",
  "cert_fingerprint": "${cert_fingerprint}",
  "cert_serial_number": "${cert_serial_number}"
}
```

仓库返回体已经符合 EMQX 5 HTTP 认证要求：`result`、`is_superuser`、`client_attrs`。

EMQX 官方文档要求认证返回 JSON，并通过 `result` 决定 `allow|deny|ignore`：

- https://docs.emqx.com/en/emqx/latest/access-control/authn/http.html

### 6.2 ACL 接口

回调地址：

```text
POST http://lumimax:80/api/internal/iot/acl
```

Header 同上。

请求体建议至少包含：

```json
{
  "clientid": "${clientid}",
  "username": "${username}",
  "topic": "${topic}",
  "action": "${action}",
  "cert_fingerprint": "${cert_fingerprint}",
  "cert_serial_number": "${cert_serial_number}"
}
```

EMQX 官方文档里 HTTP Authorizer 的关键字段就是 `topic` 和 `action`：

- https://docs.emqx.com/en/emqx/latest/access-control/authz/http.html

## 7. 配置 EMQX 消息与生命周期回调

建议至少接两类：

### 7.1 设备上行消息

转发到：

```text
POST http://lumimax:80/api/internal/iot/ingest
```

Header：

```text
Content-Type: application/json
Authorization: Bearer ${EMQX_AUTH_SECRET}
```

消息里至少要传：

- `topic`
- `payload`
- `payload_encoding`，如果用了 base64
- `timestamp` 或 `publish_received_at`

`EmqxIngressService.ingest()` 会把它转给 `IotApplicationService.ingestCloudMessage()`。

### 7.2 连接/断连生命周期

转发到：

```text
POST http://lumimax:80/api/internal/iot/webhook
```

适合接：

- client connected
- client disconnected

`webhook()` 会把生命周期事件映射成内部 topic，然后复用 ingest 链路做统一处理。

## 8. 设备证书策略

建议明确分三层：

### 8.1 Broker 服务端证书

给 EMQX `8883/8084/18084` 用：

- `server.crt`
- `server.key`

### 8.2 平台根 CA

给设备客户端证书签发用：

- `ca.crt`
- `ca.key`

### 8.3 设备客户端证书

每台设备一套：

- `device certificate`
- `device private key`

仓库里设备证书会落到 `device_credentials`，关键字段有：

- `credential_id`
- `fingerprint`
- `certificate_pem`
- `private_key_pem`
- `status`

认证时后端会重点校验：

- 设备是否 active
- credential 是否 active
- 指纹是否匹配
- topic 是否只访问自己的设备路径

## 9. 联调步骤

### 9.1 启动整套服务

```bash
docker compose -f compose.stack.yml up -d
```

### 9.2 创建或准备一台设备

需要保证数据库里存在：

- `devices`
- `device_credentials`

并且：

- `devices.status=active`
- `device_credentials.status=active`

如果要走 mTLS，`device_credentials.fingerprint` 必须和设备证书实际指纹一致。

### 9.3 订阅下行

```bash
cd /Volumes/dev/workspace/@ai/lumimax/api
MQTT_HOST=127.0.0.1 \
MQTT_PORT=8883 \
MQTT_PROTOCOL=mqtts \
MQTT_CA=../docker/emqx/certs/ca.crt \
MQTT_CERT=../docker/emqx/certs/device.crt \
MQTT_KEY=../docker/emqx/certs/device.key \
DEVICE_ID=SN_12345 \
./tools/mqttx/mqttx-cli-subscribe-downlink.sh
```

如果当前走用户名密码，也可以额外传：

```bash
MQTT_USERNAME=SN_12345
MQTT_PASSWORD=your-password
```

### 9.4 发送上行

```bash
cd /Volumes/dev/workspace/@ai/lumimax/api
MQTT_HOST=127.0.0.1 \
MQTT_PORT=8883 \
MQTT_PROTOCOL=mqtts \
MQTT_CA=../docker/emqx/certs/ca.crt \
MQTT_CERT=../docker/emqx/certs/device.crt \
MQTT_KEY=../docker/emqx/certs/device.key \
DEVICE_ID=SN_12345 \
./tools/mqttx/mqttx-cli-publish-all.sh
```

### 9.5 验证链路

至少确认这几件事：

1. EMQX Dashboard 能看到客户端连接成功
2. `auth` 和 `acl` 回调返回 `allow`
3. `iot_messages` 有上行记录
4. `device_status_logs` 或 `device_runtime_statuses` 有状态更新
5. 下行 topic 能被订阅端收到

## 10. 常见坑

### 10.1 `clientid` 和设备 ID 不一致

当前代码默认要求：

- `clientId == device.id`

如果设备端还在用 `SN`、而平台用数据库主键式 `deviceId`，要先统一。

### 10.2 打开了 mTLS，但没把 CA 配给客户端

现象：

- `8883` 连不上
- TLS handshake fail

先核对：

- 设备端是否信任 `ca.crt`
- EMQX 服务端证书 SAN 是否包含 `emqx` 或 `localhost`

### 10.3 EMQX 回调 401

优先核对：

- `EMQX_AUTH_SECRET`
- EMQX Header 里是否真的带了 `Authorization: Bearer ...`

### 10.4 认证过了但 ACL 被拒

优先核对：

- topic 是否还是 `v1/...`
- `{deviceId}` 是否和连接身份一致
- 设备是否订阅了自己以外的 topic

## 11. 生产建议

- 生产环境只开 `8883`，关闭外部 `1883`
- 设备接入优先用 mTLS
- `EMQX_AUTH_SECRET` 使用长随机值，并只在内网回调链路使用
- `EMQX_ROOT_CA_KEY_PEM` 不要放在普通 env 文件里，建议接 Secret Manager
- EMQX Dashboard 首次登录后立即修改默认口令
- 后续可以把 EMQX 认证/授权配置也做成可复用的导入模板或 bootstrap 脚本
