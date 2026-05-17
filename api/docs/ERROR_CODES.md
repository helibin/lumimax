# ERROR_CODES

统一错误码用于 API `code` 字段，`msg` 基于 `Accept-Language` / `x-lang` 做 i18n 输出（当前支持 `zh-CN`、`en-US`、`ko-KR`）。

翻译文件位于项目根目录：

- `i18n/errors/zh-CN.json`
- `i18n/errors/en-US.json`
- `i18n/errors/ko-KR.json`

## 常见错误返回格式

```json
{
  "code": 40001,
  "msg": "未授权，请先登录",
  "data": null,
  "timestamp": 1760000000000,
  "requestId": "01jvq4w0e29b41d4a716446655",
  "error": {
    "key": "user.noauth",
    "locale": "zh-CN",
    "rawMessage": "Missing bearer token",
    "details": {}
  }
}
```

## 错误码映射

| code | key | 说明 |
| --- | --- | --- |
| 0 | `ok` | 请求处理成功 |
| 40001 | `user.noauth` | 缺少登录态、缺少 user context |
| 40002 | `user.token_invalid` | token 非法、过期或校验失败 |
| 40101 | `auth.invalid_credentials` | 用户名或密码错误 |
| 40003 | `request.invalid_params` | 参数格式不合法或缺少必填项 |
| 40004 | `request.validation_failed` | DTO/class-validator 校验失败 |
| 40301 | `user.forbidden` | 已登录但无权限访问 |
| 40302 | `user.disabled` | 用户状态异常（禁用/冻结） |
| 40401 | `resource.not_found` | 目标资源不存在 |
| 40402 | `user.not_registered` | 用户未注册 |
| 40901 | `resource.conflict` | 资源冲突（如重复创建） |
| 42201 | `request.unprocessable` | 语义正确但业务约束不满足 |
| 42901 | `request.too_many` | 请求频率过高（限流） |
| 42210 | `iot.topic_invalid` | IoT topic / ACL 入参不合法，如 topic 缺失、格式不正确、topic version 不支持 |
| 40310 | `iot.topic_forbidden` | IoT topic 操作不允许，如 topic 与 deviceId 不匹配、publish/subscribe 方向错误 |
| 40410 | `iot.device_not_found` | IoT 设备不存在、未注册或找不到对应记录 |
| 40311 | `iot.device_connection_disabled` | IoT 设备状态禁止连接，如 frozen / retired |
| 40312 | `iot.credential_not_matched` | IoT 证书/credential 与设备绑定关系不匹配 |
| 40313 | `iot.credential_inactive` | IoT 证书/credential 状态未启用 |
| 50000 | `system.internal_error` | 未分类系统内部异常 |
| 50301 | `upstream.unavailable` | 下游服务不可用 |
| 50401 | `upstream.timeout` | 下游服务调用超时 |

## EMQX Auth / ACL 常见拒绝原因

| reason | code | key | 说明 |
| --- | --- | --- | --- |
| `invalid_action` | 42210 | `iot.topic_invalid` | ACL 请求 action 无法识别 |
| `missing_topic` | 42210 | `iot.topic_invalid` | ACL 请求缺少 topic |
| `invalid_topic` | 42210 | `iot.topic_invalid` | topic 结构不符合 `v1/{category}/{deviceId}/{direction}` |
| `unsupported_topic_version` | 42210 | `iot.topic_invalid` | topic version 不支持 |
| `missing_topic_device_id` | 42210 | `iot.topic_invalid` | topic 中缺少 deviceId |
| `unsupported_topic_kind` | 42210 | `iot.topic_invalid` | topic category / direction 组合不支持 |
| `topic_device_id_mismatch` | 40310 | `iot.topic_forbidden` | topic 中 deviceId 与认证设备不一致 |
| `topic_action_not_allowed` | 40310 | `iot.topic_forbidden` | publish / subscribe 与 topic 方向不匹配 |
| `device_limited_to_connect_topics` | 40310 | `iot.topic_forbidden` | 非 fully active 设备只允许 connect 主题 |
| `device_not_found` | 40410 | `iot.device_not_found` | 设备不存在或未注册 |
| `device_connection_disabled` | 40311 | `iot.device_connection_disabled` | 设备被冻结或退役，禁止连接 |
| `credential_not_matched` | 40312 | `iot.credential_not_matched` | 证书或 credential 未匹配到设备 |
| `active_credential_not_found` | 40312 | `iot.credential_not_matched` | 设备没有可用的活动 credential |
| `certificate_fingerprint_mismatch` | 40312 | `iot.credential_not_matched` | 证书指纹与登记记录不一致 |
| `credential_id_mismatch` | 40312 | `iot.credential_not_matched` | credentialId 与登记记录不一致 |
| `credential_inactive` | 40313 | `iot.credential_inactive` | credential 状态不是 active / grace / rotating |

## i18n 规则

- 请求头 `x-lang` / `x-locale` / `accept-language` 命中 `zh` 返回 `zh-CN`。
- 命中 `ko`/`kr` 返回 `ko-KR`。
- 其余场景默认返回英文 `msg`（`en-US`）。
- `error.rawMessage` 保留原始异常信息，便于排查。

## /api/auth/user/login 常见错误

| HTTP | code | key | 触发场景 |
| --- | --- | --- | --- |
| 400 | 40004 | `request.validation_failed` | `username/password` 缺失、类型不对、长度不合法 |
| 404 | 40402 | `user.not_registered` | 用户不存在（未注册） |
| 403 | 40302 | `user.disabled` | 账号状态非 ACTIVE |
| 401 | 40101 | `auth.invalid_credentials` | 密码错误 |

## /api/auth/user/password/forgot/reset 常见错误

| HTTP | code | key | 触发场景 |
| --- | --- | --- | --- |
| 400 | 40004 | `request.validation_failed` | `verifyType/account/verifyCode/newPassword` 格式不合法 |
| 400 | 40003 | `request.invalid_params` | 验证码错误、手机号/邮箱格式错误 |
| 404 | 40402 | `user.not_registered` | 手机号/邮箱对应用户不存在 |
| 403 | 40302 | `user.disabled` | 用户状态非 ACTIVE，禁止重置 |
