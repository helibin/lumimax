你是 NestJS IoT + Diet 业务服务重构 Agent。

本阶段目标：

基于全新架构重建 biz-service。

biz-service 合并：

```txt
device-service
iot-bridge-service
diet-service
realtime-service
````

不需要兼容旧 service 内部结构。

# 目标目录

```txt
apps/biz-service/src/
├─ main.ts
├─ app.module.ts
├─ grpc/
│  ├─ biz-grpc.module.ts
│  ├─ controllers
│  └─ clients
├─ modules/
│  ├─ device
│  ├─ iot
│  ├─ diet
│  └─ realtime
└─ config
```

数据库迁移统一放在 `data/db/migrations`，不再在应用目录内维护 `src/migrations`。

# 模块设计

## device

负责：

* 设备
* 设备绑定
* 设备状态
* 设备管理
* 设备查询

## iot

负责：

* AWS IoT provider
* Aliyun IoT provider
* provision
* thing/cert/policy
* SQS consumer
* topic parser
* envelope parser
* downlink
* iot message log

## diet

负责：

* meal record
* meal item
* food database
* nutrition analysis
* third-party provider
* AI fallback
* recognition log

## realtime

负责：

* WebSocket
* 设备识别结果推送
* 用户实时消息
* Redis adapter，如需要

如果 realtime 风险高，可以只实现 RealtimePublisher，WebSocket 后续再做。

# 数据表

请实现 TypeORM entities：

```txt
devices
device_bindings
device_status_logs

iot_messages
iot_provision_records

meal_records
meal_items
foods
food_nutritions
recognition_logs
```

要求：

* ID 使用 ULID
* 统一主键长度 36
* jsonb
* deletedAt 软删除
* creatorId / editorId 审计字段
* 关键索引

说明：

* `requestId` 仅保留为链路字段，不落数据库基础实体
* 时间字段统一使用 `Date`，数据库按 UTC 读写

# Diet 核心流程

必须实现或保留服务骨架：

```txt
CreateMealRecord
AnalyzeFoodItem
FinishMealRecord
```

AnalyzeFoodItem 是多次调用，而不是一次多图。

图片字段只能是：

```txt
imageKey
imageObjectId
image_object_id
```

禁止：

```txt
images[]
imageKeys[]
imageObjectIds[]
```

meal item 中也只能保存单图字段。

# Nutrition

营养分析流程建议：

```txt
图片 + 重量
  ↓
Vision 识别食品候选
  ↓
自有 foods 匹配
  ↓
USDA / Nutritionix / 第三方数据库
  ↓
AI fallback
  ↓
保存 recognition log + meal item
```

第三方失败时：

* 不能直接失败主流程
* 有 fallback
* fallback 失败才返回 analysis unavailable

# IoT 主链路

必须保持：

```txt
AWS IoT Core -> SQS -> biz-service consumer
```

SQS consumer 负责：

* poll message
* parse topic
* parse envelope
* extract requestId
* idempotency check
* dispatch event
* write iot_messages
* call device/diet service
* downlink response
* delete message

# Topic

保持当前协议风格：

```txt
v1/connect/{deviceId}/req
v1/status/{deviceId}/req
v1/event/{deviceId}/req
v1/attr/{deviceId}/res
v1/cmd/{deviceId}/res
```

# Envelope

保持：

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

# gRPC

实现 biz.proto 对应 controller：

```txt
DeviceService
IotProvisionService
IotMessageService
MealService
FoodService
NutritionService
RecognitionLogService
RealtimeService
```

# base-service client

biz-service 可以通过 gRPC 调 base-service：

```txt
StorageService
UserService
NotificationService
```

用途：

* 校验 objectKey
* 获取用户信息
* 发送通知

不能直接访问 base-service 数据库。

# Config

加载：

```txt
configs/{env}/shared.env
configs/{env}/biz-service.env
```

# 测试

新增：

```txt
apps/biz-service/test/device.e2e-spec.ts
apps/biz-service/test/iot-topic-parser.spec.ts
apps/biz-service/test/iot-envelope.spec.ts
apps/biz-service/test/iot-sqs-consumer.e2e-spec.ts
apps/biz-service/test/meal-single-image.e2e-spec.ts
apps/biz-service/test/nutrition-fallback.e2e-spec.ts
```

# 验证

执行：

```bash
pnpm --filter biz-service build
pnpm --filter biz-service test
```

# 输出要求

输出：

1. 新增文件
2. 修改文件
3. entity 列表
4. gRPC service 列表
5. IoT queue consumer 说明
6. diet 单图模型说明
7. nutrition fallback 说明
8. 验证命令
