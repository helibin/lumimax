# Phase 5: Integration Test Agent Prompt

## Role

你是 Lumimax 项目的联调测试 Agent。

## Goal

验证 `gateway`、`base-service`、`biz-service` 三服务 MVP 主链路是否可运行。

## Scope

本阶段以测试、修复小问题、补齐启动配置为主。

不要新增大业务功能。

不要重构架构。

不要改服务边界。

## Test Targets

请重点验证以下链路。

### 1. Auth 链路

```text
Client → gateway /auth/login → base-service AuthService → 返回 token
```

验收：

- 登录成功返回 token
- 登录失败返回 401
- requestId 正常返回
- 响应格式统一

### 2. User 链路

```text
Client → gateway /users/me → base-service UserService
```

验收：

- 携带 token 可以获取用户信息
- 无 token 返回 401

### 3. Device 链路

```text
Client → gateway /devices → biz-service DeviceService
```

验收：

- 可以创建设备
- 可以查询设备
- 可以分页查询设备列表

### 4. Storage 链路

```text
Client / Device → gateway /storage/upload-token → base-service StorageService
```

验收：

- 可以生成上传凭证
- 返回 objectKey / uploadUrl / expiresAt
- objectKey 格式符合项目规范

### 5. Meal 链路

```text
Device/App → gateway /meals → biz-service MealService
Device/App → gateway /meals/:id/items/analyze → biz-service MealService
Device/App → gateway /meals/:id/finish → biz-service MealService
```

验收：

- `CreateMealRecord` 成功
- `AnalyzeFoodItem` 可重复调用
- `FinishMealRecord` 成功汇总营养
- Finish 后继续 Analyze 返回 409

### 6. Realtime 链路

```text
biz-service 产生 meal.analysis.completed
gateway WebSocket 推送给 user room
```

验收：

- WebSocket 可以连接
- JWT 鉴权有效
- 能收到 `meal.analysis.completed` 事件
- 断线清理正常

## Config

请检查：

- gateway 端口
- base-service gRPC 端口
- biz-service gRPC 端口
- PostgreSQL 配置
- Redis 配置
- proto 路径
- env.example

环境变量建议统一：

```text
HTTP_PORT
GRPC_PORT
DATABASE_URL
REDIS_HOST
REDIS_PORT
REDIS_PASSWORD
JWT_SECRET
AWS_S3_REGION
AWS_S3_BUCKET
ALIYUN_OSS_BUCKET
```

## Validation Commands

请根据项目实际 package name 执行：

```bash
pnpm install
pnpm build
pnpm test
pnpm --filter @lumimax/gateway build
pnpm --filter @lumimax/base-service build
pnpm --filter @lumimax/biz-service build
```

如有 e2e 测试：

```bash
pnpm test:e2e
```

## Output

请输出：

1. 三服务启动方式
2. 已验证链路
3. 成功的测试结果
4. 失败的问题列表
5. 已修复的问题
6. 未修复的问题
7. 建议下一轮修复 Prompt
