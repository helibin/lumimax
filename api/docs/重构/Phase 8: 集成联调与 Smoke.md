<!--
 * @Author: Codex
 * @Date: 2026-04-30
 * @FilePath: /@ai/lumimax/api/data/docs/重构/Phase 8: 集成联调与 Smoke.md
-->

# Phase 8: 集成联调与 Smoke

## 目标

在 `gateway + base-service + biz-service` 三服务默认架构下，建立最小可重复执行的联调检查入口，优先验证：

- `gateway` / `base-service` / `biz-service` 健康状态
- gateway 文档聚合与服务摘要
- admin 鉴权链路
- admin 核心列表接口

## 当前结论

截至 2026-04-30：

- `web/apps/admin` 对接层已完成核心兼容收口
- `pnpm --filter @lumimax/admin typecheck` 通过
- `pnpm build:platform` 通过
- 当前宿主机 `127.0.0.1:5432` / `6379` / `5672` 不可达
- 当前会话尝试执行 `docker compose up -d ...` 时失败，原因是 Docker daemon 未运行

因此，本阶段代码侧先补齐 smoke 脚本，待基础设施可用后即可直接执行联调。

## 已补充脚本

新增：

```bash
pnpm smoke:admin
pnpm smoke:ready
```

对应文件：

```txt
scripts/smoke/admin-gateway.mjs
```

### 脚本默认检查

无需管理员账号时，检查：

- `GET /health`
- `GET /system/services`
- `GET /docs/services`

### 可选管理员检查

当设置以下环境变量后，脚本继续执行：

```env
SMOKE_ADMIN_USERNAME=admin
SMOKE_ADMIN_PASSWORD_MD5=e10adc3949ba59abbe56e057f20f883e
```

会额外检查：

- `POST /admin/auth/login`
- `GET /admin/auth/me`
- `GET /admin/system/roles`
- `GET /admin/system/admin-users`
- `GET /admin/devices`
- `GET /admin/notifications`
- `GET /admin/templates`
- `GET /admin/device-tokens`

## 推荐执行顺序

## 默认开发管理员

已补充 seed：

```txt
data/db/seeds/20260503101000_init_platform_seed.sql
```

执行 `pnpm db:seed` 后，默认可用于联调的管理员账号为：

```txt
username: admin
password: 123456
password-md5: e10adc3949ba59abbe56e057f20f883e
role: super_admin
```

### 方案 A：宿主机直连

前提：

- 本机已启动 PostgreSQL / Redis / RabbitMQ
- 端口与 `configs/development/*.env` 保持一致

执行：

```bash
pnpm infra:up
pnpm dev:platform
pnpm smoke:ready
```

### 方案 B：Docker 内联调

前提：

- Docker daemon 已启动

执行：

```bash
pnpm infra:platform:up
docker compose exec gateway node scripts/smoke/admin-gateway.mjs
```

如果容器内需要管理员登录检查，可在 `exec` 时追加环境变量。

## 下一步

当 Docker 或宿主机基础设施可用后，优先做以下真实联调：

1. 健康检查与 docs 聚合
2. admin 登录与 `me`
3. 设备列表 / 详情 / 指令 / OTA
4. 通知消息 / 模板 / device token
5. 系统管理：管理员、角色、权限、字典、配置

如果 smoke 通过，再进入页面级人工验收。
