# 营养中心 Diet 联调清单（MVP）

## 1) 鉴权前置

- 所有接口走 `gateway`，并携带 `Authorization: Bearer <token>`。
- 业务路由：
  - `POST /api/meals`
  - `GET /api/meals`
  - `GET /api/meals/:id`
  - `POST /api/meals/:id/items/analyze`
  - `POST /api/meals/:id/items/:itemId/confirm`
  - `POST /api/meals/:id/finish`
  - `GET /api/foods/suggest?q=...&limit=...`

## 2) 主链路联调步骤

### Step A: 创建餐次

```http
POST /api/meals
Content-Type: application/json

{
  "deviceId": "01JDEVICE000000000000000001"
}
```

预期：返回 `mealRecordId`。

### Step B: 分析单个食物

```http
POST /api/meals/{mealRecordId}/items/analyze
Content-Type: application/json

{
  "imageKey": "tmp-file/user/01JUSER/meal.png",
  "weightGram": 128.5,
  "locale": "zh-CN"
}
```

预期：返回 `itemId` 与候选营养信息。

### Step C: 用户确认食物

```http
POST /api/meals/{mealRecordId}/items/{itemId}/confirm
Content-Type: application/json

{
  "foodName": "steamed white rice",
  "weightGram": 120,
  "locale": "zh-CN"
}
```

预期：返回修正后的单项与整餐汇总营养。

### Step D: 结束餐次

```http
POST /api/meals/{mealRecordId}/finish
```

预期：返回整餐最终营养汇总与 item 列表。

### Step E: 食物建议检索

```http
GET /api/foods/suggest?q=rice&limit=5
```

预期：返回用户常吃 + 标准库候选（按系统排序）。

## 3) 参数校验说明（gateway）

- `weightGram` 必须为数值且 `>= 0.1`。
- `locale` 格式示例：`zh-CN`、`en`。
- `foodName` 必填，最大长度 128。

## 4) 常见错误排查

- `401 Missing user context`：请求未带有效 token。
- `400` 参数错误：字段格式不符合校验规则。
- `404`：`mealRecordId` 或 `itemId` 不存在。
- `409`：餐次状态冲突（如已 finish 后继续 analyze/confirm）。

## 5) 当前状态

- 已打通网关到 biz-service 的 Diet 主链路转发。
- 已补齐 `confirm` 与 `foods.suggest` 接口入口。
- 已补 gateway 请求 DTO 校验。
