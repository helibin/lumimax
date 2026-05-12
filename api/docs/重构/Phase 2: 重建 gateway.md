你是 NestJS API Gateway / BFF 重构 Agent。

本阶段目标：

基于全新架构重建 gateway。

gateway 只对接：

```txt
base-service
biz-service
````

不再对接旧服务。

# gateway 职责

负责：

* HTTP API
* Admin API
* 鉴权
* 参数校验
* BFF 聚合
* requestId
* 统一响应
* 错误转换
* gRPC client

不负责：

* 不访问数据库
* 不访问 S3/OSS raw client
* 不消费 SQS
* 不写复杂业务逻辑

# 目标目录

```txt
apps/gateway/src/
├─ main.ts
├─ app.module.ts
├─ common
├─ grpc
│  ├─ clients
│  │  ├─ base-service.client.ts
│  │  └─ biz-service.client.ts
│  └─ grpc-client.module.ts
├─ modules
│  ├─ auth
│  ├─ users
│  ├─ admin
│  ├─ storage
│  ├─ devices
│  ├─ meals
│  ├─ foods
│  └─ iot
└─ config
```

# HTTP API

设计并实现 controller 骨架：

## Auth

```txt
POST /auth/login
POST /auth/logout
GET  /auth/me
```

## Users

```txt
GET   /users/me
PATCH /users/me
```

## Storage

```txt
POST /storage/upload-token
POST /storage/objects/confirm
```

## Devices

```txt
GET  /devices
GET  /devices/:id
POST /devices/:id/bind
POST /devices/:id/unbind
```

## Meals

```txt
POST /meals
POST /meals/:id/items/analyze
POST /meals/:id/finish
GET  /meals
GET  /meals/:id
```

## Admin

```txt
POST /admin/auth/login
GET  /admin/auth/me

GET  /admin/users
GET  /admin/users/:id
PATCH /admin/users/:id/status

GET  /admin/devices
GET  /admin/devices/:id
POST /admin/devices
PATCH /admin/devices/:id/status
POST /admin/devices/:id/provision
POST /admin/devices/:id/unbind

GET /admin/meals
GET /admin/meals/:id

GET    /admin/foods
GET    /admin/foods/:id
POST   /admin/foods
PATCH  /admin/foods/:id

GET /admin/recognition-logs
GET /admin/recognition-logs/:id

GET    /admin/dictionaries
POST   /admin/dictionaries
GET    /admin/dictionaries/:code/items
POST   /admin/dictionaries/:code/items
PATCH  /admin/dictionaries/items/:id
DELETE /admin/dictionaries/items/:id

GET    /admin/system/configs
POST   /admin/system/configs
PATCH  /admin/system/configs/:id

GET    /admin/system/admin-users
POST   /admin/system/admin-users
PATCH  /admin/system/admin-users/:id

GET    /admin/system/roles
POST   /admin/system/roles
PUT    /admin/system/roles/:id/permissions

GET /admin/audit-logs
```

# Response Format

所有 HTTP 响应统一：

```ts
interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
  timestamp: number;
  requestId: string;
}
```

# Error Handling

实现：

* BusinessException
* GrpcExceptionMapper
* HttpExceptionFilter
* ResponseInterceptor
* RequestIdMiddleware

# Auth

实现：

* UserJwtGuard
* AdminJwtGuard
* AdminPermissionGuard
* CurrentUser decorator
* CurrentAdmin decorator

# gRPC Client

gateway 只调用：

```txt
base-service
biz-service
```

配置：

```env
BASE_GRPC_URL=localhost:50051
BIZ_GRPC_URL=localhost:50061
```

# Config

加载：

```txt
configs/{env}/shared.env
configs/{env}/gateway.env
```

# 验证

执行：

```bash
pnpm --filter gateway build
pnpm --filter gateway test
```

# 禁止事项

禁止：

* 调用旧 user-service/system-service/storage-service/device-service/diet-service
* 访问数据库
* 访问 raw S3/OSS
* 消费 SQS
* 把业务逻辑写进 gateway

# 输出要求

输出：

1. 新增文件
2. 修改文件
3. HTTP API 列表
4. gRPC client 说明
5. 鉴权说明
6. 验证命令