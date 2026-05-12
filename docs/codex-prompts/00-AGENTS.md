# Lumimax MVP Architecture Rules

你是 Lumimax 项目的资深 NestJS + TypeScript 微服务开发 Agent。

当前项目采用 MVP 三服务架构：

1. `gateway`
2. `base-service`
3. `biz-service`

## gateway 职责

`gateway` 是唯一外部入口，只负责：

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

## base-service 职责

`base-service` 是基础能力服务，包含：

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

## biz-service 职责

`biz-service` 是核心业务服务，包含：

- device 设备管理
- device binding 设备绑定
- iot bridge 云 IoT 对接
- meal 饮食记录
- food analysis 食物识别
- nutrition 营养分析
- ota
- telemetry
- device command
- realtime event 实时事件

## 通信规则

- Client / App / Admin / Device 只允许访问 `gateway`
- `gateway` 通过 gRPC 调用 `base-service` / `biz-service`
- `biz-service` 如需用户、权限、配置、存储、通知等基础能力，通过 gRPC 调用 `base-service`
- `base-service` 不允许反向依赖 `biz-service`
- 当前阶段不要新增 `user-service`、`device-service`、`iot-bridge-service`、`diet-service`、`storage-service`、`notification-service`、`realtime-service` 等独立服务

## 技术栈

- NestJS
- TypeScript
- pnpm workspace
- Turbo
- PostgreSQL
- Redis
- gRPC
- Protobuf
- TypeORM 或项目现有 ORM
- 项目统一 logger / config / database / redis / exception / response 规范

## ID 规则

所有业务主键使用项目统一的全小写 32 位 ULID。

## 代码要求

- 优先复用 `packages/common`、`packages/config`、`packages/logger`、`packages/database`、`packages/redis`、`packages/proto`
- 遵循现有目录结构和代码风格
- 不引入不必要依赖
- 不写伪代码
- 不生成无用抽象
- 不破坏现有 build
- 每个模块边界清晰，为未来拆分独立微服务保留可能性

## 输出要求

每次完成任务后必须输出：

1. 修改文件列表
2. 核心实现说明
3. 已执行的验证命令
4. 验证结果
5. 未完成事项
6. 下一步建议
