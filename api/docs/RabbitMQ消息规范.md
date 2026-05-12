# RabbitMQ 消息规范（MVP）

> 目标：给 `api/packages/messaging/` 提供统一 exchange / queue / routing key / payload 约定。  
> 范围：阶段一 MVP，仅覆盖 IoT bridge -> biz-service 主链路与少量重试队列。

---

## 1. 设计原则

- 业务事件统一走 RabbitMQ，不让 biz-service 直接耦合 MQTT 报文。
- exchange 与 routing key 语义稳定，payload 可演进（向后兼容）。
- 先简单可用：topic exchange + 少量队列 + DLQ。

---

## 2. Exchange 命名

```text
lumimax.iot.events          # IoT bridge 发布业务事件
lumimax.diet.events         # diet 业务内部事件
lumimax.retry.events        # 统一重试入口（可选）
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
q.biz.diet.meal.create
q.biz.diet.food.analyze
q.biz.diet.food.confirm
q.biz.diet.meal.finish
```

死信队列：

```text
q.biz.diet.meal.create.dlq
q.biz.diet.food.analyze.dlq
q.biz.diet.food.confirm.dlq
q.biz.diet.meal.finish.dlq
```

重试队列（可选）：

```text
q.retry.diet.food.analyze
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

