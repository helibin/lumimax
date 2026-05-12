你是 NestJS base-service 重构 Agent。

本阶段目标：

基于全新架构重建 base-service。

base-service 合并：

```txt
user-service
system-service
notification-service
storage-service
````

不需要兼容旧 service 内部结构。

# 目标目录

```txt
apps/base-service/src/
├─ main.ts
├─ app.module.ts
├─ grpc/
│  ├─ base-grpc.module.ts
│  └─ controllers
├─ modules/
│  ├─ auth
│  ├─ user
│  ├─ admin
│  ├─ role
│  ├─ permission
│  ├─ dictionary
│  ├─ system-config
│  ├─ audit-log
│  ├─ notification
│  └─ storage
└─ config
```

数据库迁移统一放在 `data/db/migrations`，不再在应用目录内维护 `src/migrations`。

# 模块职责

## auth

负责：

* 用户登录
* token 相关基础认证
* 手机/邮箱登录，如项目已有
* 第三方登录，如微信/Google

## user

负责：

* C端/B端用户
* 用户资料
* 用户状态
* 用户绑定信息

## admin

负责：

* 后台管理员
* 管理员登录
* 管理员状态
* 管理员角色

## role / permission

负责：

* RBAC
* 角色
* 权限
* 角色权限绑定

## dictionary

负责：

* 字典
* 字典项
* Redis 缓存

## system-config

负责：

* 系统配置
* Redis 缓存
* string/number/boolean/json 类型

## audit-log

负责：

* 操作审计
* 只新增和查询
* 不允许修改删除

## notification

负责：

* 通知
* 通知模板
* 推送 provider
* 站内信

## storage

负责：

* 上传签名
* 对象确认
* objectKey 校验
* S3/OSS provider
* 临时文件和正式文件

# 数据表

请实现 TypeORM entities：

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

要求：

* ID 使用 ULID
* 统一主键长度 36
* jsonb
* deletedAt 软删除
* creatorId / editorId 审计字段
* 关键唯一索引
* 数据库时间统一按 UTC 读写
* 数据库迁移统一写入 `data/db/migrations`

# gRPC

实现 base.proto 对应 controller：

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

# Seed

实现 seed：

* 默认 admin
* 默认 super_admin
* 默认 permissions
* 默认 dictionaries
* 默认 system configs，可少量

默认管理员密码从 env 读取：

```env
SYSTEM_DEFAULT_ADMIN_USERNAME=admin
SYSTEM_DEFAULT_ADMIN_PASSWORD=admin123456
```

# Storage 安全要求

storage 模块必须：

* 不向其他模块暴露 AK/SK
* 不暴露 raw S3/OSS client
* 使用 StorageProviderInterface
* objectKey 必须校验 ownership
* temp path 和 file path 分离
* 上传签名 TTL 从 env 读取

路径建议：

```txt
tmp-file/user/{userId}/{yyyyMMdd}/{ulid}.jpg
tmp-file/device/{deviceId}/{yyyyMMdd}/{ulid}.jpg
file/user/{userId}/avatar/image/{ulid}.jpg
file/user/{userId}/meal/{mealId}/image/{ulid}.jpg
file/default/avatar/image/default.png
```

# Config

加载：

```txt
configs/{env}/shared.env
configs/{env}/base-service.env
```

# 测试

新增：

```txt
apps/base-service/test/admin-auth.e2e-spec.ts
apps/base-service/test/rbac.e2e-spec.ts
apps/base-service/test/dictionary.e2e-spec.ts
apps/base-service/test/storage.e2e-spec.ts
```

# 验证

执行：

```bash
pnpm --filter base-service build
pnpm --filter base-service test
```

# 输出要求

输出：

1. 新增文件
2. 修改文件
3. entity 列表
4. gRPC service 列表
5. seed 说明
6. storage 安全说明
7. 验证命令
