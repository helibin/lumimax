你是 AWS IoT Core + SQS + NestJS consumer 专家。

本阶段目标：

在 biz-service 内完整重建 IoT queue 消费链路。

# 目标链路

```txt
Device MQTT
  ↓
AWS IoT Core
  ↓ Rule
SQS
  ↓
biz-service SQS consumer
  ↓
event dispatcher
  ↓
device / diet service
  ↓
IoT downlink
````

# 必须保持

Topic：

```txt
v1/connect/{deviceId}/req
v1/status/{deviceId}/req
v1/event/{deviceId}/req
v1/attr/{deviceId}/res
v1/cmd/{deviceId}/res
```

Envelope：

```json
{
  "meta": {
    "requestId": "xxx",
    "deviceId": "SN_12345",
    "timestamp": 1710000000000,
    "event": "xxx.xxx",
    "version": "1.0"
  },
  "data": {}
}
```

# 本阶段任务

## 1. 实现 TopicParserService

路径：

```txt
apps/biz-service/src/modules/iot/services/topic-parser.service.ts
```

能力：

* 解析 topic
* 提取 version
* 提取 category
* 提取 deviceId
* 提取 direction
* 校验 topic 合法性

## 2. 实现 IotEnvelopeService

路径：

```txt
apps/biz-service/src/modules/iot/services/iot-envelope.service.ts
```

能力：

* 校验 meta
* 校验 requestId
* 校验 deviceId
* 校验 timestamp
* 校验 event
* 校验 version

## 3. 实现 AwsIotSqsConsumer

路径：

```txt
apps/biz-service/src/modules/iot/consumers/aws-iot-sqs.consumer.ts
```

能力：

* poll SQS
* parse body
* parse topic
* parse envelope
* 幂等校验
* dispatch event
* 成功 delete message
* 失败按策略 retry / DLQ
* 记录日志
* 不打印敏感信息

## 4. 实现 IotEventDispatcher

路径：

```txt
apps/biz-service/src/modules/iot/services/iot-event-dispatcher.service.ts
```

根据 event 分发：

```txt
device.connect
device.status
meal.create
meal.food.analyze
meal.finish
attr.response
cmd.response
```

具体 event 名以当前协议为准。

## 5. 实现 IotDownlinkService

路径：

```txt
apps/biz-service/src/modules/iot/services/iot-downlink.service.ts
```

负责：

* 生成下行 topic
* 调用 AWS IoT publish
* 写入 iot_messages
* requestId 贯穿

## 6. 测试

新增：

```txt
apps/biz-service/test/iot-topic-parser.spec.ts
apps/biz-service/test/iot-envelope.spec.ts
apps/biz-service/test/iot-sqs-consumer.e2e-spec.ts
apps/biz-service/test/iot-downlink.spec.ts
```

# 验证

执行：

```bash
pnpm --filter biz-service test
pnpm --filter biz-service build
```

# 禁止事项

禁止：

* 修改 topic
* 修改 envelope
* 打印 AK/SK
* 忽略 requestId
* 失败后直接 delete 未处理消息
* 让 consumer 无开关自动连接生产 SQS

# 输出要求

输出：

1. 新增文件
2. 修改文件
3. consumer 流程说明
4. 幂等策略
5. DLQ 策略
6. 测试命令