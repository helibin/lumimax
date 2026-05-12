# Phase 4: Gateway Agent Prompt

## Role

你是 Lumimax 项目的 `gateway` 开发 Agent。

## Goal

实现 `gateway` 作为唯一 HTTP / WebSocket 入口，对接 `base-service` 和 `biz-service`。

## Service Boundary

`gateway` 只负责入口层：

- HTTP API
- WebSocket 连接
- 鉴权拦截
- 请求转发
- 参数聚合
- 限流
- 统一响应
- Swagger 聚合
- requestId 注入
- 访问日志

`gateway` 不允许承载核心业务逻辑。

## Scope

本阶段只修改：

- `apps/gateway`
- gateway 相关 proto client 配置
- gateway DTO / controller / ws gateway / guards / interceptors

不要在 `gateway` 内部直接访问数据库。

不要在 `gateway` 内部直接访问 S3 / OSS SDK。

不要在 `gateway` 内部直接实现设备、饮食、营养分析业务。

## HTTP API Group

请按以下分组设计 Controller：

```text
/auth
/users
/admin/users
/admin/roles
/admin/permissions
/admin/menus
/admin/system-configs
/admin/dictionaries
/admin/notifications
/storage

/devices
/device-bindings
/meals
/nutrition
/iot
/ota
/telemetry
/device-commands
```

## Routing Rules

### base-service 路由

以下 HTTP API 转发到 `base-service`：

- `/auth`
- `/users`
- `/admin/users`
- `/admin/roles`
- `/admin/permissions`
- `/admin/menus`
- `/admin/system-configs`
- `/admin/dictionaries`
- `/admin/notifications`
- `/storage`

### biz-service 路由

以下 HTTP API 转发到 `biz-service`：

- `/devices`
- `/device-bindings`
- `/meals`
- `/nutrition`
- `/iot`
- `/ota`
- `/telemetry`
- `/device-commands`

## Auth

实现：

- JWT Guard
- Public route decorator
- CurrentUser decorator
- requestId 注入
- 将 user context 传给 gRPC metadata 或 request context

`gateway` 只校验 token。

核心用户与权限数据来自 `base-service`。

## WebSocket

`gateway` 承载 WebSocket 连接。

实现：

- WebSocket 鉴权
- userId room
- deviceId room，可选
- tenantId room，可选，MVP 可使用 default
- 心跳 ping / pong
- 连接断开清理
- 接收 `biz-service` realtime event 后推送给前端

注意：

- WebSocket 连接在 `gateway`
- 业务事件由 `biz-service` 产生
- `gateway` 不判断复杂业务

## Realtime Event Integration

请实现一个 `RealtimeEventSubscriber`：

- 订阅 `biz-service` 产生的事件
- 可以先使用 Redis Pub/Sub 或项目已有事件机制
- 根据 event target 推送到对应 WebSocket room

事件示例：

```text
meal.analysis.started
meal.analysis.completed
meal.analysis.failed
device.status.changed
device.command.result
ota.status.changed
```

## Unified Response

所有 HTTP 响应使用项目统一格式：

```json
{
  "code": 0,
  "msg": "ok",
  "data": {},
  "pagination": null,
  "timestamp": 1710000000000,
  "requestId": "xxx"
}
```

分页响应：

```json
{
  "code": 0,
  "msg": "ok",
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 0,
    "totalPages": 0,
    "hasMore": false
  },
  "timestamp": 1710000000000,
  "requestId": "xxx"
}
```

## Swagger

实现或整理 Swagger：

- 支持 Bearer Token
- 按模块分组
- 隐藏内部接口
- 对 Admin API 和 App API 做 tag 区分

## Rate Limit

如果项目已有 Redis rate limit，请复用。

注意处理 Redis NOAUTH / 连接失败日志，不要让限流模块导致 `gateway` 启动失败。

## Validation

完成后执行：

```bash
pnpm --filter @lumimax/gateway build
pnpm --filter @lumimax/gateway test
```

如果包名不同，请先查看 package.json 后使用正确包名。

## Output

请输出：

1. 修改文件列表
2. HTTP 路由清单
3. WebSocket 事件清单
4. gRPC client 对接说明
5. 鉴权流程说明
6. 统一响应说明
7. 已执行命令
8. 验证结果
9. 未完成事项
