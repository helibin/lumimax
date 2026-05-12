# EMQX 中等方案：数据模型、API、环境变量、交付清单

本文面向中等方案落地：保留当前 `gateway -> device-service / iot-access-service / pki-service` 的后端分层，用 EMQX 替换 AWS IoT Core 的接入面，但不做 Fleet Provisioning、复杂 Shadow、复杂命令编排。

## 1. 目标边界

- 设备通过 EMQX 使用 mTLS 接入。
- 设备身份以设备协议里的 `meta.deviceId` 为准，要求等于平台注册的 `device_id`。
- `device-service` 负责业务设备主数据、绑定、证书状态编排。
- `pki-service` 负责签发、轮换、吊销设备证书。
- `iot-access-service` 负责被 EMQX 回调的认证、ACL、连接审计、协议事件入口。
- `gateway` 仍然是后台管理唯一外部入口。

不做：

- 不复刻 AWS Thing Registry 全量能力。
- 不做通用 Device Shadow 平台。
- 不做复杂命令 ACK 状态机。
- 不让设备或客户端直接访问 CA、EMQX 管理接口。

## 2. 设备协议约束

来自当前设备协议的最小约束：

- 上行 Envelope 固定包含 `meta.requestId`、`meta.deviceId`、`meta.timestamp`、`meta.event`、`meta.version`。
- `meta.deviceId` 必须与证书映射出的设备身份一致。
- 设备事件先收敛为：
  - 上行：`connect.register`、`meal.record.create`、`food.analysis.request`、`food.analysis.confirm.request`、`nutrition.analysis.request`
  - 下行：`meal.record.result`、`food.analysis.result`、`food.analysis.confirm.result`、`nutrition.analysis.result`
- Topic 建议固定：
  - 上行发布：`devices/{deviceId}/up/{event}`
  - 下行订阅：`devices/{deviceId}/down/{event}`
  - 运维保留：`devices/{deviceId}/sys/connect`

这意味着 ACL 只需校验 `{deviceId}` 维度，不需要一开始上复杂策略树。

## 3. 服务拆分

### 3.1 device-service

职责：

- 创建设备、查询设备、冻结/退役设备
- 管理设备与租户/用户绑定
- 管理证书业务状态
- 提供后台查询 API

### 3.2 pki-service

职责：

- 签发设备证书
- CSR 签名
- 轮换证书
- 吊销证书
- 提供 CRL 或吊销状态查询

### 3.3 iot-access-service

职责：

- 提供给 EMQX 的 HTTP auth / ACL 回调
- 记录连接、断连、认证失败审计
- 接收 MQTT 上行消息并按协议转发内部事件
- 统一校验 `meta.deviceId` 与连接身份一致

## 4. PostgreSQL 数据模型

只保留中等方案当前值得做的表。

### 4.1 `devices`

用途：设备主数据和业务属性。

```sql
create table devices (
  id bigserial primary key,
  device_id varchar(64) not null unique,
  serial_number varchar(128) not null unique,
  product_key varchar(64),
  device_name varchar(128) not null,
  device_type varchar(64) not null,
  tenant_id varchar(64),
  owner_user_id varchar(64),
  market varchar(32),
  locale varchar(16),
  firmware_version varchar(64),
  provider varchar(32) not null default 'emqx',
  status varchar(24) not null default 'pending',
  provisioning_status varchar(24) not null default 'unprovisioned',
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

状态建议：

- `status`: `pending | active | frozen | retired`
- `provisioning_status`: `unprovisioned | provisioned | rotate_pending`

### 4.2 `device_certificates`

用途：设备证书生命周期。

```sql
create table device_certificates (
  id bigserial primary key,
  cert_id varchar(64) not null unique,
  device_id varchar(64) not null references devices(device_id),
  provider varchar(32) not null default 'local-ca',
  serial_number varchar(128) not null unique,
  thumbprint varchar(128) not null unique,
  subject_dn varchar(512) not null,
  issuer_dn varchar(512) not null,
  cert_pem_ref varchar(256),
  key_ref varchar(256),
  csr_ref varchar(256),
  not_before timestamptz not null,
  not_after timestamptz not null,
  status varchar(24) not null,
  activated_at timestamptz,
  revoked_at timestamptz,
  revoke_reason varchar(64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_device_certificates_device_id on device_certificates(device_id);
```

状态建议：

- `pending | active | grace | revoked | expired`

约束建议：

- 一台设备同时最多存在 1 张 `active`
- 最多存在 1 张 `pending`
- 最多存在 1 张 `grace`

### 4.3 `device_bindings`

用途：设备与用户/租户关系，不再保留云厂商绑定语义。

```sql
create table device_bindings (
  id bigserial primary key,
  device_id varchar(64) not null references devices(device_id),
  tenant_id varchar(64),
  user_id varchar(64),
  binding_type varchar(24) not null default 'owner',
  bound_at timestamptz not null default now(),
  unbound_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index idx_device_bindings_device_id on device_bindings(device_id);
```

### 4.4 `device_events`

用途：连接、发证、轮换、冻结、认证失败等审计事件。

```sql
create table device_events (
  id bigserial primary key,
  device_id varchar(64) not null references devices(device_id),
  event_type varchar(64) not null,
  request_id varchar(64),
  source_service varchar(64) not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_device_events_device_id on device_events(device_id, created_at desc);
```

### 4.5 `device_commands` 是否保留

保留，但只做最小后台下行记录，不做复杂 ACK 状态机。

理由：

- 后台主动下发配置或运维命令时，需要一个可查记录。
- 设备协议当前业务主链路偏请求-响应，ACK 复杂度可以延后。

```sql
create table device_commands (
  id bigserial primary key,
  command_id varchar(64) not null unique,
  device_id varchar(64) not null references devices(device_id),
  event varchar(64) not null,
  payload jsonb not null,
  status varchar(24) not null default 'queued',
  requested_by varchar(64),
  sent_at timestamptz,
  acked_at timestamptz,
  created_at timestamptz not null default now()
);
```

状态仅保留：

- `queued | sent | acked | failed`

### 4.6 `device_shadows` 是否保留

当前不建议首期落表。

理由：

- 当前设备协议主要是事件请求-响应，不依赖完整 desired/reported 模型。
- 中等方案重点是接入、安全和证书，不是状态镜像平台。

如后续确实需要远程配置持久化，可在二期增加：

- `desired_config`
- `reported_config`
- `version`

## 5. API 契约

以下契约按最小可实现范围给出。

## 5.1 Gateway / Admin API

### `POST /admin/devices`

用途：后台创建设备并触发首张证书签发。

请求：

```json
{
  "serialNumber": "SN_12345",
  "deviceName": "Kitchen Scale 01",
  "deviceType": "diet-scale",
  "tenantId": "t_001",
  "ownerUserId": "u_001",
  "market": "us",
  "locale": "en-US",
  "firmwareVersion": "1.0.0",
  "metadata": {
    "model": "LS-200"
  }
}
```

响应：

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "deviceId": "dev_01...",
    "serialNumber": "SN_12345",
    "status": "pending",
    "provisioningStatus": "provisioned",
    "certificate": {
      "certId": "cert_01...",
      "notAfter": "2027-05-12T00:00:00Z",
      "downloadToken": "one-time-token"
    }
  },
  "timestamp": 1770000000000,
  "requestId": "req_01..."
}
```

### `GET /admin/devices/{deviceId}`

返回设备详情、当前证书状态、最近连接时间。

### `GET /admin/devices`

支持按 `tenantId`、`status`、`serialNumber` 查询。

### `POST /admin/devices/{deviceId}/freeze`

请求：

```json
{
  "reason": "manual-risk-control"
}
```

### `POST /admin/devices/{deviceId}/retire`

请求：

```json
{
  "reason": "device-replaced"
}
```

### `GET /admin/devices/{deviceId}/certificates`

返回该设备证书列表和当前 `active/grace/pending` 状态。

### `POST /admin/devices/{deviceId}/certificates/rotate`

用途：后台触发换证。

请求：

```json
{
  "mode": "server_issue",
  "graceDays": 3
}
```

### `POST /admin/devices/{deviceId}/commands`

只保留后台最小下行命令能力。

请求：

```json
{
  "event": "device.config.update",
  "payload": {
    "locale": "en-US"
  }
}
```

## 5.2 device-service 内部 API

### `POST /internal/devices`

供 `gateway` 调用，创建设备主记录。

### `POST /internal/devices/{deviceId}/provisioning/complete`

供 `pki-service` 回调或内部调用，写入发证结果。

### `POST /internal/devices/{deviceId}/certificates/{certId}/activate`

设备切换成功后，置新证书为 `active`，老证书进入 `grace`。

### `POST /internal/devices/{deviceId}/certificates/{certId}/revoke`

吊销指定证书并写审计。

## 5.3 iot-access-service 给 EMQX 的回调 API

### `POST /internal/mqtt/auth`

用途：EMQX 连接阶段认证。

请求：

```json
{
  "clientid": "dev_01...",
  "username": "device:dev_01...",
  "peerhost": "10.0.0.12",
  "cert_subject": "CN=device:dev_01...",
  "cert_common_name": "device:dev_01...",
  "cert_serial_number": "12AB34CD"
}
```

认证规则：

- 根据证书 CN 或 serial number 找到 `device_id`
- 检查设备状态必须是 `active`
- 检查证书状态必须是 `active` 或 `grace`
- 记录 `auth.allow` 或 `auth.deny` 事件

响应：

```json
{
  "result": "allow",
  "is_superuser": false
}
```

### `POST /internal/mqtt/acl`

用途：EMQX publish / subscribe 授权。

请求：

```json
{
  "clientid": "dev_01...",
  "username": "device:dev_01...",
  "action": "publish",
  "topic": "devices/dev_01.../up/food.analysis.request"
}
```

授权规则：

- 设备只允许 `publish` 自己的 `devices/{deviceId}/up/+`
- 设备只允许 `subscribe` 自己的 `devices/{deviceId}/down/+`
- 可额外允许 `devices/{deviceId}/sys/connect`

响应：

```json
{
  "result": "allow"
}
```

### `POST /internal/mqtt/ingest`

用途：EMQX Rule Engine 或消费侧统一写入上行业务事件。

请求：

```json
{
  "deviceId": "dev_01...",
  "topic": "devices/dev_01.../up/food.analysis.request",
  "payload": {
    "meta": {
      "requestId": "req_001",
      "deviceId": "dev_01...",
      "timestamp": 1710000010000,
      "event": "food.analysis.request",
      "version": "1.3",
      "locale": "zh-CN"
    },
    "data": {}
  }
}
```

校验规则：

- `payload.meta.deviceId` 必须等于连接设备 `deviceId`
- `meta.event` 必须在协议白名单内
- 校验通过后发布内部事件给业务服务

## 5.4 pki-service API

### `POST /internal/certificates/issue`

用途：首次签发设备证书。

请求：

```json
{
  "deviceId": "dev_01...",
  "subject": {
    "commonName": "device:dev_01..."
  },
  "ttlDays": 365
}
```

响应：

```json
{
  "certId": "cert_01...",
  "serialNumber": "12AB34CD",
  "thumbprint": "sha256:...",
  "certificatePem": "-----BEGIN CERTIFICATE-----",
  "privateKeyPem": "-----BEGIN PRIVATE KEY-----",
  "caPem": "-----BEGIN CERTIFICATE-----",
  "notBefore": "2026-05-12T00:00:00Z",
  "notAfter": "2027-05-12T00:00:00Z"
}
```

### `POST /internal/certificates/sign-csr`

如设备端支持私钥本地生成，优先使用 CSR 模式。

### `POST /internal/certificates/rotate`

请求：

```json
{
  "deviceId": "dev_01...",
  "graceDays": 3,
  "ttlDays": 365
}
```

结果：创建新 `pending` 证书，不自动吊销旧证书。

### `POST /internal/certificates/{certId}/revoke`

用途：立即吊销证书并更新 CRL。

## 6. 环境变量清单

## 6.1 EMQX

```env
EMQX_NODE__NAME=emqx@127.0.0.1

EMQX_LISTENERS__SSL__DEFAULT__BIND="\"0.0.0.0:8883\""
EMQX_LISTENERS__SSL__DEFAULT__SSL_OPTIONS__CACERTFILE="\"/opt/emqx/etc/certs/ca.pem\""
EMQX_LISTENERS__SSL__DEFAULT__SSL_OPTIONS__CERTFILE="\"/opt/emqx/etc/certs/server.pem\""
EMQX_LISTENERS__SSL__DEFAULT__SSL_OPTIONS__KEYFILE="\"/opt/emqx/etc/certs/server.key\""
EMQX_LISTENERS__SSL__DEFAULT__SSL_OPTIONS__VERIFY=verify_peer
EMQX_LISTENERS__SSL__DEFAULT__SSL_OPTIONS__FAIL_IF_NO_PEER_CERT=true
EMQX_LISTENERS__SSL__DEFAULT__SSL_OPTIONS__ENABLE_CRL_CHECK=true

EMQX_MQTT__PEER_CERT_AS_USERNAME=cn
EMQX_MQTT__PEER_CERT_AS_CLIENTID=cn

EMQX_AUTH_HTTP__1__ENABLE=true
EMQX_AUTH_HTTP__1__METHOD=post
EMQX_AUTH_HTTP__1__URL=http://iot-access-service:3000/internal/mqtt/auth
EMQX_AUTH_HTTP__1__HEADERS__X-EMQX-TOKEN=replace-me

EMQX_AUTHORIZATION__SOURCES__1__TYPE=http
EMQX_AUTHORIZATION__SOURCES__1__ENABLE=true
EMQX_AUTHORIZATION__SOURCES__1__METHOD=post
EMQX_AUTHORIZATION__SOURCES__1__URL=http://iot-access-service:3000/internal/mqtt/acl
EMQX_AUTHORIZATION__SOURCES__1__HEADERS__X-EMQX-TOKEN=replace-me
```

注：

- 复杂的 auth/authz 数组配置，优先落 `cluster.hocon`，环境变量只保留关键项。

## 6.2 device-service

```env
PORT=3001
DATABASE_URL=postgresql://postgres:rd@postgres:5432/lumimax
DEVICE_ID_PREFIX=dev_
DEVICE_CERT_GRACE_DAYS=3
DEVICE_DEFAULT_MARKET=us
DEVICE_DEFAULT_LOCALE=en-US
PKI_SERVICE_BASE_URL=http://pki-service:3002
IOT_ACCESS_SERVICE_BASE_URL=http://iot-access-service:3003
AUDIT_EVENT_ENABLED=true
```

## 6.3 pki-service

```env
PORT=3002
DATABASE_URL=postgresql://postgres:rd@postgres:5432/lumimax
CA_PROVIDER=stepca
CA_BASE_URL=https://step-ca.internal
CA_ROOT_CERT_PATH=/app/certs/root_ca.crt
CA_PROVISIONER_NAME=device-provisioner
CA_PROVISIONER_PASSWORD=replace-me
CA_ISSUER_NAME=device-intermediate
CERT_DEFAULT_TTL_DAYS=365
CERT_ROTATE_GRACE_DAYS=3
CRL_PUBLISH_ENABLED=true
CRL_OUTPUT_PATH=/app/certs/crl.pem
```

## 6.4 iot-access-service

```env
PORT=3003
DATABASE_URL=postgresql://postgres:rd@postgres:5432/lumimax
EMQX_SHARED_TOKEN=replace-me
MQTT_DEVICE_ID_SOURCE=cert_cn
MQTT_CERT_CN_PREFIX=device:
MQTT_UP_TOPIC_TEMPLATE=devices/{deviceId}/up/{event}
MQTT_DOWN_TOPIC_TEMPLATE=devices/{deviceId}/down/{event}
MQTT_SYS_TOPIC_TEMPLATE=devices/{deviceId}/sys/connect
PROTOCOL_VERSION=1.3
INGEST_ENVELOPE_STRICT=true
RABBITMQ_URL=amqp://root:rd@rabbitmq:5672
```

## 7. 分阶段交付清单

## Phase 1：接入面打通

- [ ] EMQX mTLS 启用
- [ ] 测试 CA、服务端证书、1 台设备证书生成
- [ ] `iot-access-service` 的 `/internal/mqtt/auth` 可用
- [ ] `iot-access-service` 的 `/internal/mqtt/acl` 可用

验收标准：

- 设备拿测试证书可连接 `8883`
- 未带证书、吊销证书、冻结设备均无法连接
- 设备只能发布/订阅自己的 topic

## Phase 2：设备中心与后台管理

- [ ] 落库 `devices`、`device_certificates`、`device_bindings`、`device_events`
- [ ] `POST /admin/devices`
- [ ] `GET /admin/devices/{deviceId}`
- [ ] `POST /admin/devices/{deviceId}/freeze`
- [ ] `GET /admin/devices/{deviceId}/certificates`

验收标准：

- 后台创建设备后可查到主数据和首张证书
- 创建设备后 `meta.deviceId` 使用统一 `device_id`
- 冻结设备后现网连接被拒绝

## Phase 3：发证与轮换

- [ ] `pki-service` 首次签发接口
- [ ] `rotate` / `activate` / `revoke` 接口
- [ ] `grace` 状态流转
- [ ] CRL 发布或吊销状态生效

验收标准：

- 一台设备能存在 `active + pending`
- 新证书接入成功后老证书进入 `grace`
- `grace` 结束后老证书不可再连接

## Phase 4：协议接入与运维命令

- [ ] `iot-access-service` 校验上行 Envelope
- [ ] 协议白名单事件可转内部事件
- [ ] `POST /admin/devices/{deviceId}/commands`
- [ ] 最小 `device_commands` 记录

验收标准：

- 非法 `meta.deviceId` 或非法 `event` 被拒绝
- 后台下发命令后可查到 `queued/sent/acked/failed`
- 业务服务能收到标准化上行事件

## 8. 风险

- 设备端如果不支持平滑换证，`grace` 机制也救不了全量锁死风险。
- 当前协议使用 `meta.deviceId`，如果设备实际只认 `serialNumber`，需要在生产前统一映射策略。
- EMQX HTTP auth/authz 配置比 AWS IoT policy 更容易配错，首期必须有集成测试。
- 如果继续保留 AWS 风格的 `thingName/certificateArn` 思维，会把本地 CA 和 EMQX 方案再次做复杂。

## 9. 从当前 AWS 形态迁移的注意事项

### 9.1 保留的设计

- `gateway` 作为唯一外部入口保留。
- `device-service` 只维护业务主数据，这个边界保留。
- 云侧或接入侧能力外置，这个思想保留，只是从 `iot-bridge-service` 切到 `iot-access-service + pki-service`。

### 9.2 需要删除或改名的 AWS 语义

- `provider = aws` 改成默认 `provider = emqx`
- `providerThingName`、`providerThingArn`、`providerCertArn` 删除
- `device_cloud_bindings` 不再作为主表，改成更通用的 `device_certificates` 和 `device_bindings`
- `AttachPolicy` 思维改成 EMQX ACL 回调

### 9.3 数据迁移建议

- 现有 AWS 设备表如果已上线，保留 `legacy_provider_device_id` 到 `metadata`
- `thingName` 可迁入 `metadata.awsThingName`
- 旧证书 ARN 不迁为主键，仅保留审计值
- 先允许 `provider in ('aws', 'emqx')` 过渡，再在全量切换后收紧

### 9.4 接口迁移建议

- `POST /admin/devices` 对外路径保持不变
- 内部实现从 `ProvisionAwsThing` 改为：
  1. `device-service` 创建设备
  2. `pki-service` 签发证书
  3. `iot-access-service` 生效 ACL 与审计
- 不再向前端返回 AWS 风格的 `endpoint/certificateArn/privateKey`，改成一次性下载凭据或设备出厂烧录

## 10. 最终建议

首期只实现：

- `devices`
- `device_certificates`
- `device_bindings`
- `device_events`
- 最小 `device_commands`

暂不实现：

- `device_shadows`
- 复杂 ACK 状态机
- Fleet Provisioning 风格首连激活

这样能把中等方案控制在“可交付、可联调、可迁移”的范围内。
