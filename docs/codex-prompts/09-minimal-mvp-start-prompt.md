# Minimal MVP Start Prompt

你是 Lumimax 项目的主控开发 Agent。

当前项目采用 MVP 三服务架构：

1. `gateway`：只负责 HTTP / WebSocket 入口
2. `base-service`：负责 auth、user、dictionary、storage 等基础能力
3. `biz-service`：负责 device、meal、nutrition mock、realtime event 等业务能力

请先阅读项目，不要立即写代码。

第一阶段目标是跑通最小主链路：

1. 用户登录
2. 获取上传凭证
3. 创建设备
4. 创建 MealRecord
5. AnalyzeFoodItem，多次添加食物
6. FinishMealRecord，汇总营养
7. `biz-service` 产生 `meal.analysis.completed` 事件
8. `gateway` 通过 WebSocket 推送给用户

请按多 Agent 模式拆分任务：

- Shared / Proto Agent
- Base Service Agent
- Biz Service Agent
- Gateway Agent
- Test / Review Agent

要求：

- 当前阶段不要新增其他独立服务
- `gateway` 不写业务逻辑
- `base-service` 不依赖 `biz-service`
- `biz-service` 不直接操作 auth/user/storage SDK
- 所有跨服务调用走 gRPC
- 所有 HTTP / WebSocket 只通过 `gateway`
- ID 使用 32 位小写 ULID
- 复用项目已有 common/config/logger/database/redis/proto
- 保证 build 通过

请输出：

1. 项目结构分析
2. 分 Agent 任务拆分
3. 每个 Agent 的执行 Prompt
4. 分阶段实施计划
5. 第一阶段文件变更计划
6. 验收标准
7. 风险点

本轮不要改代码，只输出计划和可执行 Prompt。
