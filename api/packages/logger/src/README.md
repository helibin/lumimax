# Logger Module

`libs/logger/src` 提供全仓统一日志能力，基于 `nestjs-pino + pino + pino-pretty + pino-roll`。

## 设计目标

- 使用同一套 `AppLoggerService`，避免业务代码散落 `console.log`
- 开发环境同时支持 console pretty 输出和本地文件输出
- 生产环境只输出 stdout JSON，方便容器采集
- 所有日志自动带 `requestId / traceId`
- 请求进入、Header、响应耗时、异常根因统一记录
- 日志输出前统一脱敏，避免泄露 cookie、token、secret

## 为什么使用 Pino

- `nestjs-pino` 与 Nest 集成成熟，接管 `app.useLogger()` 成本低
- `pino` 性能开销小，适合微服务和高频请求场景
- `pino-pretty` 适合开发环境本地排查
- `pino-roll` 可以在开发环境做按天滚动文件

## 开发环境

- `LOG_TO_CONSOLE=true` 时启用 pretty console
- `LOG_TO_FILE=true` 时启用 `pino-roll`
- 默认按服务名写入 `logs/<service>.log`
- 例如：`logs/gateway.log`、`logs/base-service.log`、`logs/biz-service.log`
- `pino-roll` 按天切割，`frequency=daily`，自动创建目录

常用配置：

- `LOG_LEVEL=debug`
- `LOG_TO_CONSOLE=true`
- `LOG_TO_FILE=true`
- `LOG_DIR=logs`
- `LOG_HEADER_ENABLED=true`
- `LOG_BODY_ENABLED=true`
- `LOG_BODY_MAX_LENGTH=5000`
- `LOG_MAX_FILES=14d`
- `LOG_FORMAT=pretty`

## 生产环境

- 只输出 stdout JSON
- 不写本地文件
- 建议关闭 header/body 调试日志

建议配置：

- `LOG_LEVEL=info`
- `LOG_TO_CONSOLE=true`
- `LOG_TO_FILE=false`
- `LOG_HEADER_ENABLED=false`
- `LOG_BODY_ENABLED=false`
- `LOG_FORMAT=json`

## requestId / traceId

- 优先读取 `x-request-id`
- 如果没有则自动生成
- `traceId` 默认等于 `requestId`
- 响应头会回写 `x-request-id`
- 通过 `AsyncLocalStorage` 保持请求链路上下文

## 请求日志字段

请求进入日志包含：

- `method`
- `url`
- `host`
- `ip`
- `type`
- `query`
- `post`
- `browser`
- `version`
- `os`
- `platform`
- `client`
- `clientIdStr`
- `ua`
- `referer`

## Header / Body 日志开关

- `LOG_HEADER_ENABLED=true` 时打印 Header debug 日志
- `LOG_BODY_ENABLED=true` 时打印请求 body
- 超过 `LOG_BODY_MAX_LENGTH` 会截断
- GET 请求固定输出 `post="{}"`

## 脱敏规则

默认脱敏以下字段：

- `authorization`
- `cookie`
- `set-cookie`
- `password`
- `token`
- `accessToken`
- `refreshToken`
- `secret`
- `secretKey`
- `privateKey`
- `certificatePem`
- `deviceSecret`
- `x-api-key`
- `appKey`
- `appId`
- `apiKey`
- `imageSignedUrl`

## upstream error 排查

异常过滤器会尽量扁平化记录以下信息：

- `requestId`
- `traceId`
- `status`
- `code`
- `message`
- `rootCause`
- `stack`
- `upstream.service`
- `upstream.vendor`
- `upstream.operation`
- `upstream.providerOperation`
- `upstream.awsErrorName`
- `upstream.awsStatusCode`
- `upstream.awsRequestId`
- `upstream.retryable`

不会再输出 `details.details.details` 这种套娃结构。

## 如何关闭 debug / header / body 日志

- 关闭 debug：`LOG_LEVEL=info`
- 关闭 header：`LOG_HEADER_ENABLED=false`
- 关闭 body：`LOG_BODY_ENABLED=false`
