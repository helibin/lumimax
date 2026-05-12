# Codex 调度开发方案（按当前已拍板计划）

> 目标：把当前已定策略转成可直接分发给 Codex/Agent 执行的任务清单与调度规则。  
> 依据文档：`分阶段路线图.md`、`第三方食品营养识别调研.md`、`food-provider-strategy.md`、`设备接入协议规范v1.3.md`、`AGENTS.md`。

---

## 1. 本期目标（MVP）

本期只做可上线主链路：

```text
meal.record.create
  -> food.analysis.request
  -> food.analysis.result(items[])
  -> food.analysis.confirm.request/result
  -> nutrition.analysis.request/result
```

并满足以下硬约束：

- 设备匿名身份（协议不使用 `meta.principalType`）。
- IoT 接入：EMQ X 主链路；IoT bridge 转 RabbitMQ 再分发 biz-service。
- 视觉输出必须包含：`name + confidence + count`（count 可为空）。
- 营养回查：`user_common -> third_party -> llm_estimated`。
- 单次回包返回预估营养；本餐结束返回汇总。
- 协议字段：`recognitions` 统一为 `items`。

---

## 2. Codex 调度原则

### 2.1 角色与边界（对应 `AGENTS.md`）

- `GatewayAgent`：只动 `apps/gateway/` 路由与 DTO。
- `BaseAgent`：只动 `apps/base-service/`（本期尽量少改）。
- `BizDietAgent`：主力，`apps/biz-service/src/diet/`。
- `IoTAgent`：`apps/biz-service/src/iot/` 与协议适配。
- `MessagingAgent`：`packages/messaging/`（RabbitMQ 抽象）。
- `Validator`：测试与联调脚本。

### 2.2 提交与调度约束

- 每个 Codex 任务只认领一个主角色。
- 严禁跨目录顺手重构。
- 一个任务一个可验证目标（必须带验收命令）。
- 先协议/契约，后实现；先工厂配置，后 provider 细节。

---

## 3. 可执行任务拆分（建议 8 个任务）

## T1 - 协议定稿与 DTO 对齐

**Owner**: `IoTAgent` + `GatewayAgent`  
**目标**:
- 完整落地 vNext 协议字段：
  - 移除 `meta.principalType`
  - 移除 `attr.dietPlan.set`
  - `food.analysis.result.items[]`
  - 新增 `food.analysis.confirm.request/result`
- 同步 gateway/biz DTO 命名与字段校验。

**涉及路径**:
- `api/docs/设备接入协议规范v1.3.md`
- `api/apps/gateway/src/**/dto/*`
- `api/apps/biz-service/src/diet/interfaces/*`

**验收**:
- DTO 校验通过。
- 协议示例与 DTO 字段一致。

---

## T2 - RabbitMQ 抽象骨架

**Owner**: `MessagingAgent`  
**目标**:
- 建立 `packages/messaging/` 基础封装：
  - exchange / queue / routing key 常量
  - 发布/订阅客户端
  - 标准消息 envelope

**涉及路径**:
- `api/packages/messaging/**`

**验收**:
- 可在本地启动后完成一发一收 smoke。
- 文档补充命名规范。

---

## T3 - IoT bridge 事件转发（MQTT -> RabbitMQ）

**Owner**: `IoTAgent`  
**目标**:
- 在 IoT bridge 中将 MQTT 业务事件转换为 RabbitMQ 事件：
  - `meal.record.create`
  - `food.analysis.request`
  - `food.analysis.confirm.request`
  - `nutrition.analysis.request`

**涉及路径**:
- `api/apps/biz-service/src/iot/**`（或当前 IoT bridge 实际目录）
- `api/packages/messaging/**`

**验收**:
- 可观察到 4 类事件被正确转发。

---

## T4 - 视觉与营养 provider 工厂配置化

**Owner**: `BizDietAgent`  
**目标**:
- 视觉 provider 环境变量驱动。
- 营养估算 provider（OpenAI/Gemini/Qwen/DeepSeek）环境变量切换。
- 统一超时与错误映射（软失败）。

**涉及路径**:
- `api/apps/biz-service/src/diet/providers/vision/**`
- `api/apps/biz-service/src/diet/providers/estimator/**`
- `api/apps/biz-service/src/diet/providers/**factory*`

**验收**:
- 配置切换生效，不改代码可切 provider。

---

## T5 - 营养路由主链路落地

**Owner**: `BizDietAgent`  
**目标**:
- 固化回查顺序：`user_common -> third_party -> llm_estimated`。
- 按 `DIET_DEPLOYMENT_REGION` 选择 third_party 子集。
- 单次回包必须带预估营养。

**涉及路径**:
- `api/apps/biz-service/src/diet/nutrition/**`
- `api/apps/biz-service/src/diet/food/**`

**验收**:
- 三条路径可覆盖：`user_common` 命中 / `third_party` 命中 / `llm_estimated` 兜底。

---

## T6 - 识别确认链路（confirm）落地

**Owner**: `BizDietAgent`  
**目标**:
- 新增确认动作处理：
  - 直接确认
  - 修正后确认（支持修正名/数量/重量）
- 确认后写 `meal_item` 与 `user_common`。

**涉及路径**:
- `api/apps/biz-service/src/diet/meal/**`
- `api/apps/biz-service/src/diet/diet.facade.ts`

**验收**:
- `food.analysis.confirm.request/result` 全链路可联调。

---

## T7 - 本餐汇总与来源标识

**Owner**: `BizDietAgent`  
**目标**:
- `nutrition.analysis.result` 统一返回汇总。
- 正确计算 `containsEstimated`。
- 保留 `items[].source` 可追溯。

**涉及路径**:
- `api/apps/biz-service/src/diet/nutrition/**`
- `api/apps/biz-service/src/diet/meal/**`

**验收**:
- 本餐 2~3 个 item 的汇总正确，含 estimated 标志。

---

## T8 - 验证与文档收口

**Owner**: `Validator`  
**目标**:
- 单测 + e2e + 协议联调清单齐备。
- 文档最终一致性检查（字段名、事件名、示例）。

**涉及路径**:
- `api/apps/**/**/*.spec.ts`
- `api/docs/设备接入协议规范v1.3.md`
- `api/docs/第三方食品营养识别调研.md`
- `api/docs/food-provider-strategy.md`

**验收**:
- 主链路测试通过。
- 文档无旧字段残留（如 `recognitions`、`principalType`、`attr.dietPlan.set`）。

---

## 4. Codex 任务模板（可复制）

## 4.1 实现任务模板

```text
你是 <角色名>。
目标：完成 <任务ID>。
约束：
1) 仅修改 <允许路径>；
2) 不做无关重构；
3) 必须给出修改文件列表、关键实现点、验证命令、验证结果。
必达验收：
- <验收点1>
- <验收点2>
```

## 4.2 评审任务模板

```text
请对 <任务ID> 产出做研发落地审查，优先检查：
1) 协议字段一致性；
2) 事件命名与路由键一致性；
3) 回查顺序是否符合 user_common->third_party->llm_estimated；
4) 是否引入了未批准能力（实时差值、复杂账号等）。
输出：阻塞问题 / 建议问题 / 可合并结论。
```

---

## 5. 依赖关系与并行建议

- 可并行：
  - `T2`（messaging） 与 `T4`（provider 工厂）。
  - `T8` 准备联调脚本可提前。
- 串行依赖：
  - `T1` -> `T3/T5/T6/T7`（先契约后实现）。
  - `T2` -> `T3`（先有 messaging 抽象）。
  - `T5` -> `T6/T7`（先有营养回查，再确认与汇总）。

---

## 6. 完成定义（DoD）

满足以下即视为本期 Codex 调度完成：

- 协议字段统一（`items[]` + `confirm` 事件 + 无 `principalType` + 无 `attr.dietPlan.set`）。
- IoT bridge 到 RabbitMQ 到 biz-service 主链路可跑通。
- 单次识别含预估营养，本餐结束含汇总结果。
- `user_common` 沉淀在确认后发生，且来源可追溯。
- 文档、DTO、实现、测试四者一致。
