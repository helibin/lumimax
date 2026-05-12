你是 NestJS monorepo 全新重构 Agent。

本阶段目标：

初始化全新目标架构目录和公共包。

目标最终只保留：

```txt
apps/gateway
apps/base-service
apps/biz-service
````

本阶段先不删除旧服务，只创建新结构和公共能力。

# 本阶段任务

## 1. 初始化 libs

创建或整理：

```txt
libs/common
libs/config
libs/database
libs/logger
libs/redis
libs/grpc
libs/mq
libs/storage
```

## 2. common 包

实现：

```txt
libs/common/src/constants
libs/common/src/decorators
libs/common/src/dto
libs/common/src/errors
libs/common/src/filters
libs/common/src/interceptors
libs/common/src/pagination
libs/common/src/request-context
libs/common/src/response
libs/common/src/utils
```

必须包含：

* requestId
* unified response
* pagination
* business error
* error code
* ULID generator
* date helper

## 3. config 包

实现：

```txt
libs/config/src/config.module.ts
libs/config/src/load-env.ts
libs/config/src/validate-env.ts
```

加载规则：

```txt
configs/{env}/shared.env
configs/{env}/{service}.env
```

## 4. database 包

实现：

```txt
libs/database/src/database.module.ts
libs/database/src/base.entity.ts
libs/database/src/naming-strategy.ts
libs/database/src/migration-runner.ts
```

BaseEntity 必须包含：

```txt
id
creatorId
editorId
isDisabled
remark
version
createdAt
updatedAt
deletedAt
```

基础类不保存 requestId。

时间字段统一使用 `Date`，数据库字段统一按 UTC 读写。

## 5. logger 包

实现：

```txt
libs/logger/src/logger.module.ts
libs/logger/src/logger.service.ts
```

要求：

* 日志包含 requestId
* 支持 serviceName
* 支持 JSON 日志

## 6. redis 包

实现：

```txt
libs/redis/src/redis.module.ts
libs/redis/src/redis.service.ts
```

## 7. grpc 包

创建：

```txt
libs/grpc/proto/base.proto
libs/grpc/proto/biz.proto
```

本阶段可以先写 package、health service 和核心 message 占位。

## 8. mq 包

实现：

```txt
libs/mq/src/sqs
libs/mq/src/kafka
libs/mq/src/events
```

SQS 抽象需要支持：

* poll
* delete
* retry
* dlq awareness
* requestId extraction

## 9. storage 包

实现云存储抽象：

```txt
libs/storage/src/storage-provider.interface.ts
libs/storage/src/s3-storage.provider.ts
libs/storage/src/oss-storage.provider.ts
libs/storage/src/object-key-policy.ts
```

注意：

* 不向业务模块暴露 raw client
* 不打印 AK/SK
* 支持 STS / signed URL

## 10. 更新 monorepo 配置

更新：

```txt
pnpm-workspace.yaml
turbo.json
package.json
tsconfig.base.json
```

确保 libs 可被 apps 引用。

# 验证

执行：

```bash
pnpm install
pnpm turbo build
```

# 禁止事项

本阶段禁止：

* 迁移业务代码
* 删除旧 apps
* 改 IoT topic
* 改 meal 字段
* 接入真实 SQS/S3

# 输出要求

输出：

1. 新增文件列表
2. 修改文件列表
3. 公共包说明
4. 验证命令
5. 下一阶段建议
