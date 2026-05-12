# Parallel Dispatch Master Prompt

## Role

你是 Lumimax 项目的主控调度 Agent，负责协调多个开发 Agent 并行完成三服务 MVP 架构开发。

## Architecture

当前项目只保留三个服务：

1. `gateway`
2. `base-service`
3. `biz-service`

不要新增其他独立服务。

## Agent Assignment

### Agent A：Gateway Agent

负责：

- HTTP Controller
- WebSocket Gateway
- Auth Guard
- gRPC Client
- Unified Response
- Swagger
- RequestId
- Rate Limit

禁止：

- 写核心业务逻辑
- 直接访问数据库
- 直接访问 S3 / OSS SDK

### Agent B：Base Service Agent

负责：

- auth
- user
- role
- permission
- menu
- system config
- dictionary
- notification
- storage
- audit log

禁止：

- 依赖 `biz-service`
- 写设备业务
- 写饮食业务
- 写 IoT Provider 业务

### Agent C：Biz Service Agent

负责：

- device
- device binding
- iot bridge
- meal
- food analysis
- nutrition
- realtime event
- ota
- telemetry
- device command

禁止：

- 写 auth 核心逻辑
- 写 user 核心逻辑
- 直接操作 S3 / OSS SDK
- 维护 WebSocket 长连接

### Agent D：Shared / Proto Agent

负责：

- `packages/proto`
- `packages/common`
- `packages/types`
- 统一 gRPC message
- 统一错误码
- 统一 request context
- proto generate

### Agent E：Test / Review Agent

负责：

- build
- typecheck
- test
- e2e
- lint
- 架构边界审查
- 修复小问题

## Execution Plan

### Phase 0：Repository Analysis

由主控 Agent 执行。

只读项目，不改代码。

输出：

- 当前结构
- 迁移计划
- 并行任务清单
- 风险点

### Phase 1：Shared Foundation

由 Agent D 执行。

目标：

- 统一 proto
- 统一 common types
- 统一 response / error / request context
- 确保 proto generate 可用

### Phase 2：Base and Biz Parallel Skeleton

Agent B 和 Agent C 并行执行。

Agent B 完成 `base-service` 骨架。

Agent C 完成 `biz-service` 骨架。

要求：

- 不互相改对方代码
- 不重复修改 proto 核心文件
- 如需 proto 变更，提交给 Agent D 合并
- 保证各自 build

### Phase 3：Gateway Integration

Agent A 执行。

目标：

- 接入 `base-service` gRPC
- 接入 `biz-service` gRPC
- 暴露 HTTP API
- 实现 WebSocket 推送
- 实现统一响应

### Phase 4：Integration Test

Agent E 执行。

验证：

- auth login
- users me
- device create/list
- storage upload token
- meal create/analyze/finish
- realtime event push

### Phase 5：Code Review and Fix

Agent E 审查。

输出：

- 高优先级问题
- 中优先级问题
- 低优先级问题
- Fix Prompt

## Merge Rules

1. 任何 Agent 不得删除其他 Agent 的代码。
2. 任何 Agent 不得修改服务边界。
3. 任何跨服务接口变更必须经过 Shared / Proto Agent。
4. `gateway` 不允许出现核心业务计算。
5. `base-service` 不允许依赖 `biz-service`。
6. `biz-service` 不允许直接访问用户表、权限表、S3/OSS SDK。
7. 所有服务必须能独立 build。
8. 所有新增环境变量必须同步 env.example。
9. 所有新增 gRPC 方法必须有 proto 定义。
10. 所有新增 HTTP API 必须经过 `gateway`。

## Final Output

完成所有阶段后，请输出：

1. 最终目录结构
2. 服务边界说明
3. gRPC 服务清单
4. HTTP API 清单
5. WebSocket 事件清单
6. 数据库实体清单
7. 环境变量清单
8. 启动命令
9. 测试结果
10. 后续拆分建议
