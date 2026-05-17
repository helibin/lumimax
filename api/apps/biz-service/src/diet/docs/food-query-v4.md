# Diet Service Food Query V4.0 - Codex Development Plan

> Version: V4.0  
> Target Module: `apps/biz-service/src/diet/`（运行时归属 **biz-service**，非独立 diet-service 进程）  
> Purpose: Codex / AI Agent 开发执行文档  
> Product Scope: 食物识别 + 营养查询 + 称重计算 + 用户确认沉淀  
> Current Strategy: 最小 Provider 组合，配置化路由，后续可扩展  
> Market Strategy: CN / US 双市场 MVP，Global 后续扩展  
> Status: Development Plan

---

## 0. 一句话结论

当前阶段不要再纠结接入多少第三方。

第一阶段只做最小可运行组合：

```text
CN:
Vision -> Internal -> Boohee -> LLM fallback

US:
Vision -> Internal -> USDA -> Edamam -> LLM fallback
```

核心架构必须稳定：

```text
AnalyzeFoodItem
  -> FoodQueryService
  -> ProviderRouter
  -> ProviderRegistry
  -> Provider
  -> NutritionCalculator
  -> ConfirmFoodItem
  -> Internal DB / User Common Foods
```

长期扩展时，新增 Provider 只能通过：

```text
实现 Provider
注册 Provider
配置路由顺序
```

不能改主业务流程。

---

# 1. 当前开发目标

本阶段目标是重构 / 新增饮食中心（biz-service `diet` 模块）的通用 Food Query 能力。

支持：

- 图片输入
- 文本输入
- 条码输入
- OCR 营养标签输入
- 食材识别
- 成品菜识别
- 包装食品识别
- 组合餐识别
- 卡路里计算
- MealItem 结果
- MealResult 汇总
- 用户确认
- 自建库沉淀
- 用户常吃食物沉淀

暂不实现：

- 饮食计划
- 每日目标摄入
- 超标 / 不足分析
- 个性化建议
- 复杂健康报告

饮食计划后续单独拆模块：

```text
DietPlanService
DietPlanAnalysisService
```

当前只预留扩展点，不进入主链路。

---

# 2. 服务边界

## 2.1 饮食中心（diet 模块）负责

```text
Meal 创建
Food Query 通用查询
食物识别结果处理
第三方营养查询
卡路里计算
MealItemResult
MealResult
用户确认
用户修正
自建食品库沉淀
用户常吃食物沉淀
```

## 2.2 饮食中心不负责

```text
图片上传
对象存储
设备 MQTT
IoT 消息下发
用户认证
App 推送
支付
Admin 后台
饮食计划
个性化饮食建议
```

---

# 3. 核心业务模型

## 3.1 MealRecord

表示一餐。

```text
早餐
午餐
晚餐
加餐
其他
```

字段建议：

```text
id
userId
deviceId
mealType
status: active | finished | cancelled
startedAt
finishedAt
totalWeightGram
totalCaloriesKcal
totalProteinGram
totalFatGram
totalCarbsGram
```

## 3.2 MealItem

表示一餐里的一个食物。

一个 MealRecord 可以有多个 MealItem。

字段建议：

```text
id
mealId
userId
deviceId
foodId
displayName
foodType
quantity
weightGram
caloriesKcal
proteinGram
fatGram
carbsGram
status: pending | confirmed | corrected | rejected
querySnapshot
recognitionSnapshot
resultSnapshot
rawCandidates
selectedCandidate
confidence
```

## 3.3 MealItemResult

给用户确认用，字段要简单。

```ts
export interface MealItemResult {
  itemId: string;
  foodName: string;
  foodType:
    | 'ingredient'
    | 'prepared_dish'
    | 'packaged_food'
    | 'restaurant_food'
    | 'mixed_meal'
    | 'unknown';

  quantity?: number;
  weightGram?: number;
  caloriesKcal: number;

  confidence: number;

  status:
    | 'pending'
    | 'confirmed'
    | 'corrected'
    | 'rejected';
}
```

## 3.4 MealResult

整餐汇总结果。

```ts
export interface MealResult {
  mealId: string;

  mealType:
    | 'breakfast'
    | 'lunch'
    | 'dinner'
    | 'snack'
    | 'other';

  totalWeightGram?: number;
  totalCaloriesKcal: number;
  totalProteinGram?: number;
  totalFatGram?: number;
  totalCarbsGram?: number;

  itemCount: number;
  items: MealItemResult[];

  analysis?: MealNutritionAnalysis;

  // reserved for future DietPlan module
  dietPlanAnalysis?: unknown;
}
```

## 3.5 FoodQueryResult

内部复杂查询结果。

FoodQueryResult 不直接等于用户展示结果，它用于：

```text
保存查询快照
追踪 Provider 返回
用户确认前候选
后续排错和训练
```

---

# 4. 主业务流程

## 4.1 正确流程

```text
CreateMealRecord
  ↓
AnalyzeFoodItem
  ↓
FoodQueryService
  ↓
创建 pending MealItem
  ↓
返回 MealItemResult 候选
  ↓
ConfirmFoodItem
  ↓
沉淀 MealItem / Food / UserCommonFood
  ↓
重复 Analyze + Confirm 多次
  ↓
FinishMealRecord
  ↓
生成 MealResult
```

## 4.2 核心语义

```text
MealRecord = 一餐
MealItem = 这一餐里的一个食物
AnalyzeFoodItem = 一次识别 / 查询 / 估算
ConfirmFoodItem = 用户确认这个食物
FinishMealRecord = 结束这一餐并汇总
```

---

# 5. Analyze / Confirm 沉淀规则

## 5.1 AnalyzeFoodItem 阶段

只能做：

```text
识别
查询
候选排序
营养估算
创建 pending meal_item
保存 querySnapshot
保存 recognitionSnapshot
保存 resultSnapshot
```

禁止做：

```text
写 user_common_foods
提升 foods verifiedLevel
把 LLM 估算当正式食品
写用户偏好
```

## 5.2 ConfirmFoodItem 阶段

用户确认后才沉淀：

```text
foods
food_nutrients
external_food_mappings
user_common_foods
food_corrections
```

核心原则：

```text
模型识别结果 ≠ 事实
Provider 返回结果 ≠ 事实
用户确认后的结果 = 可沉淀事实
```

---

# 6. Food Query 总体架构

```text
AnalyzeFoodItem
  ↓
InputResolver
  ↓
ImageInputClassifier / TextParser / BarcodeParser / OcrParser
  ↓
FoodRecognitionService
  ↓
FoodQueryService
  ↓
ProviderRouter
  ↓
ProviderRegistry
  ↓
FoodNutritionProvider
  ↓
ThirdPartyClient
  ↓
Mapper
  ↓
NutritionCalculator
  ↓
FoodQueryResult
  ↓
MealItemResult
```

---

# 7. InputResolver

InputResolver 负责判断输入来源。

支持：

```text
image
manual_text
voice_text
barcode
nutrition_label
provider_candidate
```

如果是图片，不直接识别食物，先交给：

```text
ImageInputClassifier
```

---

# 8. ImageInputClassifier

图片第一步先判断类型。

```ts
type ImageInputType =
  | 'food_photo'
  | 'packaged_food_front'
  | 'nutrition_label'
  | 'barcode_or_qr'
  | 'menu_or_receipt'
  | 'mixed'
  | 'unknown';
```

## 8.1 food_photo

```text
VisionFoodRecognition
-> FoodQueryItem[]
-> Nutrition Provider
```

## 8.2 packaged_food_front

```text
OCR / Vision
-> 品牌 / 商品名 / 包装信息
-> Packaged Food Query
```

## 8.3 nutrition_label

```text
OCR
-> NutritionLabelParser
-> StandardFoodCandidate
-> 用户确认
```

## 8.4 barcode_or_qr

```text
BarcodeParser
-> barcode
-> searchByBarcode
```

注意：

```text
QR Code 不一定是食品条码，不能直接当作 UPC/EAN。
```

## 8.5 mixed

同时跑：

```text
Food Recognition
OCR / Barcode
合并候选
用户确认
```

---

# 9. FoodRecognitionService

负责识别：

```text
食物名称
食物类型
数量
份量
估算重量
组合餐拆分
```

输出统一为：

```text
FoodQueryItem[]
```

## 9.1 FoodQueryItem

```ts
export interface FoodQueryItem {
  type:
    | 'ingredient'
    | 'prepared_dish'
    | 'packaged_food'
    | 'restaurant_food'
    | 'mixed_meal'
    | 'unknown';

  name: string;
  displayName?: string;

  quantity?: number;

  estimatedWeightGram?: number;
  measuredWeightGram?: number;

  confidence: number;

  children?: FoodQueryItem[];
}
```

---

# 10. 视觉模型与兜底大模型

视觉模型和兜底大模型可以底层共用同一个多模态模型，但系统角色必须拆开。

## 10.1 VisionRecognitionProvider

负责：

```text
看图识别
图片分类
食物候选
数量/份量估算
营养标签识别
```

## 10.2 LlmFallbackProvider

负责：

```text
名称归一
别名映射
成品菜拆解
组合餐拆解
OCR 结构化
低置信度营养估算
```

LLM fallback 的结果必须标记：

```text
verifiedLevel = unverified
sourceType = estimated
confidence = low / medium
```

---

# 11. FoodQueryService

统一查询入口：

```text
FoodQueryService.query(input)
```

禁止拆多套：

```text
IngredientQueryService
DishQueryService
BarcodeQueryService
RecipeQueryService
```

## 11.1 FoodQueryInput

```ts
export interface FoodQueryInput {
  requestId: string;

  userId?: string;
  deviceId?: string;
  mealId?: string;

  market: 'cn' | 'us' | 'global';

  inputType:
    | 'manual_text'
    | 'voice_text'
    | 'barcode'
    | 'image'
    | 'ocr_nutrition_label'
    | 'provider_candidate';

  query?: string;
  barcode?: string;
  imageObjectKey?: string;
  ocrText?: string;

  weightGram?: number;

  options?: {
    enableLlmFallback?: boolean;
    enableOcr?: boolean;
    maxCandidates?: number;
  };
}
```

---

# 12. Provider 最小选择

## 12.1 CN MVP

```text
Vision
Internal
Boohee
LLM fallback
```

执行链：

```text
Qwen VL / Doubao Vision
-> Internal
-> Boohee
-> LLM fallback
```

如果后续有中国食物成分授权库：

```text
Qwen VL / Doubao Vision
-> Internal
-> China Food Composition
-> Boohee
-> LLM fallback
```

## 12.2 US MVP

```text
Vision
Internal
USDA
Edamam
LLM fallback
```

执行链：

```text
Vision
-> Internal
-> USDA
-> Edamam
-> LLM fallback
```

## 12.3 US Enhanced

拿到 Nutritionix 后：

```text
Vision
-> Internal
-> USDA
-> Nutritionix
-> Edamam
-> LLM fallback
```

## 12.4 Global Enhanced

后续再考虑：

```text
FatSecret
Passio
LogMeal
Open Food Facts async/offline
```

---

# 13. Provider 不进入 MVP 的清单

MVP 暂不接：

```text
Open Food Facts realtime
Nutritionix
FatSecret
Passio
LogMeal
Spoonacular
Chomp
GreenChoice
MenuStat
Nutritics
ESHA
API Ninjas
Calorie Mama
Foodvisor
Bite AI
```

原因：

```text
不是最小主链路必须项
会增加接入复杂度
部分接口延迟或授权不稳定
会干扰 FoodQuery 核心架构落地
```

---

# 14. Provider 路由配置

Provider 路由不能写死在代码里。

支持两种来源：

```text
YAML 文件
后台管理系统
```

无论哪种来源，都必须转换成统一模型：

```text
ProviderRouteConfig
```

优先级：

```text
DB 配置 > YAML 配置 > 代码默认值
```

## 14.1 YAML 示例

```yaml
version: v4

routes:
  cn:
    default:
      - internal
      - boohee
      - llm_estimate

    ingredient:
      - internal
      - boohee
      - llm_estimate

    prepared_dish:
      - internal
      - boohee
      - llm_estimate

    packaged_food:
      - internal
      - boohee
      - nutrition_label_ocr
      - llm_estimate

  us:
    default:
      - internal
      - usda
      - edamam
      - llm_estimate

    ingredient:
      - internal
      - usda
      - edamam
      - llm_estimate

    prepared_dish:
      - internal
      - edamam
      - usda
      - llm_estimate

    packaged_food:
      - internal
      - edamam
      - nutrition_label_ocr
      - llm_estimate
```

---

# 15. ProviderRouter

## 15.1 ProviderRouteContext

```ts
export interface ProviderRouteContext {
  market: 'cn' | 'us' | 'global';

  inputType:
    | 'image'
    | 'manual_text'
    | 'voice_text'
    | 'barcode'
    | 'ocr_nutrition_label';

  foodType:
    | 'ingredient'
    | 'prepared_dish'
    | 'packaged_food'
    | 'restaurant_food'
    | 'mixed_meal'
    | 'unknown';

  countryCode?: string;
  locale?: string;

  hasWeight?: boolean;
  hasBarcode?: boolean;
}
```

## 15.2 Router 处理逻辑

```text
配置顺序
-> 过滤未启用
-> 过滤无 Key
-> 过滤熔断中
-> 过滤不支持当前 inputType
-> 返回最终 Provider 执行链
```

---

# 16. ProviderRegistry

```ts
export class FoodProviderRegistry {
  private readonly providers = new Map<string, FoodNutritionProvider>();

  register(provider: FoodNutritionProvider) {
    this.providers.set(provider.code, provider);
  }

  get(code: string): FoodNutritionProvider | undefined {
    return this.providers.get(code);
  }

  isEnabled(code: string): boolean {
    return this.providers.get(code)?.isEnabled() ?? false;
  }
}
```

---

# 17. Provider 统一接口

```ts
export interface FoodNutritionProvider {
  readonly code: string;

  isEnabled(): boolean;

  getStatus(): ProviderStatus;

  search(input: ProviderSearchInput): Promise<StandardFoodCandidate[]>;

  searchByBarcode?(
    input: ProviderBarcodeInput,
  ): Promise<StandardFoodCandidate[]>;

  parseNutritionLabel?(
    input: ProviderNutritionLabelInput,
  ): Promise<StandardFoodCandidate[]>;

  recognizeImage?(
    input: ProviderImageInput,
  ): Promise<FoodQueryItem[]>;
}
```

---

# 18. Provider 内部结构

每个 Provider 建议：

```text
providers/xxx/
├── xxx.provider.ts
├── xxx.client.ts
├── xxx.mapper.ts
├── xxx.types.ts
└── xxx.config.ts
```

职责：

```text
Provider:
  实现统一接口

Client:
  第三方 HTTP/API 调用

Mapper:
  第三方响应 -> StandardFoodCandidate / FoodQueryItem

Types:
  第三方原始响应类型
```

---

# 19. StandardFoodCandidate

```ts
export interface StandardFoodCandidate {
  sourceCode: string;

  externalFoodId?: string;
  internalFoodId?: string;

  type:
    | 'ingredient'
    | 'prepared_dish'
    | 'packaged_food'
    | 'restaurant_food'
    | 'mixed_meal'
    | 'unknown';

  displayName: string;
  normalizedName: string;

  brandName?: string;
  barcode?: string;

  servingUnit?: string;
  servingWeightGram?: number;

  nutrientsPer100g?: NutritionPer100g;
  nutrientsPerServing?: NutritionSummary;

  caloriesKcal?: number;

  confidence: number;

  verifiedLevel:
    | 'internal_verified'
    | 'provider_verified'
    | 'user_verified'
    | 'estimated'
    | 'unverified';

  rawPayload?: unknown;
}
```

---

# 20. Provider 实现规则

每个 Provider 必须遵守：

```text
1. 只返回 StandardFoodCandidate 或 FoodQueryItem
2. 不允许把第三方原始结构传给业务层
3. 原始数据只能放 rawPayload
4. 第三方失败不能打断主流程
5. API Key 缺失时 Provider 自动 disabled
6. timeout 必须配置
7. 日志不能输出 appKey / secret / token
8. 营养值尽量统一为 per100g
9. 无法确认的结果必须降低 confidence
10. LLM 输出必须标记 unverified / estimated
```

---

# 21. 营养计算规则

优先级：

```text
1. measuredWeightGram
2. weightGram
3. estimatedWeightGram
4. serving size
5. only candidates, no final calories
```

计算公式：

```text
calories = caloriesPer100g / 100 * weightGram
```

如果使用 LLM 估算：

```text
sourceType = estimated
verifiedLevel = unverified
confidence = low
```

---

# 22. 自建库与用户常用数据沉淀

## 22.1 Analyze 阶段不沉淀

Analyze 只保存：

```text
querySnapshot
recognitionSnapshot
resultSnapshot
rawCandidates
pending meal_item
```

## 22.2 Confirm 阶段沉淀

Confirm 后写：

```text
foods
food_nutrients
external_food_mappings
user_common_foods
food_corrections
```

## 22.3 user_common_foods

每次用户确认后 upsert：

```text
userId + foodId
```

更新：

```text
usageCount + 1
lastUsedAt = now
defaultWeightGram = 本次确认重量
aliasName = 用户输入名，可选
```

## 22.4 food_corrections

用户修改名称、重量、营养、候选时写入。

用途：

```text
优化识别
优化排序
训练别名
分析 Provider 错误
提升自建库质量
```

---

# 23. 推荐数据库表

```text
meal_records
meal_items
foods
food_nutrients
external_food_mappings
user_common_foods
food_corrections
provider_configs
provider_routes
```

当前如果不做后台配置，可以先不建：

```text
provider_configs
provider_routes
```

只用 YAML。

---

# 24. 配置项

```env
# market
DIET_MARKET=us
DIET_DEFAULT_LOCALE=en-US
DIET_DEFAULT_COUNTRY=US

# provider route
PROVIDER_ROUTE_CONFIG_SOURCE=yaml
PROVIDER_ROUTE_CONFIG_PATH=./config/provider-routes.yaml
PROVIDER_ROUTE_DB_OVERRIDE_ENABLED=false

# food query
FOOD_QUERY_MAX_CANDIDATES=5
FOOD_QUERY_ENABLE_LLM_FALLBACK=false
FOOD_QUERY_ENABLE_IMAGE_RECOGNITION=false
FOOD_QUERY_ENABLE_OCR=false

# CN
BOOHEE_ENABLED=false
BOOHEE_BASE_URL=
BOOHEE_APP_ID=
BOOHEE_APP_KEY=
BOOHEE_TIMEOUT_MS=5000

# US
USDA_ENABLED=true
USDA_BASE_URL=https://api.nal.usda.gov/fdc/v1
USDA_API_KEY=
USDA_TIMEOUT_MS=5000

EDAMAM_ENABLED=true
EDAMAM_BASE_URL=https://api.edamam.com
EDAMAM_APP_ID=
EDAMAM_APP_KEY=
EDAMAM_TIMEOUT_MS=5000

# future
NUTRITIONIX_ENABLED=false
OPEN_FOOD_FACTS_ENABLED=false
FATSECRET_ENABLED=false
PASSIO_ENABLED=false
LOGMEAL_ENABLED=false

# vision
QWEN_VL_ENABLED=false
DOUBAO_VISION_ENABLED=false

# llm
LLM_ESTIMATE_ENABLED=false
```

---

# 25. Codex 开发阶段计划

## Phase 1：Food Query Core

目标：

```text
建立统一 FoodQueryService 主干
```

实现：

```text
FoodQueryInput
FoodQueryItem
FoodQueryResult
StandardFoodCandidate
FoodQueryService
FoodQueryRouter
FoodQueryCalculator
FoodQueryRankingService
ProviderRegistry
ProviderRouteConfigService
YAML route config
InternalProvider stub
LlmEstimateProvider stub
```

验收：

```text
可以输入 manual_text
可以返回 FoodQueryResult
可以按 YAML 解析 Provider 顺序
Provider 未启用时自动跳过
```

---

## Phase 2：US MVP Providers

目标：

```text
接入美国 MVP Provider
```

实现：

```text
USDAProvider
USDAClient
USDAMapper
EdamamProvider
EdamamClient
EdamamMapper
```

验收：

```text
US ingredient:
internal -> usda -> edamam -> llm

US prepared_dish:
internal -> edamam -> usda -> llm

Provider 返回 StandardFoodCandidate
营养值标准化为 per100g
```

---

## Phase 3：CN MVP Providers

目标：

```text
接入国内 MVP Provider
```

实现：

```text
BooheeProvider
BooheeClient
BooheeMapper
QwenVisionProvider stub or interface
DoubaoVisionProvider stub or interface
```

验收：

```text
CN ingredient:
internal -> boohee -> llm

CN prepared_dish:
internal -> boohee -> llm

Vision 输出 FoodQueryItem[]
```

---

## Phase 4：Meal Flow Integration

目标：

```text
把 FoodQuery 接入 Meal 主链路
```

实现：

```text
CreateMealRecord
AnalyzeFoodItem
ConfirmFoodItem
FinishMealRecord
MealItemResult
MealResult
```

验收：

```text
CreateMealRecord 创建 active meal
AnalyzeFoodItem 创建 pending meal_item
ConfirmFoodItem 更新 confirmed/corrected
Confirm 后写 user_common_foods
FinishMealRecord 汇总整餐营养
```

---

## Phase 5：Persistence & Learning

目标：

```text
自建库和用户常用数据沉淀
```

实现：

```text
foods
food_nutrients
external_food_mappings
user_common_foods
food_corrections
```

验收：

```text
用户确认后创建/关联 food
用户确认后 upsert user_common_foods
用户修正后写 food_corrections
下次查询 internal 优先命中
```

---

## Phase 6：HTTP Debug & Provider Status

目标：

```text
本地调试能力
```

实现：

```text
GET /health
GET /debug/food-query/search
GET /debug/providers
```

验收：

```text
debug 默认关闭
health 总是可用
Provider 状态可查看
```

---

## Phase 7：Future Extension

后续再做：

```text
NutritionixProvider
FatSecretProvider
PassioProvider
LogMealProvider
Open Food Facts async/offline
Provider Admin Management
DietPlanService
DietPlanAnalysisService
```

---

# 26. Codex 开发总约束

Codex 必须遵守：

```text
1. 不允许在 AnalyzeFoodItem 中写死 Provider。
2. 不允许 Provider 原始响应污染业务 DTO。
3. 不允许 LLM 结果伪装成 verified。
4. 不允许 Analyze 阶段写 user_common_foods。
5. 不允许 Open Food Facts 进入 MVP 实时链路。
6. 不允许因为 Provider 没有 API Key 导致服务启动失败。
7. 不允许绕过 FoodQueryService 直接调 Provider。
8. 不允许把组合餐强行当成单个食材。
9. 不允许把饮食计划逻辑放入当前阶段。
10. 不允许破坏项目统一 BaseEntity / Logger / Config / Redis 规范。
```

---

# 27. 官方参考资料

- USDA FoodData Central API Guide  
  https://fdc.nal.usda.gov/api-guide

- Edamam Food Database API Documentation  
  https://developer.edamam.com/food-database-api-docs

- Boohee / 薄荷健康官网与商务合作入口  
  https://www.boohee.com/food

> 注意：Boohee 具体 API 接入、授权、价格和字段以商务对接结果为准。当前文档只定义系统架构和 Provider 抽象。

---

# 28. 最终定版

当前 Codex 开发按此定版：

```text
CN MVP:
Vision
-> Internal
-> Boohee
-> LLM fallback

US MVP:
Vision
-> Internal
-> USDA
-> Edamam
-> LLM fallback
```

核心能力：

```text
FoodQueryService
ProviderRouter
ProviderRegistry
NutritionCalculator
ConfirmFoodItem
Internal DB Growth
```

一句话：

```text
用最小 Provider 组合跑通食物识别、营养查询、称重计算和用户确认沉淀；未来所有第三方都作为 Provider 插件扩展。
```
