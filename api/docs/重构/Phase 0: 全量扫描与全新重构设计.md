你是 NestJS monorepo 全新重构 Agent。

本阶段目标：

扫描当前项目，设计全新 gateway + base-service + biz-service 架构。

本阶段不需要做历史兼容，不需要保留旧 gRPC，不需要保留旧 service selector。

# 当前可能存在的服务

请扫描：

```txt
apps/
````

识别是否存在：

```txt
gateway
user-service
notification-service
system-service
storage-service
device-service
iot-bridge-service
diet-service
realtime-service
admin-web
```

# 本阶段任务

## 1. 扫描项目结构

请输出：

* apps 目录
* libs 目录
* configs 目录
* proto 文件位置
* migration 文件位置
* 当前各服务 main.ts
* 当前各服务 app.module.ts
* 当前各服务模块列表
* 当前 gRPC client / controller
* 当前 MQ / SQS consumer
* 当前 storage provider
* 当前 diet meal 流程
* 当前 IoT topic / payload 处理

## 2. 判断可复用代码

按以下维度分类：

```txt
直接复用
需要改造后复用
建议废弃重写
```

重点判断：

* user/auth
* system/admin/role/permission
* dictionary/system-config/audit-log
* notification
* storage
* device
* iot-bridge
* diet
* realtime
* common/logger/config/database

## 3. 输出目标架构设计

目标：

```txt
apps/gateway
apps/base-service
apps/biz-service
```

输出每个服务职责边界。

## 4. 输出新目录结构

请设计：

```txt
apps/gateway/src
apps/base-service/src
apps/biz-service/src
libs/*
configs/*
```

## 5. 输出新 gRPC 契约草案

不需要兼容旧 proto。

请设计：

```txt
base.proto
biz.proto
```

base-service 包含：

```txt
AuthService
UserService
AdminAuthService
AdminAccountService
RoleService
PermissionService
DictionaryService
SystemConfigService
AuditLogService
NotificationService
StorageService
```

biz-service 包含：

```txt
DeviceService
IotService
IotProvisionService
IotMessageService
MealService
FoodService
NutritionService
RecognitionLogService
RealtimeService，如需要
```

## 6. 输出新 HTTP API 草案

gateway 对外提供：

```txt
/auth/**
/users/**
/admin/**
/devices/**
/meals/**
/foods/**
/storage/**
```

管理端统一：

```txt
/admin/**
```

## 7. 输出数据库设计草案

按模块输出核心表：

base-service：

```txt
users
user_local_auths
user_extra_auths
system_admins
system_roles
system_permissions
system_admin_roles
system_role_permissions
system_dictionaries
system_dictionary_items
system_configs
system_audit_logs
notifications
notification_templates
storage_objects
```

biz-service：

```txt
devices
device_bindings
device_status_logs
iot_messages
iot_provision_records
meal_records
meal_items
foods
food_nutritions
recognition_logs
```

要求：

* ID 使用 ULID
* 时间使用 timestamptz
* JSON 使用 jsonb
* 写操作保留 requestId
* 不要把 meal image 改成数组

## 8. 输出配置设计草案

设计：

```txt
configs/development/shared.env
configs/development/gateway.env
configs/development/base-service.env
configs/development/biz-service.env
```

## 9. 输出执行顺序

请给出后续阶段建议：

```txt
Phase 1: 公共包与目录初始化
Phase 2: base-service
Phase 3: biz-service
Phase 4: gateway
Phase 5: IoT/SQS
Phase 6: storage
Phase 7: diet
Phase 8: tests
Phase 9: cleanup
```

# 禁止事项

本阶段禁止：

* 大量删除文件
* 大量迁移业务代码
* 修改 migration
* 修改 IoT topic
* 修改 SQS queue
* 把图片字段改数组

# 输出要求

输出：

1. 扫描结果
2. 可复用代码判断
3. 新架构设计
4. 新目录结构
5. 新 gRPC 草案
6. 新 HTTP API 草案
7. 新数据库草案
8. 新配置草案
9. 后续阶段计划