# Phase 1: Shared / Proto Agent Prompt

## Role

你是 Lumimax 项目的 Shared / Proto 开发 Agent。

## Goal

对齐三服务架构下的 shared packages 和 gRPC proto 结构。

## Scope

本阶段只处理：

- `packages/proto`
- `packages/common`
- `packages/types`
- `packages/config`
- `packages/logger`
- `packages/database`
- `packages/redis`

不要修改 `apps/gateway`、`apps/base-service`、`apps/biz-service` 的复杂业务代码。

## Architecture

当前只保留 3 个服务：

1. `gateway`
2. `base-service`
3. `biz-service`

proto 按服务域拆分：

```text
packages/proto/
├── base/
│   ├── auth.proto
│   ├── user.proto
│   ├── role.proto
│   ├── permission.proto
│   ├── menu.proto
│   ├── system-config.proto
│   ├── dictionary.proto
│   ├── notification.proto
│   └── storage.proto
│
└── biz/
    ├── device.proto
    ├── iot.proto
    ├── meal.proto
    ├── nutrition.proto
    ├── realtime.proto
    ├── ota.proto
    └── telemetry.proto
```

## Requirements

请完成：

1. 检查现有 proto 结构
2. 按 base / biz 领域整理 proto
3. 保留现有可用定义，避免破坏性删除
4. 统一基础 message，例如：
   - `Empty`
   - `PageRequest`
   - `PageResponse`
   - `GrpcResponse`
   - `IdRequest`
   - `RequestContext`
5. 为 `base-service` 定义核心 gRPC service：
   - `AuthService`
   - `UserService`
   - `RoleService`
   - `PermissionService`
   - `MenuService`
   - `SystemConfigService`
   - `DictionaryService`
   - `NotificationService`
   - `StorageService`
6. 为 `biz-service` 定义核心 gRPC service：
   - `DeviceService`
   - `DeviceBindingService`
   - `IotBridgeService`
   - `MealService`
   - `NutritionService`
   - `RealtimeEventService`
   - `OtaService`
   - `TelemetryService`
7. 检查 proto 生成脚本是否仍然可用
8. 如项目已有 proto 生成命令，请复用
9. 不引入无关依赖

## ID Rule

所有 id 字段使用 `string`，业务上对应全小写 32 位 ULID。

## Validation

完成后执行可用命令：

```bash
pnpm build
pnpm typecheck
pnpm proto:generate
```

如果某些命令不存在，请说明原因，不要编造结果。

## Output

请输出：

1. 修改文件列表
2. proto 目录最终结构
3. 新增 / 调整的 message
4. 新增 / 调整的 service
5. 已执行命令
6. 验证结果
7. 对 `gateway` / `base-service` / `biz-service` 的后续影响
