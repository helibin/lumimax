你是 NestJS 饮食识别业务专家。

本阶段目标：

在 biz-service 内完整重建饮食称重识别主链路。

# 核心流程

必须实现：

```txt
CreateMealRecord
  ↓
AnalyzeFoodItem
  ↓
AnalyzeFoodItem
  ↓
AnalyzeFoodItem
  ↓
FinishMealRecord
````

注意：

AnalyzeFoodItem 多次调用代表多次称重。

不是一次上传多张图。

# 单图模型

请求字段只允许：

```txt
imageKey
imageObjectId
image_object_id
```

Entity 中只允许：

```txt
imageKey
imageObjectId
imageObjectId
```

DB 中只允许：

```txt
image_key
image_object_id
```

禁止：

```txt
images
image_keys
image_object_ids
```

# 本阶段任务

## 1. 实现 meal record

路径：

```txt
apps/biz-service/src/modules/diet/meal
```

能力：

* create meal
* get meal
* list meals
* finish meal
* 状态机

状态建议：

```txt
created
analyzing
finished
cancelled
failed
```

## 2. 实现 meal item

能力：

* analyze food item
* 保存 weight
* 保存 imageKey / imageObjectId
* 保存 calories/nutrition
* 保存 recognition result
* 支持一个 meal 多个 item

## 3. 实现 food database

能力：

* foods CRUD
* 每 100g 营养
* source
* sourceRefId
* countryCode
* brand
* serving size

## 4. 实现 nutrition analysis

流程：

```txt
image + weight
  ↓
vision recognition
  ↓
own food db match
  ↓
third-party db
  ↓
AI fallback
  ↓
nutrition result
```

## 5. 实现 recognition log

记录：

* requestId
* mealId
* deviceId
* imageKey
* provider
* status
* latencyMs
* request payload
* response payload
* error detail

## 6. base-service storage 校验

AnalyzeFoodItem 前调用 base-service StorageService 校验 objectKey。

不能直接访问 base-service DB。

## 7. 测试

新增：

```txt
apps/biz-service/test/meal-flow.e2e-spec.ts
apps/biz-service/test/meal-single-image.e2e-spec.ts
apps/biz-service/test/nutrition-fallback.e2e-spec.ts
apps/biz-service/test/recognition-log.e2e-spec.ts
```

# 验证

执行：

```bash
pnpm --filter biz-service test
pnpm --filter biz-service build
```

# 禁止事项

禁止：

* 使用图片数组
* 跳过 objectKey 校验
* 第三方失败直接中断，除非 fallback 也失败
* 把 nutrition 逻辑写到 gateway
* 修改 IoT topic

# 输出要求

输出：

1. 新增文件
2. 修改文件
3. meal 状态机说明
4. 单图模型说明
5. nutrition fallback 说明
6. 测试命令