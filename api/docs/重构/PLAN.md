<!--
 * @Author: Lybeen
 * @Email: helibin@139.com
 * @Date: 2026-04-30 16:45:55
 * @LastEditTime: 2026-04-30 19:14:28
 * @LastEditors: Lybeen
 * @FilePath: /@ai/lumimax/api/data/docs/重构/0.md
-->

你是资深后端架构师、NestJS Monorepo 重构专家、全新系统重构智能调度 Agent。

当前任务不是兼容式迁移，而是基于现有 monorepo 进行全新重构。

目标是将当前多个服务重构为：

gateway
base-service
biz-service

# Tech Stack

项目技术栈：

* NestJS
* TypeScript
* pnpm
* turbo
* gRPC
* PostgreSQL
* Redis
* SQS / MQ
* AWS IoT Core
* S3 / OSS

# Target Architecture

## gateway

职责：

* 唯一外部 HTTP 入口
* 用户端 API
* 管理端 API
* 设备端 API，如有 HTTP 入口
* 鉴权
* 参数校验
* BFF / 聚合
* requestId 注入
* 统一响应格式
* 调用 base-service / biz-service gRPC

不负责：

* 不直接访问数据库
* 不写复杂业务逻辑
* 不直接连接 S3/OSS
* 不直接处理 SQS consumer

## base-service

合并基础平台能力：

user
auth
admin
role
permission
dictionary
system-config
audit-log
notification
storage

来源服务：

user-service
system-service
notification-service
storage-service

base-service 负责：

* C端/B端用户
* 用户认证
* 后台管理员
* 角色权限
* 字典中心
* 系统配置
* 审计日志
* 通知
* 通知模板
* S3/OSS 上传签名
* objectKey 校验
* 文件对象确认
* 临时文件/正式文件管理

## biz-service

合并核心业务能力：

device
iot
diet
realtime

来源服务：

device-service
iot-bridge-service
diet-service
realtime-service

biz-service 负责：

* 设备管理
* 设备绑定
* 设备状态
* AWS IoT / Aliyun IoT 对接
* SQS consumer
* 设备上下行消息
* meal record
* food item
* 食品识别
* 营养分析
* 食品数据库
* 识别日志
* WebSocket / realtime，如存在

# Important Rules

这是全新重构版本，因此：

1. 不需要兼容旧 gRPC proto。
2. 不需要兼容旧服务内部模块路径。
3. 不需要保留旧 service selector。
4. 不需要做 feature flag 切流。
5. 不需要双写。
6. 不需要影子读。
7. 可以删除或废弃旧 apps，但要先生成新架构。
8. 可以重新设计 proto。
9. 可以重新整理模块目录。
10. 可以重新整理配置文件。
11. 可以重新整理 migration，但不能修改已经应用到生产的 migration；如果当前还没上线，可重建 migration。

# Hard Constraints

即使是全新重构，也必须遵守：

1. gateway 对外 HTTP API 要重新设计得清晰，但必须统一风格。
2. 所有 HTTP 响应统一格式。
3. IoT 主链路必须是：

```txt
AWS IoT Core -> SQS -> biz-service consumer
```

4. 称重图片模型必须是单图字段：

```txt
imageKey
imageObjectId
image_object_id
```

禁止：

```txt
images[]
imageKeys[]
imageObjectIds[]
```

5. meal 核心流程必须是：

```txt
CreateMealRecord -> AnalyzeFoodItem 多次 -> FinishMealRecord
```

6. storage 模块即使并入 base-service，也必须保持安全边界。
7. storage 不允许向其他模块暴露 AK/SK/raw S3 client/raw OSS client。
8. 所有 ID 使用项目统一 ULID。
9. 时间字段使用 timestamptz。
10. 所有写操作要支持 requestId 和审计日志。
11. 配置按环境目录加载：

```txt
configs/{env}/shared.env
configs/{env}/gateway.env
configs/{env}/base-service.env
configs/{env}/biz-service.env
```

# Desired Final Structure

```txt
apps/
├─ gateway/
├─ base-service/
└─ biz-service/

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

# Execution Phases

请按以下阶段执行：

```txt
Phase 0: 全量扫描与重构设计
Phase 1: 清理目标目录与公共包规划
Phase 2: gateway 重建
Phase 3: base-service 重建
Phase 4: biz-service 重建
Phase 5: gRPC contract 重建
Phase 6: 数据库实体与 migration 重建
Phase 7: IoT queue consumer 重建
Phase 8: storage 安全模块重建
Phase 9: diet 主链路重建
Phase 11: 测试、构建、启动脚本
Phase 12: 删除旧服务与收尾
```

## 当前进度

截至 2026-04-30：

- 默认运行架构已收敛为 `gateway` + `base-service` + `biz-service`
- 旧拆分服务目录已删除
- 默认 scripts / compose / configs / docs / lockfile 已收尾
- “删除旧服务与收尾”阶段已完成，详见：
  - `data/docs/重构/Phase 7: 删除旧服务与收尾.md`
- `web/apps/admin` 已完成新 gateway 对接的核心 API 兼容收口
- 已补充下一阶段 smoke 入口，详见：
  - `data/docs/重构/Phase 8: 集成联调与 Smoke.md`

# Agent Behavior

每个阶段必须：

1. 先扫描现有项目。
2. 判断可复用代码。
3. 输出本阶段计划。
4. 再执行修改。
5. 输出新增/修改/删除文件列表。
6. 输出验证命令。
7. 输出下一阶段建议。

# Output Format Per Phase

# First Task

现在执行 Phase 0。

本阶段只做扫描和设计，不大量改代码。

请输出：

1. 当前 apps 结构
2. 当前 libs 结构
3. 当前服务职责判断
4. 可复用模块
5. 建议删除模块
6. 新架构目录设计
7. 新 gRPC 契约设计草案
8. 新数据库模块设计草案
9. 新配置文件设计草案
10. 重构执行顺序
