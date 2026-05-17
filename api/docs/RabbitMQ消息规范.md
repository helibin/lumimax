# RabbitMQ 消息规范（MVP）

> 目标：给 `api/packages/messaging/` 提供统一 exchange / queue / routing key / payload 约定。
> 范围：阶段一 MVP，覆盖 iot-service bridge 队列、biz-service 领域队列与少量重试队列。

---

## 1. 设计原则

- 业务事件统一走 RabbitMQ，不让 biz-service 直接耦合 MQTT 报文。
- exchange 与 routing key 语义稳定，payload 可演进（向后兼容）。
- 单一 topic exchange `lumimax.bus`；**当前**主消费队列：`lumimax.q.iot.stream`（**iot-service**，`iot.up.#` / `iot.down.#`）与 `lumimax.q.biz.events`（**biz-service**，`biz.iot.message.received`），统一死信队列为 `lumimax.q.dead`。详见 [`docs/IoT通讯模块规范.md`](../../docs/IoT通讯模块规范.md) §4。

---

## 2. Exchange 命名

推荐共用同一个 RabbitMQ 实例与默认 `vhost`（`/`）：

```text
/             # 业务总线与 IoT 链路共享命名空间
```

其中：

```text
lumimax.bus                     # 默认 vhost 内：业务事件 + IoT bridge 共用 topic exchange
```

业务与 IoT 通过 **不同队列** 与 **路由键** 隔离（IoT 使用 `iot.up.*` / `iot.down.*`；业务事件使用 `biz.*`，由拓扑绑定到 `lumimax.q.biz.events`）。

其它（可选、未在默认拓扑中创建）：

```text
diet.event                  # diet 业务内部事件
retry.event                 # 统一重试入口（可选）
```

类型：`topic`。

---

## 3. Routing Key 规范

格式：

```text
<domain>.<entity>.<action>.<version>
```

示例（MVP 必需）：

```text
iot.meal.record.create.v1
iot.food.analysis.request.v1
iot.food.analysis.confirm.request.v1
iot.nutrition.analysis.request.v1
```

可选（后续）：

```text
diet.meal.finished.v1
diet.food.user_common.updated.v1
```

---

## 4. Queue 命名

消费队列：

```text
lumimax.q.biz.events        # biz-service（biz.iot.message.received 等 biz.#）
lumimax.q.iot.stream        # iot-service（iot.up.# / iot.down.#）
lumimax.q.dead              # 统一死信队列
diet.meal.create.queue
diet.food.analyze.queue
diet.food.confirm.queue
diet.meal.finish.queue
```

当前 `dead.#` 统一绑定到 `lumimax.q.dead`。运行时 `assertQueue` 与可选的 `pnpm mq:setup` 声明的队列参数需保持一致，否则会出现 `406 PRECONDITION_FAILED`。

死信队列：

```text
diet.meal.create.queue.dlq
diet.food.analyze.queue.dlq
diet.food.confirm.queue.dlq
diet.meal.finish.queue.dlq
```

重试队列（可选）：

```text
diet.food.analyze.retry.queue
```

---

## 5. 标准消息 Envelope

```json
{
  "meta": {
    "messageId": "01jvq4w0e29b41d4a716446651",
    "requestId": "01jvq4w0e29b41d4a716446651",
    "event": "food.analysis.request",
    "routingKey": "iot.food.analysis.request.v1",
    "occurredAt": 1710000010000,
    "deviceId": "01kqaey25yg7cdqc699vr74e6r",
    "version": "1.0",
    "locale": "en-US"
  },
  "data": {}
}
```

要求：

- `requestId` 必传（用于链路追踪）。
- `deviceId` 必传（阶段一匿名设备主键）。
- `locale` 建议透传。

---

## 6. 重试与死信

- 消费失败重试：最多 3 次，指数退避（1s/5s/30s）。
- 超过重试进入对应 DLQ。
- DLQ 必须带最后错误原因与 stack 摘要（避免吞错）。

---

## 7. 与 IoT 协议边界

- 南向：EMQ X / MQTT / `meta.event` 报文。
- 北向：RabbitMQ envelope（本文件）。
- IoT bridge 负责协议翻译、字段校验与路由键映射。

---

## 8. MVP 验收项

- 四类事件可从 IoT bridge 正常发布到 RabbitMQ：
  - `meal.record.create`
  - `food.analysis.request`
  - `food.analysis.confirm.request`
  - `nutrition.analysis.request`
- biz-service 对应消费者均可收到并处理。
- 失败消息可进入对应 DLQ。
