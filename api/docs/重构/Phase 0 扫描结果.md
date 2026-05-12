# Phase 0 扫描结果

## 1. 当前 apps 结构

```txt
apps/
├─ gateway
├─ base-service
├─ biz-service
├─ user-service
├─ system-service
├─ notification-service
├─ storage-service
├─ device-service
├─ iot-bridge-service
├─ diet-service
└─ realtime-service
```

## 2. 当前 libs 结构

```txt
libs/
├─ common
├─ config
├─ database
├─ grpc
├─ logger
├─ mq
├─ proto
├─ redis
├─ shared
└─ storage
```

## 3. 当前服务职责判断

- `gateway`: 现有统一 HTTP 入口，已经具备用户端、管理端、IoT HTTP 回调与 gRPC 聚合能力。
- `user-service`: C 端用户、认证、identity、privacy。
- `system-service`: B 端管理员、角色权限、字典、系统配置、审计。
- `notification-service`: 通知消息、模板、设备 token、业务通知分发。
- `storage-service`: 上传签名、对象确认、对象迁移、S3/OSS 访问边界。
- `device-service`: 设备管理、绑定、OTA。
- `iot-bridge-service`: IoT 上下行协议、云厂商消息消费与设备消息桥接。
- `diet-service`: meal / food / recognition / nutrition 主链路。
- `realtime-service`: realtime / websocket 能力。
- `base-service`: 已有第一版聚合壳，当前以 facade / bridge 方式代理基础服务。
- `biz-service`: 已有第一版聚合壳，当前以 facade / bridge 方式代理业务服务。

## 4. 可复用模块

- `libs/common`: requestId、统一错误、gRPC 包装、日志接入。
- `libs/config`: env 加载与校验入口，可作为新三服务统一配置基座。
- `libs/database`: TypeORM 基础设施、命名策略、migration runner。
- `libs/logger`: 日志实现，可直接作为三服务统一日志层。
- `libs/redis`: Redis 连接封装，可作为基础缓存/限流/会话能力。
- `libs/mq`: RabbitMQ / MQ 适配层，可供 `biz-service` IoT consumer 复用。
- `libs/storage`: provider 抽象适合作为 `base-service` storage 安全模块底座。
- `libs/grpc`: 已存在 `base.proto` / `biz.proto`，适合作为新契约包继续演进。
- `gateway/src/infrastructure/client-selector/*`: 可作为新 gateway 对 base / biz gRPC 客户端的起点。
- `apps/base-service/src/modules/*Facade*`: 可作为基础能力收口的过渡外观层。
- `apps/biz-service/src/modules/*Facade*`: 可作为业务能力收口的过渡外观层。

## 5. 建议删除模块

阶段性保留，最终在 Phase 12 删除：

- `apps/user-service`
- `apps/system-service`
- `apps/notification-service`
- `apps/storage-service`
- `apps/device-service`
- `apps/iot-bridge-service`
- `apps/diet-service`
- `apps/realtime-service`
- `libs/grpc`
- `libs/types`
- `gateway` 中仅为旧服务兼容存在的直连 gRPC client / selector 分支

## 6. 新架构目录设计

```txt
apps/
├─ gateway/
│  ├─ src/controllers
│  ├─ src/modules/admin
│  ├─ src/modules/api
│  ├─ src/modules/base-client
│  ├─ src/modules/biz-client
│  └─ src/modules/common
├─ base-service/
│  ├─ src/modules/auth
│  ├─ src/modules/user
│  ├─ src/modules/admin
│  ├─ src/modules/role
│  ├─ src/modules/permission
│  ├─ src/modules/dictionary
│  ├─ src/modules/system-config
│  ├─ src/modules/audit-log
│  ├─ src/modules/notification
│  ├─ src/modules/storage
│  ├─ src/grpc
│  └─ src/persistence
└─ biz-service/
   ├─ src/modules/device
   ├─ src/modules/iot
   ├─ src/modules/diet
   ├─ src/modules/realtime
   ├─ src/modules/shared
   ├─ src/grpc
   └─ src/persistence

libs/
├─ common/
├─ config/
├─ database/
├─ grpc/
├─ redis/
├─ logger/
├─ mq/
└─ storage/
```

## 7. 新 gRPC 契约设计草案

原则：

- 不再复用旧多服务 proto。
- gateway 只依赖 `base.proto` 与 `biz.proto`。
- 按 bounded context 划分 service，而不是按旧 app 划分。
- 统一 request wrapper：`request_id`、`tenant_scope`、`user_json`、`params_json`、`query_json`、`body_json`。

建议：

- `base.proto`
  - `BaseHealthService`
  - `BaseAuthFacadeService`
  - `BaseUserFacadeService`
  - `BaseAdminFacadeService`
  - `BaseDictionaryFacadeService`
  - `BaseNotificationFacadeService`
  - `BaseStorageFacadeService`
- `biz.proto`
  - `BizHealthService`
  - `BizDeviceFacadeService`
  - `BizIotFacadeService`
  - `BizDietFacadeService`
  - `BizRealtimeFacadeService`

阶段策略：

- Phase 1-3 允许保留 `Execute` / `CallAdmin` 外观式接口。
- Phase 5 开始逐步替换为明确语义 RPC，例如：
  - `CreateUploadToken`
  - `PromoteObject`
  - `CreateMealRecord`
  - `AnalyzeFoodItem`
  - `FinishMealRecord`
  - `IngestIotMessage`

## 8. 新数据库模块设计草案

`base-service` 数据域：

- `base_users`
- `base_refresh_tokens`
- `base_admin_users`
- `base_roles`
- `base_permissions`
- `base_role_permissions`
- `base_admin_user_roles`
- `base_dictionaries`
- `base_dictionary_items`
- `base_system_configs`
- `base_audit_logs`
- `base_notification_messages`
- `base_notification_templates`
- `base_notification_device_tokens`
- `base_storage_objects`
- `base_upload_sessions`

`biz-service` 数据域：

- `biz_devices`
- `biz_device_bindings`
- `biz_device_credentials`
- `biz_device_commands`
- `biz_device_shadows`
- `biz_ota_tasks`
- `biz_iot_messages`
- `biz_meal_records`
- `biz_food_items`
- `biz_recognition_logs`
- `biz_foods`
- `biz_food_nutrients`
- `biz_food_sources`
- `biz_realtime_sessions`（如需要）

关键约束：

- 所有主键使用 ULID。
- 时间字段统一 `timestamptz`。
- 称重/饮食图片统一单图字段：`image_key` / `image_object_id`。
- upload session 与 storage object 留在 `base-service`，业务仅引用 object id / key。
- 审计日志只在 `base-service` 落库，通过 domain + resource 记录跨服务写操作。
