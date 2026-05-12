# EMQX Middle Plan 01 - Protocol and Topic Contract

> Scope: move from the current AWS IoT Core style access path to a self-built EMQX middle layer, while keeping the existing Lumimax IoT envelope, diet protocol events, and three-service backend split practical for implementation.
>
> Inputs aligned:
> - `docs/diet-service-device-protocol-v1.0.md`
> - `api/internal/contracts/src/iot/schemas/*.json`
> - `docs/arch.md`

---

## 1. Purpose and design boundary

This document defines the device-facing MQTT contract for the EMQX middle plan.

It answers five concrete implementation questions:

1. How device identity is represented across certificate, MQTT client, and business records.
2. Which MQTT topics devices publish or subscribe to.
3. Which events belong to `device-service`, `diet-service`, and the EMQX middle layer.
4. How connect/register, command delivery, and ack/report flows work.
5. Which constraints firmware must follow for certificate rotation, retries, idempotency, and protocol versioning.

This document does not define:

- Admin HTTP APIs
- Internal RabbitMQ event contracts
- PKI service implementation details beyond firmware-visible rules
- OTA file transport details

---

## 2. Architecture fit

The target middle plan keeps three backend services on the server side:

1. `device-service`
   - device registry
   - certificate state
   - MQTT authn/authz callback
   - device online/offline and command ack persistence

2. `diet-service`
   - meal record
   - food analysis
   - nutrition analysis
   - diet business response generation

3. `iot-gateway-service` or `emqx-access-service`
   - EMQX-facing integration service
   - subscribes to normalized uplink topics
   - validates envelope/schema
   - routes events to internal bus or direct service handlers
   - publishes downlink messages to device topics

EMQX itself is only the MQTT access layer and routing point. It is not the business device registry.

---

## 3. Device identity model

### 3.1 Canonical identity

`deviceId` is the only canonical business device identity.

Rules:

- `deviceId` must match existing envelope schema constraints:
  - regex: `^[a-z0-9][a-z0-9_-]{0,127}$`
  - max length: 128
- `deviceId` is generated and persisted by `device-service`.
- All topic paths, internal routing, and business records use `deviceId`.

Example:

```txt
deviceId = device-01kqrnxjhphh2by35h0ay2gtn6
```

### 3.2 Certificate identity

Each device certificate must carry the same identity as `deviceId`.

Recommended constraints:

- Subject CN: `device:<deviceId>`
- SAN URI: `urn:lumimax:device:<deviceId>`
- SAN DNS is not used as the primary identity source

Example:

```txt
CN=device:device-01kqrnxjhphh2by35h0ay2gtn6
URI:urn:lumimax:device:device-01kqrnxjhphh2by35h0ay2gtn6
```

Why both:

- CN is easy to extract in EMQX authn.
- SAN URI is the long-term stable field if CN parsing rules tighten later.

### 3.3 MQTT client identity

The MQTT `clientId` must equal `deviceId`.

Rules:

- `clientId == deviceId`
- envelope `meta.deviceId == deviceId`
- certificate-derived identity must resolve to the same `deviceId`

Connection must be denied if any of the three differ.

### 3.4 Username usage

Firmware should not rely on username/password identity.

Recommended behavior:

- `username` optional
- if sent, use `username = deviceId`
- password auth is not used for production device access

### 3.5 Identity checks in auth path

`device-service` auth callback should validate at least:

1. certificate chain trusted
2. certificate status is `active` or `grace`
3. certificate CN/SAN resolves to one `deviceId`
4. MQTT `clientId` equals resolved `deviceId`
5. device record status is `active`

Connection deny examples:

- cert valid but device is frozen
- cert valid but `clientId` mismatch
- old cert already revoked

---

## 4. MQTT topic taxonomy

## 4.1 Topic design rules

Rules:

- Topics are device-scoped by `deviceId`.
- Event name is primarily inside the envelope `meta.event`, not exploded into topic hierarchy.
- Topic class indicates direction and routing semantics.
- Devices never publish to another device's topic namespace.

Base namespace:

```txt
lmx/v1/devices/{deviceId}/...
```

Version in topic path is the transport namespace version, not the business event version.

## 4.2 Device uplink topics

| Topic | Direction | Purpose | QoS | Retain |
| --- | --- | --- | --- | --- |
| `lmx/v1/devices/{deviceId}/up/events` | device -> cloud | business uplink events such as `connect.register`, `meal.record.create`, `food.analysis.request` | 1 | false |
| `lmx/v1/devices/{deviceId}/up/status` | device -> cloud | heartbeat and online status events | 1 | false |
| `lmx/v1/devices/{deviceId}/up/acks` | device -> cloud | command ack, command result, attr apply result | 1 | false |
| `lmx/v1/devices/{deviceId}/up/system` | device -> cloud | provisioning-visible system reports, cert rotation progress, upload token request | 1 | false |

## 4.3 Device downlink topics

| Topic | Direction | Purpose | QoS | Retain |
| --- | --- | --- | --- | --- |
| `lmx/v1/devices/{deviceId}/down/commands` | cloud -> device | actionable commands | 1 | false |
| `lmx/v1/devices/{deviceId}/down/responses` | cloud -> device | direct responses to business requests such as diet analysis result | 1 | false |
| `lmx/v1/devices/{deviceId}/down/system` | cloud -> device | registration result, attr sync, cert rotation notice, upload token result | 1 | false |

## 4.4 Broker/system topics

These are not consumed by firmware as business protocol topics:

| Topic | Consumer | Purpose |
| --- | --- | --- |
| `$SYS/...` | ops only | broker metrics and cluster status |
| `lmx/v1/internal/presence/...` | server only | optional normalized presence fanout from EMQX hooks |
| `lmx/v1/internal/dlq/...` | server only | dead-letter for invalid payloads if enabled |

Devices must not publish or subscribe to `$SYS/#`.

## 4.5 Topic ACL rules

A device identified as `{deviceId}` may only:

- publish:
  - `lmx/v1/devices/{deviceId}/up/events`
  - `lmx/v1/devices/{deviceId}/up/status`
  - `lmx/v1/devices/{deviceId}/up/acks`
  - `lmx/v1/devices/{deviceId}/up/system`
- subscribe:
  - `lmx/v1/devices/{deviceId}/down/commands`
  - `lmx/v1/devices/{deviceId}/down/responses`
  - `lmx/v1/devices/{deviceId}/down/system`

No wildcard subscription from firmware.

---

## 5. Envelope conventions

## 5.1 Base envelope

The existing schema stays valid:

```json
{
  "meta": {
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "deviceId": "device-01kqrnxjhphh2by35h0ay2gtn6",
    "timestamp": 1710000000000,
    "event": "connect.register",
    "version": "1.3",
    "locale": "zh-CN"
  },
  "data": {}
}
```

Required fields come from `envelope.schema.json`:

- `requestId`
- `deviceId`
- `timestamp`
- `event`
- `version`

## 5.2 Additional meta conventions

For EMQX middle plan, the following fields are recommended additions. They are optional at schema level for backward compatibility, but new firmware should send them where applicable.

| Field | Required when | Meaning |
| --- | --- | --- |
| `meta.correlationId` | response/ack | request or command correlation ID |
| `meta.commandId` | command ack/result | server-generated command ID |
| `meta.sessionId` | meal or connect session | device session or meal session correlation |
| `meta.traceId` | optional | cross-service tracing hint |

Rules:

- `requestId` is unique per device publish attempt semantic action.
- `correlationId` points to the initiating request or downlink command.
- `commandId` is assigned by server for downlink commands and echoed by device in ack/result.

## 5.3 Event naming convention

Keep existing event names because schema and diet-service already use them.

Classes:

- connect and status:
  - `connect.register`
  - `status.heartbeat`
- business requests:
  - `meal.record.create`
  - `food.analysis.request`
  - `food.analysis.confirm.request`
  - `nutrition.analysis.request`
- business responses:
  - `meal.record.result`
  - `food.analysis.result`
  - `food.analysis.confirm.result`
  - `nutrition.analysis.result`
- system/utility:
  - `upload.token.request`
  - `upload.token.result`
  - `attr.set`
  - `attr.set.result`
  - `cmd.ota.upgrade`
  - `cmd.ota.upgrade.accepted`
  - `cmd.ota.upgrade.progress`
  - `cmd.ota.upgrade.result`
- device command generic:
  - `cmd.device.reboot`
  - `cmd.device.sync_time`
  - `cmd.device.rotate_cert`
  - `cmd.device.refresh_config`

New command families should use `cmd.<domain>.<action>`.

---

## 6. Event ownership by service

This section prevents event routing ambiguity.

| Event | Topic class | Primary owner | Notes |
| --- | --- | --- | --- |
| `connect.register` | `up/events` | `device-service` | registration handshake, firmware/model snapshot |
| `status.heartbeat` | `up/status` | `device-service` | updates online state and last seen |
| `upload.token.request` | `up/system` | `device-service` | may delegate to storage service later |
| `attr.set.result` | `up/acks` | `device-service` | device applied cloud attributes |
| `cmd.ota.upgrade.accepted` | `up/acks` | `device-service` | command state tracking |
| `cmd.ota.upgrade.progress` | `up/acks` | `device-service` | command progress tracking |
| `cmd.ota.upgrade.result` | `up/acks` | `device-service` | final OTA result tracking |
| `meal.record.create` | `up/events` | `diet-service` | meal session create |
| `food.analysis.request` | `up/events` | `diet-service` | image/weight analysis |
| `food.analysis.confirm.request` | `up/events` | `diet-service` | user confirm or correction |
| `nutrition.analysis.request` | `up/events` | `diet-service` | meal summary |
| `meal.record.result` | `down/responses` | `diet-service` | response payload emitted via gateway |
| `food.analysis.result` | `down/responses` | `diet-service` | response payload emitted via gateway |
| `food.analysis.confirm.result` | `down/responses` | `diet-service` | response payload emitted via gateway |
| `nutrition.analysis.result` | `down/responses` | `diet-service` | response payload emitted via gateway |
| `cmd.device.*` | `down/commands` | `device-service` | generic device control |
| `cmd.ota.upgrade` | `down/commands` | `device-service` | OTA command control plane |
| `connect.register.result` | `down/system` | `device-service` | new result event, see below |

### 6.1 New recommended system response event

Add:

- `connect.register.result`

Reason:

- `connect.register` currently exists without an explicit server response schema.
- EMQX middle plan benefits from returning normalized device policy/config state after successful registration.

Minimum response payload:

```json
{
  "meta": {
    "requestId": "srv-reg-001",
    "deviceId": "device-01kqrnxjhphh2by35h0ay2gtn6",
    "timestamp": 1710000000100,
    "event": "connect.register.result",
    "version": "1.3",
    "correlationId": "cli-reg-001"
  },
  "data": {
    "code": 0,
    "msg": "ok",
    "serverTime": 1710000000100,
    "registered": true,
    "deviceStatus": "active",
    "desiredHeartbeatSec": 60,
    "configVersion": "2026-05-12.1"
  }
}
```

---

## 7. Connect/register flow

## 7.1 Transport connect

Device firmware sequence:

1. open TLS connection to EMQX `8883`
2. present client certificate
3. use `clientId = deviceId`
4. subscribe to:
   - `.../down/commands`
   - `.../down/responses`
   - `.../down/system`
5. publish `connect.register`
6. start heartbeat timer only after publish succeeds

## 7.2 `connect.register` request

Topic:

```txt
lmx/v1/devices/{deviceId}/up/events
```

Payload requirements:

- use existing `connect.register.schema.json`
- include at least:
  - `data.firmwareVersion`
  - `data.model`

Recommended additions:

- `data.protocolVersion`
- `data.hardwareRevision`
- `data.bootId`
- `data.ip`
- `data.networkType`

Example:

```json
{
  "meta": {
    "requestId": "reg-20260512-0001",
    "deviceId": "device-01kqrnxjhphh2by35h0ay2gtn6",
    "timestamp": 1770000000000,
    "event": "connect.register",
    "version": "1.3"
  },
  "data": {
    "firmwareVersion": "1.0.7",
    "model": "tings-scale-x1",
    "protocolVersion": "1.3",
    "hardwareRevision": "rev-a"
  }
}
```

## 7.3 Server handling

`device-service` should:

1. validate envelope and topic/device consistency
2. update `last_seen_at`
3. update firmware/model snapshot if changed
4. mark session online
5. publish `connect.register.result` to `down/system`

## 7.4 Heartbeat flow

Topic:

```txt
lmx/v1/devices/{deviceId}/up/status
```

Event:

- `status.heartbeat`

Minimum cadence assumption:

- every 60 seconds by default
- server may override via `connect.register.result.data.desiredHeartbeatSec`

Missed heartbeat policy for backend:

- mark offline after `2.5 x desiredHeartbeatSec` with no message

---

## 8. Business request/response flow

Diet-service flow stays close to `diet-service-device-protocol-v1.0.md`.

## 8.1 Meal flow topics

Device publishes:

- `meal.record.create`
- `food.analysis.request`
- `food.analysis.confirm.request`
- `nutrition.analysis.request`

All on:

```txt
lmx/v1/devices/{deviceId}/up/events
```

Server responds on:

```txt
lmx/v1/devices/{deviceId}/down/responses
```

With events:

- `meal.record.result`
- `food.analysis.result`
- `food.analysis.confirm.result`
- `nutrition.analysis.result`

## 8.2 Correlation rules

For every request/response pair:

- response `meta.correlationId = request.meta.requestId`
- response may reuse or generate a different `meta.requestId`
- device must use `correlationId` to match async response

## 8.3 Delivery assumption

- Requests and responses use QoS 1.
- Application logic must still be idempotent because QoS 1 can duplicate.

---

## 9. Command and ack flow

## 9.1 Downlink command envelope

Cloud-originated commands go to:

```txt
lmx/v1/devices/{deviceId}/down/commands
```

Example:

```json
{
  "meta": {
    "requestId": "srv-cmd-1001",
    "deviceId": "device-01kqrnxjhphh2by35h0ay2gtn6",
    "timestamp": 1770000001000,
    "event": "cmd.device.rotate_cert",
    "version": "1.3",
    "commandId": "cmd_01kqrz5l2dfh7m3v3d8s0s9k6b"
  },
  "data": {
    "rotateToken": "rot_123",
    "notAfter": 1772592000000,
    "switchDeadline": 1770600000000
  }
}
```

## 9.2 Ack stages

Every downlink command should support up to two uplink acks:

1. accepted ack
2. final result

For generic commands:

- accepted event: `cmd.<domain>.<action>.accepted`
- result event: `cmd.<domain>.<action>.result`

For already-existing OTA commands, current events stay:

- `cmd.ota.upgrade.accepted`
- `cmd.ota.upgrade.progress`
- `cmd.ota.upgrade.result`

Ack topics:

```txt
lmx/v1/devices/{deviceId}/up/acks
```

## 9.3 Ack requirements

Device must:

1. publish accepted ack immediately after local validation
2. include `meta.commandId`
3. include `meta.correlationId = server requestId`
4. publish final result exactly once per execution outcome

If device reboots after accepted but before result:

- firmware should resend final result if local task journal exists
- otherwise backend relies on timeout and marks command uncertain

## 9.4 Example OTA accepted

```json
{
  "meta": {
    "requestId": "ack-ota-001",
    "deviceId": "device-01kqrnxjhphh2by35h0ay2gtn6",
    "timestamp": 1770000001500,
    "event": "cmd.ota.upgrade.accepted",
    "version": "1.3",
    "commandId": "cmd_01kqrz5l2dfh7m3v3d8s0s9k6b",
    "correlationId": "srv-cmd-1002"
  },
  "data": {
    "otaId": "ota_20260512_001",
    "accepted": true
  }
}
```

---

## 10. Certificate-related firmware constraints

This section is intentionally device-visible and implementation-specific.

## 10.1 Certificate material layout

Firmware must store at least:

- active client certificate
- active private key
- server CA chain

Recommended for rotation:

- pending client certificate
- pending private key
- current cert serial number
- current cert expiry time

## 10.2 Rotation model

The middle plan assumes dual-certificate overlap, not instant replacement.

Visible constraints:

1. device may receive `cmd.device.rotate_cert`
2. device downloads or imports new cert/key material out of band or in follow-up system payloads
3. device validates material locally before switching
4. device reconnects with new cert before old cert grace expires

## 10.3 Device-side behavior requirements

Firmware must:

- keep `clientId` unchanged during certificate rotation
- never derive a new `deviceId` from new certificate contents
- reject certificate package if CN/SAN resolves to a different `deviceId`
- support reconnect with new certificate without factory reset

## 10.4 Time and expiry assumptions

Firmware must have sufficiently correct time for certificate validity checks.

Practical rule:

- if device has no RTC confidence, it must register and fetch time sync before judging near-expiry policies locally

## 10.5 Rotation reporting

Recommended events:

- accepted: `cmd.device.rotate_cert.accepted`
- progress: `cmd.device.rotate_cert.progress`
- result: `cmd.device.rotate_cert.result`

These should use `up/acks`.

## 10.6 Failure semantics visible to firmware

Typical local failure reasons:

- certificate package signature invalid
- cert CN/SAN mismatch with deviceId
- key/cert pair mismatch
- reconnect failed before switch deadline
- storage write failure

Suggested error codes:

| Code | Meaning |
| --- | --- |
| `CERT_IDENTITY_MISMATCH` | cert identity does not map to current deviceId |
| `CERT_KEY_MISMATCH` | private key does not match certificate |
| `CERT_EXPIRED` | cert already expired or unusable |
| `CERT_SWITCH_TIMEOUT` | failed to reconnect before deadline |
| `CERT_STORAGE_FAILED` | local secure storage failure |

---

## 11. Error handling

## 11.1 Transport-level

Transport failures are handled by MQTT and TLS:

- connect denied: device retries with exponential backoff
- publish not acked by broker: device retries same message with same `requestId`

Recommended reconnect backoff:

- 1s, 2s, 5s, 10s, 30s, max 60s with jitter

## 11.2 Application-level result payloads

Response and result events should follow the existing pattern:

- `data.code`
- `data.msg`

Rules:

- `code = 0` means success
- non-zero means application error
- `msg` should be short and stable, not stack traces

Recommended categories:

| Range | Meaning |
| --- | --- |
| `0` | success |
| `1xxx` | request validation errors |
| `2xxx` | device state or authorization errors |
| `3xxx` | business processing errors |
| `5xxx` | server temporary errors |

## 11.3 Invalid event handling

When server receives invalid payload:

1. reject at schema or routing layer
2. optionally publish a system error response to `down/system`
3. log original `requestId`, `deviceId`, `event`, reason

Recommended event:

- `system.error`

Example data:

```json
{
  "code": 1001,
  "msg": "invalid payload",
  "sourceEvent": "food.analysis.request"
}
```

## 11.4 Unknown command handling

If device receives unsupported downlink command:

1. publish `.result` event with failure
2. use stable error code such as `CMD_UNSUPPORTED`

Do not silently drop.

---

## 12. Idempotency rules

QoS 1 means duplicate delivery is possible on both uplink and downlink.

## 12.1 Uplink idempotency

Server must deduplicate by:

- `deviceId`
- `meta.requestId`
- `meta.event`

Recommended dedup TTL:

- at least 24 hours for requests
- at least 7 days for command result events

Examples:

- repeated `connect.register` with same `requestId`: safe replay, return same logical result
- repeated `meal.record.create` with same `requestId`: return same `mealRecordId`
- repeated `cmd.ota.upgrade.result` with same `requestId`: ignore duplicate state transition

## 12.2 Downlink idempotency

Server command identity is `commandId`.

Firmware must:

- treat duplicate downlink with same `commandId` as same command
- avoid executing the same side-effect twice if previous state is durable

If device cannot determine prior execution state, it should:

- emit result with `code != 0` and explain uncertain execution

---

## 13. Versioning policy

There are two versions in play.

## 13.1 Topic namespace version

`lmx/v1/...` is the transport namespace version.

Change this only for breaking topic tree changes.

## 13.2 Envelope `meta.version`

`meta.version` is the business protocol version.

Current baseline:

- `1.3`

Rules:

- additive fields: keep same major, may update minor
- removing or renaming required fields: bump protocol major
- old firmware may continue using `1.3` while backend supports a compatibility window

## 13.3 Compatibility rule

During migration from AWS IoT style access to EMQX:

- keep event names and envelope shape stable
- only replace provider-specific topic mapping and auth path

This is the main lever for low-risk migration.

---

## 14. Practical implementation assumptions

1. Devices support MQTT over TLS mutual auth.
2. Devices can configure `clientId` independently from certificate contents.
3. Existing diet protocol events remain valid and should not be renamed during broker migration.
4. EMQX authn/authz integrates with `device-service` through HTTP callback or equivalent extension hook.
5. Uplink messages are normalized before business routing, either by EMQX rule engine or `iot-gateway-service`.
6. Command delivery is asynchronous; device is not expected to hold a request/response socket model.
7. Device-side secure storage can keep at least one active cert set and preferably one pending cert set.
8. `upload.token.result`, `connect.register.result`, and generic command ack/result schemas may need to be added to the contract repo after this document is accepted.

---

## 15. Open questions

1. Should `connect.register.result` and `system.error` be added as official JSON schemas in `api/internal/contracts/src/iot/schemas` now, or in a later protocol patch?
2. Should the middle layer route by topic class only, or also enforce an event allowlist per topic to catch misplaced payloads early?
3. Do we want retained device desired-state/config messages in `down/system`, or keep all downlink non-retained for simpler firmware semantics?
4. Is certificate rotation material delivered through MQTT payload, HTTPS download, or pre-signed object storage URL?
5. Does the current device firmware have local durable journaling for command execution, which is needed for strong idempotency after reboot?
6. Should `diet-service` reply directly through the gateway publisher, or emit internal events that `iot-gateway-service` converts to MQTT responses?
7. Do we need a dedicated `device.shadow.*` event family in the first EMQX middle phase, or can that stay out of scope?

---

## 16. Recommended next artifacts

After this document is approved, the next implementation documents should be:

1. EMQX authn/authz callback contract for `device-service`
2. JSON schema additions:
   - `connect.register.result`
   - `upload.token.result`
   - `cmd.device.rotate_cert.accepted`
   - `cmd.device.rotate_cert.result`
   - `system.error`
3. Internal event routing matrix between `iot-gateway-service`, `device-service`, and `diet-service`
4. Certificate rotation sequence doc for firmware and PKI service
