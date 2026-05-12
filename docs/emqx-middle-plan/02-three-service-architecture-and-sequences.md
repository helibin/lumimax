# EMQX 中等方案：三服务架构与关键时序

## 1. 目标与边界

本文定义基于 EMQX 的中等方案三服务架构，用于替代现有 `AWS IoT Core + iot-bridge-service` 的设备接入面，同时保留现有平台的 `gateway + gRPC + RabbitMQ + PostgreSQL` 风格。

三服务为：

- `device-service`
- `pki-service`
- `iot-access-service`

这里使用 `iot-access-service`，不继续沿用 `iot-bridge-service`，原因是这版不再做多云适配，职责聚焦为“EMQX 接入、协议归一化、上下行桥接、接入态观测”。如果后续仍需 AWS/阿里云双云适配，可保留 `iot-bridge-service` 作为更外层 provider bridge，再让它复用本方案中的设备主数据与 PKI 能力。

不在本方案内：

- Fleet Provisioning / JITP / JITR
- 设备影子完整实现
- OTA 平台
- 多 Broker 主动双写
- 复杂动态策略系统

## 2. 三服务职责

### 2.1 `device-service`

负责：

- 设备主数据：设备、产品、租户、绑定关系、状态
- 设备接入身份与证书绑定关系
- 设备业务态：最近在线、最后遥测时间、命令记录、审计记录
- 对 `gateway` 暴露设备管理 API
- 对 `iot-access-service` 暴露同步查询接口
- 消费设备遥测、连接状态、命令回执等异步事件并落库

不负责：

- 签发或吊销证书
- 直接调用 EMQX Webhook/Auth Hook
- 直接处理 MQTT 连接和 topic 路由
- 设备厂商协议解析细节

### 2.2 `pki-service`

负责：

- Root CA / Intermediate CA 的使用与封装
- 服务端证书、设备客户端证书签发
- CSR 签名、证书轮换、吊销、宽限期管理
- 证书状态查询与审计
- 向 `device-service` 返回证书元数据，不承载设备业务主数据

不负责：

- 设备主数据管理
- 直接面向设备暴露 MQTT 接入能力
- 直接消费业务遥测消息

### 2.3 `iot-access-service`

负责：

- 作为 EMQX-facing 服务，对接：
  - HTTP AuthN / AuthZ
  - Webhook
  - 规则引擎转发
- 设备协议归一化：topic、payload、header、厂商差异字段
- 上行消息接收、校验、投递到 RabbitMQ
- 下行命令出站：把业务命令转换成设备可执行 MQTT 消息并发布到 EMQX
- 连接态、订阅态、投递态观测

不负责：

- 设备主数据最终归属
- 证书签发和吊销决策
- 复杂设备业务规则
- Admin API 聚合

## 3. 同步与异步交互

### 3.1 同步链路

推荐同步调用边界：

- `gateway -> device-service`：HTTP 入站后走 gRPC
- `device-service -> pki-service`：gRPC，适合发证、轮换、吊销、查证书元数据
- `iot-access-service -> device-service`：gRPC 或内部 HTTP
  - 用于 AuthN/AuthZ、设备状态查询、topic 许可校验
- `iot-access-service -> EMQX`：HTTP API 或 MQTT publish 接口
  - 用于命令下发、规则管理、接入配置
- `EMQX -> iot-access-service`：HTTP Webhook/AuthN/AuthZ

建议：

- 内部服务之间优先 `gRPC`
- EMQX 对接优先 `HTTP webhook/authz`，因为这是它的原生入口
- 对时延敏感且幂等要求强的链路保持同步，例如连接鉴权、命令下发前校验

### 3.2 异步链路

推荐走 RabbitMQ 的事件：

- `device.created`
- `device.certificate.issued`
- `device.certificate.rotated`
- `device.connection.changed`
- `device.telemetry.received`
- `device.event.received`
- `device.command.requested`
- `device.command.acknowledged`
- `device.command.timeout`

建议：

- `iot-access-service` 生产接入事件和回执事件
- `device-service` 生产业务命令事件
- `device-service` 消费连接态、遥测、命令回执并更新读模型

## 4. 设备协议约束

中等方案必须先把设备协议收敛，否则三服务边界会很快失真。

统一约束：

- MQTT over TLS，设备双向证书认证
- `clientId = deviceId`
- 证书主题建议 `CN=device:{deviceId}`
- 固定 topic 模板：
  - 上行遥测：`devices/{deviceId}/telemetry`
  - 上行事件：`devices/{deviceId}/events`
  - 下行命令：`devices/{deviceId}/commands`
  - 配置下发：`devices/{deviceId}/config`
  - 命令回执：`devices/{deviceId}/command-acks`

协议归一化由 `iot-access-service` 负责，至少输出：

- `deviceId`
- `messageType`
- `messageId`
- `occurredAt`
- `payload`
- `rawTopic`
- `rawPayload`
- `protocolVersion`

## 5. 关键时序

### 5.1 创建设备

```text
Admin
  -> Gateway: POST /admin/devices
Gateway
  -> device-service: gRPC CreateDevice(serialNo, productId, tenantId)
device-service
  -> device-service: persist device(status=pending)
device-service
  -> pki-service: gRPC IssueDeviceCertificate(deviceId, csr|subject)
pki-service
  -> CA: sign certificate
CA
  -> pki-service: certificate + serialNumber + notAfter
pki-service
  -> device-service: certificate metadata
device-service
  -> device-service: bind active certificate / persist audit
device-service
  -> RabbitMQ: device.created, device.certificate.issued
device-service
  -> Gateway: device info + certificate delivery reference
Gateway
  -> Admin: 201 Created
```

实现要点：

- `device-service` 先落主数据，再申请证书，避免“有证无设备”
- 若证书签发失败，设备保持 `pending`，允许重试发证
- 私钥优先设备侧生成并上传 CSR；如果平台代生成，必须限制交付窗口和审计

### 5.2 设备连接

```text
Device
  -> EMQX: MQTT CONNECT over TLS(client cert)
EMQX
  -> iot-access-service: HTTP AuthN(cert CN, clientId, peerhost)
iot-access-service
  -> device-service: gRPC CheckDeviceAccess(deviceId, certSerial, topic scope)
device-service
  -> iot-access-service: allow/deny + device status + cert status
iot-access-service
  -> EMQX: allow/deny
EMQX
  -> iot-access-service: Webhook client.connected
iot-access-service
  -> RabbitMQ: device.connection.changed
RabbitMQ
  -> device-service: consume connected event
device-service
  -> device-service: update lastSeenAt / online status
```

实现要点：

- 连接鉴权必须同步返回，超时应快速拒绝或按明确降级策略处理
- `iot-access-service` 可做 10-30 秒本地缓存，减轻频繁重连压力
- `device-service` 是设备状态真相源，`iot-access-service` 只做短时缓存

### 5.3 遥测上报

```text
Device
  -> EMQX: PUBLISH devices/{deviceId}/telemetry
EMQX
  -> iot-access-service: HTTP AuthZ(topic=telemetry, action=publish)
iot-access-service
  -> device-service: gRPC CheckTopicAcl(deviceId, topic, action)
device-service
  -> iot-access-service: allow
EMQX
  -> iot-access-service: Webhook or Rule push telemetry payload
iot-access-service
  -> iot-access-service: normalize protocol payload
iot-access-service
  -> RabbitMQ: device.telemetry.received
RabbitMQ
  -> device-service: consume telemetry event
device-service
  -> PostgreSQL: append telemetry index / update latest metrics / update lastTelemetryAt
```

实现要点：

- AuthZ 与消息摄取分离，避免单次处理过重
- 原始 payload 建议在 `iot-access-service` 保留摘要和 trace id，不必强依赖完整落库
- 真正高频时，遥测明细可后续拆到时序库，本阶段先保留业务索引和最近值

### 5.4 指令下发

```text
Admin/App
  -> Gateway: POST /devices/{deviceId}/commands
Gateway
  -> device-service: gRPC CreateCommand(deviceId, commandName, payload)
device-service
  -> PostgreSQL: persist command(status=requested)
device-service
  -> RabbitMQ: device.command.requested
RabbitMQ
  -> iot-access-service: consume command event
iot-access-service
  -> device-service: gRPC CheckDeviceCommandable(deviceId)
device-service
  -> iot-access-service: device online/offline + topic metadata
iot-access-service
  -> EMQX: publish devices/{deviceId}/commands
EMQX
  -> Device: MQTT downlink
Device
  -> EMQX: command ack / execution result
EMQX
  -> iot-access-service: webhook ack payload
iot-access-service
  -> RabbitMQ: device.command.acknowledged
RabbitMQ
  -> device-service: update command status
```

实现要点：

- 命令创建和命令投递分离，前者成功不代表设备已执行
- `device-service` 管命令状态机，`iot-access-service` 管投递
- 未回执场景通过延时队列或定时任务补 `timeout`

### 5.5 证书轮换

```text
Admin/Scheduler
  -> device-service: RotateDeviceCertificate(deviceId)
device-service
  -> pki-service: gRPC RotateCertificate(deviceId, oldCertSerial)
pki-service
  -> CA: issue new certificate
CA
  -> pki-service: new certificate metadata
pki-service
  -> device-service: new cert(status=pending), old cert(status=grace)
device-service
  -> RabbitMQ: device.certificate.rotated
device-service
  -> Gateway/Admin: return delivery reference

Device
  -> EMQX: reconnect with new certificate
EMQX
  -> iot-access-service: HTTP AuthN(new cert)
iot-access-service
  -> device-service: gRPC CheckDeviceAccess(new cert serial)
device-service
  -> iot-access-service: allow
iot-access-service
  -> RabbitMQ: device.connection.changed(new cert active)
RabbitMQ
  -> device-service: mark new cert active, old cert grace

Scheduler
  -> pki-service: Revoke old certificate after grace period
pki-service
  -> CA: revoke old certificate
pki-service
  -> device-service: old cert revoked
```

实现要点：

- 一台设备同时允许 `active + grace` 短时并存
- 旧证书吊销应晚于新证书成功连接确认
- 轮换触发可来自后台手工操作，也可来自定时任务

## 6. 部署边界与扩缩容

### 6.1 部署边界

- `EMQX` 单独部署，属于接入基础设施，不与业务服务混部
- `iot-access-service` 靠近 EMQX 部署，降低 Auth/Webhook 往返时延
- `device-service` 和 `pki-service` 属于业务后端集群，可与 `gateway` 同 VPC/同内网
- `PostgreSQL` 为设备主数据和命令状态真相源
- `RabbitMQ` 为上下行状态事件总线

### 6.2 扩缩容建议

`device-service`

- 以数据库写入和管理 API 压力为主做水平扩容
- 读多写多时需要把鉴权查询接口与后台管理接口隔离

`pki-service`

- 签发/吊销通常低频，可先小规格部署
- 若接 HSM、Vault 或外部 CA，要重点关注其并发与速率限制

`iot-access-service`

- 首先按连接数、Webhook TPS、命令投递速率做水平扩容
- 必须保持无状态，缓存只做短 TTL
- 所有实例都应能接收 EMQX Webhook

`EMQX`

- 单机可支持 MVP，进入试点后建议至少双节点集群
- 大量连接场景优先扩 EMQX 和 `iot-access-service`，不是先扩 `device-service`

## 7. 失败与重试策略

### 7.1 同步调用

- `gateway -> device-service`：失败直接返回，禁止盲重试创建类请求
- `device-service -> pki-service`：使用幂等键，例如 `deviceId + operationType`
- `iot-access-service -> device-service`：
  - AuthN/AuthZ 超时要有明确阈值，例如 300-800ms
  - 超时默认拒绝，避免放过冻结设备或吊销证书

### 7.2 异步消息

- RabbitMQ 消费必须幂等，按 `messageId` 或 `commandId` 去重
- `iot-access-service` 投递命令失败可重试有限次数，例如 3 次指数退避
- 遥测入队失败时可：
  - 先返回接收成功但写入 error log，不建议阻塞 MQTT 主通道
  - 关键事件可走死信队列

### 7.3 证书轮换

- 发新证书成功但设备未切换：维持 `pending`
- 新证书可连但状态未切换：通过连接事件补偿
- 旧证书吊销失败：延迟重试，不影响已激活新证书

## 8. 可观测性要求

至少落地以下观测面：

- `traceId` 贯穿：
  - `gateway`
  - `device-service`
  - `pki-service`
  - `iot-access-service`
  - RabbitMQ message headers
- 核心指标：
  - AuthN allow/deny rate
  - AuthZ allow/deny rate
  - EMQX webhook latency
  - device connect/disconnect count
  - telemetry ingest TPS
  - command publish success/failure/timeout
  - certificate issue/rotate/revoke counts
- 结构化日志：
  - `deviceId`
  - `clientId`
  - `certSerial`
  - `topic`
  - `commandId`
  - `messageId`
- 告警：
  - AuthN/AuthZ 错误率突增
  - `iot-access-service` Webhook 堵塞
  - RabbitMQ backlog 积压
  - 证书即将过期但未轮换

## 9. 实现建议

第一阶段按最小闭环推进：

1. `device-service` 先实现设备表、证书表、命令表、连接状态表
2. `pki-service` 先封装最小证书签发和吊销
3. `iot-access-service` 先实现：
   - EMQX AuthN
   - EMQX AuthZ
   - Webhook 接收
   - RabbitMQ 事件投递
4. topic 和 payload 模板先固定，不做复杂配置中心
5. 轮换先支持手工触发，再补调度自动化

这版的核心不是“复刻 AWS IoT Core 全功能”，而是以最少三服务完成：

- 可控设备身份
- 可控接入权限
- 可观测上下行链路
- 可执行证书轮换
