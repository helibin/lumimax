# EMQX ACL Deployment Guide

本文定义 Lumimax 当前 `iot-service + EMQX` 接入下的 MQTT ACL 规则、共享订阅写法和部署侧配置样例。

适用范围：

- `IOT_VENDOR=emqx`
- `IOT_RECEIVE_MODE=mq`
- 设备 topic 采用当前仓库约定：
  - 上行请求：`v1/{category}/{deviceId}/req`
  - 下行响应：`v1/{category}/{deviceId}/res`

相关代码：

- [api/apps/iot-service/src/ingress/emqx-ingress.service.ts](/Volumes/dev/workspace/@ai/lumimax/api/apps/iot-service/src/ingress/emqx-ingress.service.ts:89)
- [api/apps/iot-service/src/ingress/emqx-shared-subscription.service.ts](/Volumes/dev/workspace/@ai/lumimax/api/apps/iot-service/src/ingress/emqx-shared-subscription.service.ts:253)
- [api/packages/iot-kit/src/providers/emqx/emqx-broker-downlink.constants.ts](/Volumes/dev/workspace/@ai/lumimax/api/packages/iot-kit/src/providers/emqx/emqx-broker-downlink.constants.ts:1)

## 1. Target rules

平台侧 `iot-service` 身份：

- `username`: `iot_service`
- `clientId`: `lumimax-iot-service-{instanceId}`

平台侧允许：

- `subscribe`: `$share/lumimax-iot/v1/+/+/req`
- `publish`: `v1/+/+/res`

设备侧身份：

- `clientId = deviceId`

设备侧只允许：

- `publish`: `v1/+/{clientId}/req`
- `subscribe`: `v1/+/{clientId}/res`

硬约束：

- 设备不能订阅 `v1/+/+/req`
- 设备不能发布 `v1/+/+/res`
- 只有 `iot-service` 才能订阅 `$share/<group>/v1/+/+/req`

## 2. Shared subscription

EMQX 共享订阅不是控制台开关，而是订阅 topic 写成：

```text
$share/{group}/真实Topic
```

Lumimax 推荐：

```text
$share/lumimax-iot/v1/+/+/req
```

多个 `iot-service` 实例只要：

- 使用相同 group：`lumimax-iot`
- 使用不同 clientId：`lumimax-iot-service-{instanceId}`

就会形成消费组。

## 3. Recommended runtime settings

- 核心业务消息：`QoS 1`
- 心跳 / 高频遥测：`QoS 0`
- `clean session: true`

建议：

- 上行共享订阅 clientId 不要复用设备命名
- 集群内每个实例使用不同 `instanceId`
- `EMQX_SHARED_SUBSCRIPTION_GROUP` 与实际订阅 topic 中的 group 保持一致

## 4. EMQX file ACL example

如果使用文件 ACL，可以按下面的思路配置。

示例：

```erlang
%% iot-service
{allow, {username, "iot_service"}, subscribe, ["$share/lumimax-iot/v1/+/+/req"]}.
{allow, {username, "iot_service"}, publish,   ["v1/+/+/res"]}.

%% device
%% 约定 clientId == deviceId
{allow, {clientid, "%c"}, publish,   ["v1/+/%c/req"]}.
{allow, {clientid, "%c"}, subscribe, ["v1/+/%c/res"]}.

%% deny protected directions for everyone else
{deny, all, subscribe, ["v1/+/+/req"]}.
{deny, all, publish,   ["v1/+/+/res"]}.

%% fallback
{deny, all}.
```

说明：

- `%c` 表示当前客户端 `clientid`
- 设备规则依赖 `clientId = deviceId`
- 共享订阅必须写完整 `$share/lumimax-iot/...`
- 如果你使用的 ACL 后端不支持 `%c` 这种变量，需要在外部鉴权服务里做同等判断

## 5. HTTP ACL example

如果使用 HTTP ACL，EMQX 通常会把 `username`、`clientid`、`action`、`topic` 发给 ACL 服务。

允许返回：

```json
{
  "result": "allow",
  "is_superuser": false
}
```

拒绝返回：

```json
{
  "result": "deny",
  "is_superuser": false
}
```

推荐逻辑：

```ts
if (username === 'iot_service' || clientId.startsWith('lumimax-iot-service-')) {
  if (action === 'subscribe' && topicMatches(topic, '$share/lumimax-iot/v1/+/+/req')) {
    return { result: 'allow', is_superuser: false };
  }
  if (action === 'publish' && topicMatches(topic, 'v1/+/+/res')) {
    return { result: 'allow', is_superuser: false };
  }
  return { result: 'deny', is_superuser: false };
}

if (action === 'publish' && topicMatches(topic, `v1/+/${clientId}/req`)) {
  return { result: 'allow', is_superuser: false };
}

if (action === 'subscribe' && topicMatches(topic, `v1/+/${clientId}/res`)) {
  return { result: 'allow', is_superuser: false };
}

return { result: 'deny', is_superuser: false };
```

当前仓库实现已经按这个原则收紧：

- 平台侧只允许共享订阅 `req`
- 平台侧只允许发布 `res`
- 设备侧 ACL 仍由设备鉴权服务按设备身份校验

## 6. Built-in DB / JWT ACL guidance

如果你使用内置数据库 ACL 或 JWT ACL，原则不变：

- 给 `iot_service` 单独身份
- 给设备使用 `clientId = deviceId`
- 平台侧只放行：
  - `subscribe $share/lumimax-iot/v1/+/+/req`
  - `publish v1/+/+/res`
- 设备侧只放行：
  - `publish v1/+/${clientid}/req`
  - `subscribe v1/+/${clientid}/res`

不要把平台侧账号设成全局 superuser。

## 7. Validation checklist

部署后至少验证这几项：

1. `iot_service` 可以订阅：
   - `$share/lumimax-iot/v1/event/device-001/req`
2. `iot_service` 不能订阅：
   - `v1/event/device-001/req`
3. `iot_service` 可以发布：
   - `v1/event/device-001/res`
4. `iot_service` 不能发布：
   - `v1/event/device-001/req`
5. 设备 `device-001` 可以发布：
   - `v1/event/device-001/req`
6. 设备 `device-001` 可以订阅：
   - `v1/event/device-001/res`
7. 设备 `device-001` 不能发布：
   - `v1/event/device-001/res`
8. 设备 `device-001` 不能订阅：
   - `v1/event/device-002/res`
9. 设备 `device-001` 不能订阅：
   - `v1/event/device-001/req`

## 8. Environment variables

`iot-service` 推荐至少对齐这些变量：

```env
IOT_VENDOR=emqx
IOT_RECEIVE_MODE=mq
EMQX_SHARED_SUBSCRIPTION_GROUP=lumimax-iot
EMQX_SHARED_SUBSCRIPTION_TOPICS=v1/+/+/req
EMQX_MQTT_USERNAME=iot_service
```

如果平台下行走 MQTT，还需要：

```env
EMQX_MQTT_PASSWORD=...
```

如果平台下行走 HTTP API，ACL 里的平台身份仍建议保持 `iot_service` / `lumimax-iot-service-*`，这样共享订阅 consumer 和平台侧 broker 连接规则一致。
