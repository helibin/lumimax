# Diet Service 设备协议 v1.0

> 项目：`lumimax/api`  
> 服务：`diet-service`  
> 适用范围：饮食识别与营养估算子链路  
> 上位基线：[`api/docs/设备接入协议规范v1.3.md`](/Volumes/dev/workspace/@ai/lumimax/api/docs/设备接入协议规范v1.3.md)

---

## 1. 目标

本协议描述 diet-service 在设备饮食场景中的业务收发口径，聚焦三件事：

1. 创建本餐 `mealRecord`
2. 多次食物识别 `food.analysis.request`
3. 设备确认/矫正后完成本餐汇总 `nutrition.analysis.request`

当前识别对象统一为：

- 食材 `ingredient`
- 成品菜 `prepared_dish`
- 包装食品 `packaged_food`
- 餐厅食品 `restaurant_food`
- 组合餐 `mixed_meal`

---

## 2. 路由原则

- `locale` 只用于国际化返回，不用于决定业务市场。
- `market` 优先取设备属性，由后台创建设备时写入。
- `food.analysis.request` 不要求设备主动传 `market`。
- 服务端默认语言来自 `DEFAULT_LOCALE`，默认业务市场来自 `DEFAULT_MARKET`。

---

## 3. 核心流程

```txt
connect.register
-> meal.record.create
-> food.analysis.request
-> food.analysis.confirm.request
-> food.analysis.request (可重复)
-> nutrition.analysis.request
```

说明：

- 设备每次称重/拍照触发一次 `food.analysis.request`
- 识别结果返回后，设备必须进入确认或矫正流程
- 用户可直接确认，也可从常吃类似食物、系统食物库中重选，或重新识别

---

## 4. 统一 Envelope

```json
{
  "meta": {
    "requestId": "550e8400e29b41d4a716446655440000",
    "deviceId": "SN_12345",
    "timestamp": 1710000000000,
    "event": "food.analysis.request",
    "version": "1.3",
    "locale": "zh-CN"
  },
  "data": {}
}
```

`meta` 约束：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `requestId` | string | 是 | 请求唯一 ID |
| `deviceId` | string | 是 | 设备编号 |
| `timestamp` | number | 是 | 毫秒时间戳 |
| `event` | string | 是 | 业务事件名 |
| `version` | string | 是 | 当前使用 `1.3` |
| `locale` | string | 否 | 期望返回语言 |

---

## 5. 事件清单

### 5.1 上行

| Event | 说明 |
| --- | --- |
| `meal.record.create` | 创建本餐 |
| `food.analysis.request` | 提交图片/重量，发起识别 |
| `food.analysis.confirm.request` | 用户确认或手动矫正 |
| `nutrition.analysis.request` | 结束本餐并汇总 |

### 5.2 下行

| Event | 说明 |
| --- | --- |
| `meal.record.result` | 本餐创建结果 |
| `food.analysis.result` | 识别结果与确认候选 |
| `food.analysis.confirm.result` | 确认完成结果 |
| `nutrition.analysis.result` | 本餐汇总结果 |

---

## 6. meal.record.create / result

### 6.1 请求

```json
{
  "meta": {
    "requestId": "req_001",
    "deviceId": "SN_12345",
    "timestamp": 1710000000000,
    "event": "meal.record.create",
    "version": "1.3"
  },
  "data": {
    "startedAt": 1710000000000
  }
}
```

### 6.2 响应

```json
{
  "meta": {
    "requestId": "req_001",
    "deviceId": "SN_12345",
    "timestamp": 1710000001000,
    "event": "meal.record.result",
    "version": "1.3"
  },
  "data": {
    "code": 0,
    "msg": "ok",
    "mealRecordId": "01hx0000000000000000000000000002",
    "status": "active",
    "startedAt": 1710000000000
  }
}
```

---

## 7. food.analysis.request / result

### 7.1 请求

```json
{
  "meta": {
    "requestId": "req_002",
    "deviceId": "SN_12345",
    "timestamp": 1710000010000,
    "event": "food.analysis.request",
    "version": "1.3",
    "locale": "zh-CN"
  },
  "data": {
    "mealRecordId": "01hx0000000000000000000000000002",
    "type": "image",
    "target": "tmp-file/device/SN_12345/20260424/food-001.jpg",
    "weight": 123.5,
    "unit": "g",
    "measuredAt": 1710000010000
  }
}
```

说明：

- `weight` 采用克重优先
- `type` 支持 `image | barcode | text | voice`，默认 `image`
- `target` 表示本次识别目标；图片传 object key，条码传条码值，文本/语音传文本内容
- 服务端按设备 `market` 选择识别与营养路由

### 7.2 响应

```json
{
  "meta": {
    "requestId": "req_002",
    "deviceId": "SN_12345",
    "timestamp": 1710000015000,
    "event": "food.analysis.result",
    "version": "1.3"
  },
  "data": {
    "code": 0,
    "msg": "ok",
    "mealRecordId": "01hx0000000000000000000000000002",
    "foodItemId": "01hx0000000000000000000000000003",
    "status": "success",
    "food": {
      "id": "01hx0000000000000000000000000003",
      "type": "ingredient",
      "name": "rice",
      "displayName": "米饭",
      "canonicalName": "rice",
      "quantity": 1,
      "weightGram": 123.5,
      "estimatedWeightGram": 123.5,
      "nutrition": {
        "calories": 143,
        "protein": 2.9,
        "fat": 0.4,
        "carbs": 31.2,
        "fiber": 0.3
      },
      "provider": "boohee",
      "source": "boohee",
      "verifiedLevel": "verified",
      "confidence": 0.94,
      "children": []
    },
    "candidates": [
      {
        "optionId": "recognized:rice",
        "foodName": "rice",
        "displayName": "米饭",
        "canonicalName": "rice",
        "source": "recognized",
        "provider": "vision",
        "confidence": 0.94
      }
    ],
    "requiresUserConfirmation": true
  }
}
```

### 7.3 关键字段

`food` 至少包含：

| 字段 | 说明 |
| --- | --- |
| `type` | `ingredient / prepared_dish / packaged_food / restaurant_food / mixed_meal / unknown` |
| `name` | 原始名称 |
| `displayName` | 本地化展示名称 |
| `quantity` | 数量/份数 |
| `weightGram` | 实际称重 |
| `estimatedWeightGram` | 模型估重 |
| `nutrition` | 当前项营养 |
| `provider` | 营养命中来源 |
| `verifiedLevel` | `confirmed / verified / estimated / unverified` |
| `children` | 成品菜拆解项或组合餐子项 |

顶层补充：

- `candidates`：设备端直接展示的候选项
- `requiresUserConfirmation`：是否必须确认
- `mealTotal`：当前餐次累计汇总（可选）

---

## 8. food.analysis.confirm.request / result

### 8.1 请求

```json
{
  "meta": {
    "requestId": "req_003",
    "deviceId": "SN_12345",
    "timestamp": 1710000018000,
    "event": "food.analysis.confirm.request",
    "version": "1.3",
    "locale": "zh-CN"
  },
  "data": {
    "mealRecordId": "01hx0000000000000000000000000002",
    "foodItemId": "01hx0000000000000000000000000003",
    "selectedFoodId": "F_BOOHEE_RICE",
    "selectedFoodName": "米饭",
    "correctedName": null,
    "correctedCount": null,
    "correctedWeightGram": null,
    "confirmationSource": "recognized"
  }
}
```

`confirmationSource` 支持：

- `recognized`
- `user_common_selected`
- `system_search_selected`
- `retry_recognition_selected`

### 8.2 响应

```json
{
  "meta": {
    "requestId": "req_003",
    "deviceId": "SN_12345",
    "timestamp": 1710000018200,
    "event": "food.analysis.confirm.result",
    "version": "1.3"
  },
  "data": {
    "code": 0,
    "msg": "ok",
    "mealRecordId": "01hx0000000000000000000000000002",
    "foodItemId": "01hx0000000000000000000000000003",
    "status": "confirmed"
  }
}
```

---

## 9. nutrition.analysis.request / result

### 9.1 请求

```json
{
  "meta": {
    "requestId": "req_004",
    "deviceId": "SN_12345",
    "timestamp": 1710000100000,
    "event": "nutrition.analysis.request",
    "version": "1.3"
  },
  "data": {
    "mealRecordId": "01hx0000000000000000000000000002"
  }
}
```

### 9.2 响应

```json
{
  "meta": {
    "requestId": "req_004",
    "deviceId": "SN_12345",
    "timestamp": 1710000102000,
    "event": "nutrition.analysis.result",
    "version": "1.3"
  },
  "data": {
    "code": 0,
    "msg": "ok",
    "mealRecordId": "01hx0000000000000000000000000002",
    "mealId": "01hx0000000000000000000000000004",
    "status": "finished",
    "foodItemCount": 2,
    "totalCalories": 560,
    "nutritionSummary": {
      "protein": 22.4,
      "fat": 12.1,
      "carbohydrate": 82.5,
      "fiber": 6.3
    },
    "finishedAt": 1710000102000
  }
}
```

---

## 10. 计算与沉淀规则

- 有 `measuredWeightGram` 时，优先按实际重量计算
- 无实重时，可按 `estimatedWeightGram` 估算
- 仅有份量时，允许按 `serving` 估算，但必须标 `estimated`
- 只有用户确认后的最终结果才允许沉淀到 `user_common / correction / custom food`
- dish 拆解成功时，优先沉淀子食材映射

---

## 11. 错误码

| code | msg | 场景 |
| --- | --- | --- |
| `0` | `ok` | 成功 |
| `40001` | `invalid payload` | 参数缺失或格式错误 |
| `40400` | `meal record not found` | 就餐记录不存在 |
| `40900` | `meal record already finished` | 本餐已结束 |
| `42200` | `object key invalid` | 图片 key 不合法 |
| `50000` | `internal error` | 服务内部异常 |
| `50300` | `analysis unavailable` | 识别或营养依赖不可用 |

---

## 12. 说明

- 本文档是 diet-service 的场景化摘录。
- 设备注册、心跳、上传凭证、属性/指令下发，以主协议 [`api/docs/设备接入协议规范v1.3.md`](/Volumes/dev/workspace/@ai/lumimax/api/docs/设备接入协议规范v1.3.md) 为准。
