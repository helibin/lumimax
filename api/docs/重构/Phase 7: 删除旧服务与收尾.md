# Phase 7: 删除旧服务与收尾

状态：已完成

## 1. 阶段结果

最终默认架构已收敛为：

```txt
apps/gateway
apps/base-service
apps/biz-service
```

`realtime-service` 已从仓库内 app 删除，`/ws` 能力也已随之下线。

## 2. 已删除 apps

已删除：

```txt
apps/user-service
apps/notification-service
apps/system-service
apps/storage-service
apps/device-service
apps/iot-bridge-service
apps/diet-service
apps/realtime-service
```

## 3. 配置与脚本收尾

已完成：

- 默认 `package.json` scripts 收敛到 `gateway` / `base-service` / `biz-service`
- `docker-compose.yml` 默认只编排核心三服务与基础设施
- 旧服务 `.env.example` 已删除
- `configs/development/archive/` 保留历史 env 以便回放
- `pnpm-lock.yaml` 应按当前 workspace 重新生成
- 默认文档与 README 已切到三服务架构

## 4. 当前目录

当前 `apps` 目录：

```txt
apps/base-service
apps/biz-service
apps/gateway
```

当前 development 配置：

```txt
configs/development/shared.env
configs/development/gateway.env
configs/development/base-service.env
configs/development/biz-service.env
configs/development/archive/*
```

## 5. 最终启动命令

默认启动：

```bash
pnpm dev
```

分别启动：

```bash
pnpm dev:gateway
pnpm dev:base
pnpm dev:biz
```

默认构建：

```bash
pnpm build:platform
pnpm build:full
```

## 6. 最终验证命令

本阶段已完成的关键验证：

```bash
pnpm build:platform
pnpm build:full
pnpm install --lockfile-only
```

说明：

- `build:platform` 已在删除旧服务批次后多次通过
- `build:full` 已在最终三服务目录下通过
- Turbo build 输出 warning 已清理

## 7. 保留项

保留但不删除：

- `configs/development/archive/`
- migration / seed 历史记录
- IoT topic / storage 安全相关文档
- `data/docs/重构/*` 等历史阶段文档

## 8. 下一阶段建议

Phase 7 已达到默认运行面收尾目标，后续应转入：

1. 功能联调与端到端验证
2. 网关 / Web / Admin 继续对接新三服务接口
3. 非重构历史文档按需要渐进清理
