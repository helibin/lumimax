# Biz Service 模块合并调整 Prompt

## Role

你是 Lumimax 项目的 `biz-service` 架构调整 Agent。

## Goal

调整 `biz-service` 的内部模块结构。

当前不要把业务模块平铺成很多一级目录，而是合并为 4 个一级业务模块，方便 MVP 阶段维护，也方便未来按模块拆分成独立服务。

## 当前架构背景

Lumimax 当前 MVP 只保留 3 个服务：

1. `gateway`
2. `base-service`
3. `biz-service`

其中：

- `gateway` 只负责 HTTP / WebSocket 请求入口
- `base-service` 负责基础能力，例如 auth、用户、角色、权限、菜单、系统配置、通知、存储等
- `biz-service` 负责业务能力，例如设备、IoT、饮食、营养分析、实时事件等

本阶段只调整 `biz-service` 内部模块结构。

## Scope

本阶段只允许修改：

```text
apps/biz-service
```

必要时可以同步调整：

```text
packages/proto/biz
```

不要修改：

```text
apps/gateway
apps/base-service
```

除非编译必须修复对应引用。

## Target Directory

请将 `biz-service` 内部一级目录调整为：

```text
apps/biz-service/src/
├── device/
├── iot/
├── diet/
├── realtime/
├── grpc/
├── common/
├── app.module.ts
└── main.ts
```

## Module Merge Rules

请按以下规则合并原有模块。

### Device 模块

以下模块合并到 `device/`：

```text
devices             → device/devices
device-bindings     → device/bindings
device-commands     → device/commands
telemetry           → device/telemetry
ota                 → device/ota
```

`device` 负责：

```text
设备管理
设备绑定
设备命令
设备遥测
OTA
设备状态
```

推荐目录：

```text
apps/biz-service/src/device/
├── devices/
├── bindings/
├── commands/
├── telemetry/
├── ota/
├── entities/
├── dto/
├── interfaces/
├── device.module.ts
└── device.facade.ts
```

### IoT 模块

以下模块合并到 `iot/`：

```text
iot-bridge          → iot/bridge
iot providers       → iot/providers
iot inbound events  → iot/events
```

`iot` 负责：

```text
AWS IoT Core 对接
阿里云 IoT 对接
设备注册 / Provision
设备命令发布
IoT 上行事件解析
IoT provider 抽象
```

推荐目录：

```text
apps/biz-service/src/iot/
├── bridge/
├── providers/
│   ├── aws/
│   └── aliyun/
├── events/
├── dto/
├── interfaces/
├── iot.module.ts
└── iot.facade.ts
```

### Diet 模块

以下模块合并到 `diet/`：

```text
meals                  → diet/meal
nutrition              → diet/nutrition
food-analysis          → diet/food-analysis
food database          → diet/food
third-party providers  → diet/providers
```

`diet` 负责：

```text
MealRecord
FoodItem
Food Database
Food Analysis
Nutrition Analysis
Nutritionix Provider
USDA FDC Provider
Vision LLM Provider
LLM Nutrition Estimator
```

推荐目录：

```text
apps/biz-service/src/diet/
├── meal/
│   ├── entities/
│   ├── dto/
│   ├── meal.service.ts
│   └── meal.module.ts
│
├── food/
│   ├── entities/
│   ├── dto/
│   ├── food.service.ts
│   └── food.module.ts
│
├── food-analysis/
│   ├── dto/
│   ├── interfaces/
│   ├── food-analysis.service.ts
│   └── food-analysis.module.ts
│
├── nutrition/
│   ├── dto/
│   ├── interfaces/
│   ├── nutrition-normalizer.ts
│   ├── nutrition.service.ts
│   └── nutrition.module.ts
│
├── providers/
│   ├── vision/
│   │   ├── openai-vision.provider.ts
│   │   └── vision-provider.factory.ts
│   │
│   ├── nutritionix/
│   │   └── nutritionix.provider.ts
│   │
│   ├── usda-fdc/
│   │   └── usda-fdc.provider.ts
│   │
│   └── estimator/
│       ├── llm-nutrition-estimator.provider.ts
│       └── nutrition-estimator.factory.ts
│
├── entities/
├── dto/
├── interfaces/
├── diet.module.ts
└── diet.facade.ts
```

### Realtime 模块

以下模块合并到 `realtime/`：

```text
realtime-events     → realtime/events
realtime publishers → realtime/publishers
```

`realtime` 负责：

```text
业务事件创建
事件发布
Redis Pub/Sub
WebSocket 推送事件准备
```

注意：

```text
WebSocket 长连接仍然在 gateway
realtime 只负责业务事件
realtime 不维护 WebSocket 连接
```

推荐目录：

```text
apps/biz-service/src/realtime/
├── events/
├── publishers/
├── dto/
├── interfaces/
├── realtime.module.ts
└── realtime.facade.ts
```

## Important Naming Rules

不要使用 `-domain` 后缀。

不要创建：

```text
device-domain/
iot-domain/
meal-domain/
realtime-domain/
```

正确命名是：

```text
device/
iot/
diet/
realtime/
```

## Forbidden Flat Directories

不要在 `apps/biz-service/src/` 下创建以下平铺一级目录：

```text
devices/
device-bindings/
iot-bridge/
meals/
food-analysis/
nutrition/
realtime-events/
ota/
telemetry/
device-commands/
```

这些只能作为对应一级模块下的子模块存在。

## Facade Rules

每个一级模块必须通过 facade 对外暴露能力：

```text
device/device.facade.ts
iot/iot.facade.ts
diet/diet.facade.ts
realtime/realtime.facade.ts
```

跨模块调用必须通过 facade，不允许直接访问其他模块内部 service / repository / entity。

允许：

```text
diet      → device.facade，校验设备
diet      → realtime.facade，发布 meal.analysis.completed
iot       → device.facade，更新设备在线状态
device    → iot.facade，下发设备命令
```

禁止：

```text
diet 直接 import device/devices/*.repository
iot 直接操作 diet 的 meal 表
realtime 写 meal / device 核心业务逻辑
device 直接调用第三方营养 API
```

## gRPC Controller Mapping

gRPC Controller 可以按 API 能力拆分，但内部必须调用对应 facade。

```text
DeviceGrpcController          → device.facade
DeviceBindingGrpcController   → device.facade
DeviceCommandGrpcController   → device.facade
TelemetryGrpcController       → device.facade
OtaGrpcController             → device.facade

IotBridgeGrpcController       → iot.facade

MealGrpcController            → diet.facade
NutritionGrpcController       → diet.facade
FoodAnalysisGrpcController    → diet.facade

RealtimeEventGrpcController   → realtime.facade
```

## Diet Core Flow

`diet` 内部需要承载完整饮食识别和营养分析主流程：

```text
CreateMealRecord
        ↓
AnalyzeFoodItem
        ↓
diet/food-analysis 调用 Vision Provider
        ↓
diet/food 查询本地食品库
        ↓
diet/nutrition 调用 Nutritionix / USDA FDC
        ↓
第三方无结果时使用 LLM Nutrition Estimator
        ↓
保存 FoodItem
        ↓
发布 realtime event
        ↓
FinishMealRecord 汇总营养
```

## Diet Provider Requirements

本阶段 `diet` 必须实现真实第三方 Provider 接入能力，不要只写 mock。

至少包含：

```text
diet/providers/vision/openai-vision.provider.ts
diet/providers/nutritionix/nutritionix.provider.ts
diet/providers/usda-fdc/usda-fdc.provider.ts
diet/providers/estimator/llm-nutrition-estimator.provider.ts
```

Provider interface 至少包含：

```ts
export interface FoodVisionProvider {
  identifyFood(input: IdentifyFoodInput): Promise<FoodVisionResult>;
}

export interface NutritionDataProvider {
  searchFood(input: SearchFoodInput): Promise<NutritionSearchResult>;
  getNutrition(input: GetNutritionInput): Promise<NutritionResult>;
}

export interface NutritionEstimatorProvider {
  estimate(input: EstimateNutritionInput): Promise<NutritionEstimateResult>;
}
```

mock provider 只允许作为：

```text
本地开发 fallback
单元测试 mock
第三方 API 不可用时的显式降级方案
```

## Environment Variables

如项目已有 env.example，请同步补充：

```text
FOOD_VISION_PROVIDER=openai
FOOD_VISION_TIMEOUT_MS=15000

NUTRITION_DATA_PROVIDERS=nutritionix,usda_fdc
NUTRITIONIX_APP_ID=
NUTRITIONIX_API_KEY=
NUTRITIONIX_BASE_URL=https://trackapi.nutritionix.com
NUTRITIONIX_TIMEOUT_MS=8000

USDA_FDC_API_KEY=
USDA_FDC_BASE_URL=https://api.nal.usda.gov/fdc/v1
USDA_FDC_TIMEOUT_MS=8000

NUTRITION_ESTIMATOR_PROVIDER=openai
NUTRITION_ESTIMATOR_TIMEOUT_MS=15000
```

## Future Split Mapping

当前仍然只保留一个 `biz-service`，不要新增独立服务。

但内部模块要方便未来拆分：

```text
device   → device-service
iot      → iot-bridge-service
diet     → diet-service
realtime → realtime-service
```

## Implementation Requirements

请执行以下任务：

1. 检查当前 `apps/biz-service/src` 目录结构
2. 将平铺模块迁移到 `device`、`iot`、`diet`、`realtime`
3. 去掉所有 `-domain` 命名
4. 创建或调整四个 facade：
   - `device.facade.ts`
   - `iot.facade.ts`
   - `diet.facade.ts`
   - `realtime.facade.ts`
5. 调整 module imports
6. 调整 gRPC controller 的依赖注入，让 controller 调用 facade
7. 调整 import path
8. 确保没有旧的平铺一级目录残留
9. 确保没有 `device-domain`、`iot-domain`、`meal-domain`、`realtime-domain`
10. 确保 build 通过

## Validation

请执行：

```bash
pnpm --filter @lumimax/biz-service build
```

如果项目包名不同，请先查看 `package.json` 后使用正确包名。

如存在测试命令，也执行：

```bash
pnpm --filter @lumimax/biz-service test
```

## Output

完成后请输出：

1. 调整前目录结构摘要
2. 调整后目录结构
3. 文件迁移列表
4. 删除或废弃的旧目录
5. facade 暴露能力说明
6. gRPC Controller 对应 facade 说明
7. 已执行验证命令
8. 验证结果
9. 未完成事项
