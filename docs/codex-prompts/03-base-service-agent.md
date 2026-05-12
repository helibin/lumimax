# Phase 2: Base Service Agent Prompt

## Role

你是 Lumimax 项目的 `base-service` 开发 Agent。

## Goal

实现 MVP 阶段 `base-service` 的基础能力骨架和核心逻辑。

## Service Boundary

`base-service` 是基础能力服务，负责：

- auth 认证
- user 用户
- role 角色
- permission 权限
- menu 菜单
- system config 系统配置
- dictionary 字典
- notification 通知
- storage 存储
- audit log 审计日志

`base-service` 不允许依赖 `biz-service`。

## Scope

本阶段只修改：

- `apps/base-service`
- 与 `base-service` 强相关的 `packages/proto/base`
- 必要的 shared packages 类型

不要修改 `biz-service` 业务逻辑。

不要在 `gateway` 写业务逻辑。

## Directory Target

请按类似结构组织：

```text
apps/base-service/src/
├── auth/
├── users/
├── roles/
├── permissions/
├── menus/
├── system-config/
├── dictionary/
├── notification/
├── storage/
├── audit-log/
├── grpc/
├── common/
├── app.module.ts
└── main.ts
```

## MVP Requirements

### Auth

实现最小可用认证能力：

- 用户登录
- JWT 签发
- JWT 校验
- 当前用户信息解析
- 密码 hash / verify
- 支持后续扩展微信、Google、Apple 登录，但本阶段不用完整实现第三方登录

### User

实现：

- 创建用户
- 查询用户详情
- 查询用户列表
- 更新用户基础信息
- 禁用 / 启用用户
- 用户 ID 使用 32 位小写 ULID

### Role / Permission / Menu

实现 B 端管理后台最小 RBAC：

- 角色创建
- 角色查询
- 权限查询
- 给角色绑定权限
- 菜单列表
- 根据用户查询权限和菜单

### System Config / Dictionary

实现：

- 配置项增删改查
- 字典类型
- 字典项
- Redis 缓存
- 配置变更后刷新缓存

字典示例：

- `gender`：1 男，2 女
- `user_type`：1 C端用户，2 B端用户
- `device_status`
- `meal_status`

### Notification

MVP 阶段只实现站内通知 / 系统通知骨架：

- 创建通知
- 查询用户通知
- 标记已读
- 预留第三方推送适配接口

### Storage

实现基础存储能力：

- 生成上传凭证
- 文件记录
- 临时文件 / 永久文件路径
- objectKey 校验
- 预留 S3 / OSS Provider
- 不要让 `biz-service` 直接操作 S3 / OSS SDK

### Audit Log

实现：

- 记录后台关键操作
- 记录 actorUserId
- 记录 action
- 记录 resourceType
- 记录 resourceId
- 记录 requestId
- 记录 createdAt

## Database

优先复用项目已有 database package。

如果已有 BaseEntity / CommonEntity，请复用。

实体字段应包含项目通用字段，例如：

- id
- createdAt
- updatedAt
- deletedAt，如项目已有软删除
- createdBy，如项目已有
- updatedBy，如项目已有

## gRPC

`base-service` 通过 gRPC 暴露能力给 `gateway` 和 `biz-service`。

请实现对应 Controller：

- `AuthGrpcController`
- `UserGrpcController`
- `RoleGrpcController`
- `PermissionGrpcController`
- `MenuGrpcController`
- `SystemConfigGrpcController`
- `DictionaryGrpcController`
- `NotificationGrpcController`
- `StorageGrpcController`

## Error Handling

使用项目通用异常和错误码。

如果项目已有错误码规范，请复用。

基础建议：

```text
0      ok
40001  invalid payload
40100  unauthorized
40300  forbidden
40400  not found
40900  conflict
42200  object key invalid
50000  internal error
50300  dependency unavailable
```

## Validation

完成后执行：

```bash
pnpm --filter @lumimax/base-service build
pnpm --filter @lumimax/base-service test
```

如果包名不同，请先查看 package.json 后使用正确包名。

## Output

请输出：

1. 修改文件列表
2. 新增模块说明
3. 新增实体说明
4. 新增 gRPC 方法说明
5. Redis 缓存说明
6. Storage Provider 设计说明
7. 已执行命令
8. 验证结果
9. 未完成事项
