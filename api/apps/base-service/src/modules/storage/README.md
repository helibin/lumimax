# Storage Module

`apps/base-service/src/modules/storage`

这个模块负责统一对象存储接入，对上层暴露通用接口，对下层兼容 `aws`、`aliyun`、`cos`、`minio`。

当前能力主要覆盖：

- 临时上传凭证 / 预签名上传 URL
- 上传完成确认
- 临时对象校验
- 临时对象转正式对象
- 签名读 URL

## Provider / Vendor 约定

对外统一使用：

- `aws`
- `aliyun`
- `cos`
- `minio`

内部 provider 映射：

- `aws` -> `s3`
- `cos` -> `s3`
- `minio` -> `s3`
- `aliyun` -> `oss`

兼容旧值：

- `s3`
- `oss`
- `aws-s3`
- `aliyun-oss`
- `aly`

## 对外 HTTP 接口

网关入口在 [apps/gateway/src/modules/storage/storage.controller.ts](/Volumes/dev/workspace/@ai/lumimax/api/apps/gateway/src/modules/storage/storage.controller.ts:1)。

### 1. `POST /api/storage/upload-token`

用途：

- 创建临时上传授权
- 默认返回 `presigned_put` 方式的上传地址

请求体常用字段：

```json
{
  "filename": "meal.jpg",
  "mode": "presigned-url",
  "maxBytes": 5242880,
  "fileType": "image/jpeg",
  "deviceId": "01kdevice...",
  "ownerType": "device"
}
```

说明：

- `mode` 可选：`presigned-url` / `credentials`
- 设备上传场景默认走 `presigned-url`；调用方显式传 `mode=credentials` 时走 STS 临时凭证
- `fileType` 推荐单值 MIME
- `maxBytes` 未传时默认 `1048576`（1MB）
- 对外协议不再推荐 `fileTypes`，统一使用单值 `fileType`

响应关键字段：

```json
{
  "requestId": "01...",
  "provider": "aws",
  "bucket": "bucket-name",
  "region": "us-west-2",
  "objectKey": "tmp-file/device/01.../upload_01....jpg",
  "mode": "presigned-url",
  "uploadMode": "presigned_put",
  "uploadUrl": "https://...",
  "expiresAt": 1710003800000,
  "method": "PUT",
  "headers": {
    "Content-Type": "image/jpeg"
  },
  "maxFileSize": 5242880
}
```

### 2. `POST /api/storage/objects/confirm`

用途：

- 客户端上传完成后确认对象状态

请求体常用字段：

```json
{
  "objectKey": "tmp-file/device/01.../upload_01....jpg",
  "provider": "aws",
  "bucket": "bucket-name",
  "region": "us-west-2"
}
```

响应关键字段：

```json
{
  "ok": true,
  "requestId": "01...",
  "objectKey": "tmp-file/device/01.../upload_01....jpg",
  "provider": "aws",
  "bucket": "bucket-name",
  "region": "us-west-2",
  "status": "confirmed"
}
```

## 内部 gRPC / Facade 接口

gRPC controller 在 [storage-facade.grpc.controller.ts](/Volumes/dev/workspace/@ai/lumimax/api/apps/base-service/src/modules/storage/storage-facade.grpc.controller.ts:1)，统一方法是：

- service: `BaseStorageFacadeService`
- method: `Execute`

由 [storage-facade.service.ts](/Volumes/dev/workspace/@ai/lumimax/api/apps/base-service/src/modules/storage/storage-facade.service.ts:1) 根据 `operation` 路由到具体逻辑。

### 支持的 operation

#### 1. `storage.createTemporaryUploadCredential`

兼容别名：

- `storage.objects.createUploadToken`
- `storage.objects.createTemporaryUploadCredential`

请求字段：

- `tenantId?`
- `deviceId?`
- `userId?`
- `mode?`
- `filename?`
- `maxBytes?`
- `maxFileSize?`
- `fileType?`
- `allowedMimeTypes?`
- `fileTypes?`

实际逻辑：

- `maxBytes` 和 `maxFileSize` 二选一，优先取 `maxBytes`
- `fileType` 会转换成单元素 `allowedMimeTypes`
- 默认最大上传大小 1MB
- 对外新协议建议只传 `maxBytes + fileType`

## 设备 IoT 协议补充

设备侧如果通过 IoT 请求上传凭证，建议在协议 `meta` 中带上 `lang`，用于后续多语言业务链路统一透传：

```json
{
  "meta": {
    "requestId": "01jvq0wfq3k6n9r2t8x4y1zhj4",
    "deviceId": "01kqmqpdwmqaf792yjwy5hm6s6",
    "timestamp": 1710000200000,
    "event": "upload.token.request",
    "version": "1.0",
    "lang": "zh-CN"
  },
  "data": {
    "purpose": "weighing-image",
    "fileType": "image/jpeg",
    "maxBytes": 5242880
  }
}
```

说明：

- `upload.token.request` 会显式使用 `mode=credentials`，返回 STS 临时凭证
- `upload.url.request` 会显式使用 `mode=presigned-url`，返回一次性预签名 URL
- `lang` 未传时默认 `zh-CN`
- 当前建议值例如：`zh-CN`、`en-US`
- 后续图片识别、营养分析等链路会优先参考该语言

#### 2. `storage.validateObjectKeys`

兼容别名：

- `storage.objects.validate`

请求字段：

- `objectKey`
- `userId?`
- `deviceId?`

用途：

- 校验 objectKey 是否安全
- 校验是否属于当前 user/device 作用域

#### 3. `storage.confirmUploadedObjects`

兼容别名：

- `storage.objects.confirm`

请求字段：

- `tenantId?`
- `objectKey`
- `provider?`
- `bucket?`
- `region?`
- `userId?`
- `deviceId?`

用途：

- 将对象状态从 `pending` 标记为 `confirmed`

#### 4. `storage.promoteObjectKey`

请求字段：

- `tenantId?`
- `sourceObjectKey?`
- `imageKey?`
- `userId?`
- `deviceId?`
- `bizId?`
- `mealRecordId?`
- `bizType?`
- `mediaType?`

用途：

- 把 `tmp-file/...` 下的临时对象复制/转正到业务正式路径
- 常用于饮食图片等业务入库

#### 5. `storage.createSignedReadUrl`

兼容别名：

- `storage.objects.createSignedReadUrl`

请求字段：

- `objectKey`
- `ttlSeconds?`

用途：

- 生成带时效的下载 / 预览 URL

## 典型流程

### 设备上传图片

1. 调 `storage.objects.createUploadToken`
2. 设备按返回的 `uploadUrl + method + headers` 上传
3. 上传成功后调 `storage.objects.confirm`
4. 后续业务调 `storage.promoteObjectKey` 转正式路径

### 业务读取图片

1. 持有正式 `objectKey`
2. 调 `storage.createSignedReadUrl`
3. 返回短时效读地址

## 存储模式差异

### AWS

- 支持 `presigned-url`
- 支持 `credentials`（STS）

### Aliyun

- 支持 `presigned-url`
- 支持 `credentials`
- `credentials` 优先走阿里云 STS `AssumeRole`
- 若未配置 `STORAGE_STS_ROLE_ARN`，可兼容使用静态 `STORAGE_STS_TOKEN`
- 支持自定义 `STORAGE_ENDPOINT`
- 当 `STORAGE_ENDPOINT` 为 `http://...` 时会自动使用非 HTTPS 模式

推荐配置：

```env
STORAGE_VENDOR=aliyun
STORAGE_BUCKET=your-bucket
STORAGE_REGION=oss-cn-hangzhou
STORAGE_ACCESS_KEY_ID=your-ak
STORAGE_ACCESS_KEY_SECRET=your-sk
# 推荐：真实 STS AssumeRole
# STORAGE_STS_ROLE_ARN=acs:ram::1234567890123456:role/demo-role
# STORAGE_STS_EXTERNAL_ID=demo-external-id
# STORAGE_STS_ENDPOINT=https://sts.cn-hangzhou.aliyuncs.com
# 可选：内网 / 专有 endpoint
# STORAGE_ENDPOINT=http://oss-cn-hangzhou-internal.aliyuncs.com
# 兼容：直接提供临时凭证
# STORAGE_STS_TOKEN=your-sts-token
```

### MinIO

- 支持 `presigned-url`
- 不支持 `credentials`
- 一般需要：
  - `STORAGE_ENDPOINT`
  - `STORAGE_ACCESS_KEY_ID`
  - `STORAGE_ACCESS_KEY_SECRET`
  - `STORAGE_FORCE_PATH_STYLE=true`

推荐配置：

```env
STORAGE_VENDOR=minio
STORAGE_BUCKET=your-bucket
STORAGE_REGION=us-east-1
STORAGE_ENDPOINT=http://127.0.0.1:9000
STORAGE_ACCESS_KEY_ID=minioadmin
STORAGE_ACCESS_KEY_SECRET=minioadmin
STORAGE_FORCE_PATH_STYLE=true
```

## 关键环境变量

- `STORAGE_VENDOR=aws|aliyun|cos|minio`
- `STORAGE_BUCKET`
- `STORAGE_REGION`
- `STORAGE_PUBLIC_BASE_URL`
- `STORAGE_UPLOAD_TTL_SECONDS`
- `STORAGE_READ_TTL_SECONDS`
- `STORAGE_UPLOAD_DEFAULT_MAX_BYTES`
- `STORAGE_ACCESS_KEY_ID`
- `STORAGE_ACCESS_KEY_SECRET`
- `STORAGE_STS_TOKEN`
- `STORAGE_STS_ROLE_ARN`
- `STORAGE_STS_EXTERNAL_ID`
- `STORAGE_STS_ENDPOINT`
- `STORAGE_ENDPOINT`
- `STORAGE_FORCE_PATH_STYLE`
- `STORAGE_SECURE`

## 代码入口

- HTTP gateway: [apps/gateway/src/modules/storage/storage.controller.ts](/Volumes/dev/workspace/@ai/lumimax/api/apps/gateway/src/modules/storage/storage.controller.ts:1)
- gRPC facade: [storage-facade.grpc.controller.ts](/Volumes/dev/workspace/@ai/lumimax/api/apps/base-service/src/modules/storage/storage-facade.grpc.controller.ts:1)
- facade 路由: [storage-facade.service.ts](/Volumes/dev/workspace/@ai/lumimax/api/apps/base-service/src/modules/storage/storage-facade.service.ts:1)
- 核心实现: [storage.service.ts](/Volumes/dev/workspace/@ai/lumimax/api/apps/base-service/src/modules/storage/storage.service.ts:1)
