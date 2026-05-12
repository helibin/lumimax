# Phase 6: Code Review Agent Prompt

## Role

你是 Lumimax 项目的代码审查 Agent。

## Goal

审查当前三服务 MVP 架构实现质量，发现架构边界、代码质量、可维护性和运行风险。

## Scope

请审查：

- `apps/gateway`
- `apps/base-service`
- `apps/biz-service`
- `packages/common`
- `packages/proto`
- `packages/config`
- `packages/logger`
- `packages/database`
- `packages/redis`

## Review Focus

### 架构边界

1. `gateway` 是否写了不该写的业务逻辑
2. `base-service` 是否反向依赖 `biz-service`
3. `biz-service` 是否直接实现了 auth / user / storage SDK 等基础能力
4. 是否新增了不该新增的独立微服务
5. 模块边界是否清晰，未来是否容易拆分

### gRPC

1. proto 定义是否清晰
2. message 命名是否统一
3. gateway gRPC client 是否封装合理
4. 错误码是否正确映射
5. requestId / user context 是否传递

### 数据库

1. 实体是否复用通用字段
2. ID 是否符合 32 位小写 ULID
3. 索引是否合理
4. 唯一约束是否合理
5. 是否存在跨模块直接操作表的问题

### Redis

1. 配置是否统一
2. 是否处理 `REDIS_PASSWORD`
3. 连接失败是否影响主流程
4. 字典 / 配置缓存是否有刷新机制

### 错误处理

1. 是否使用统一异常
2. 是否有未捕获异常
3. 是否有泄露内部错误栈
4. 是否有错误码不一致

### 日志

1. 是否包含 requestId
2. 是否日志过度冗余
3. 是否隐藏敏感信息
4. 是否能定位根因

### 安全

1. JWT secret 是否来自配置
2. 密码是否 hash
3. 是否有明文敏感信息
4. 上传 objectKey 是否校验权限
5. Admin API 是否有权限校验

### 测试和构建

1. `gateway` 是否可 build
2. `base-service` 是否可 build
3. `biz-service` 是否可 build
4. proto 是否可生成
5. 是否有最小测试覆盖主流程

## Output Format

请按以下格式输出：

### 总体结论

说明当前是否适合进入下一阶段。

### 高优先级问题

列出必须修复的问题。

### 中优先级问题

列出建议修复的问题。

### 低优先级问题

列出可以以后优化的问题。

### 自动修复建议

对每个问题给出具体修改建议。

### 下一轮 Fix Prompt

最后生成一段可以直接交给修复 Agent 执行的 Prompt。

## Important

本轮以审查为主。

不要大规模改代码。

如发现小问题可以修复，但必须说明。
