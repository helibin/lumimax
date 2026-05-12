# Phase 0: Master Planning Agent Prompt

## Role

你是 Lumimax 项目的主控架构 Agent。

## Task

请先阅读当前 monorepo，不要修改任何代码。

重点查看：

- `package.json`
- `pnpm-workspace.yaml`
- `turbo.json`
- `apps/`
- `packages/`
- `packages/common`
- `packages/proto`
- `packages/config`
- `packages/logger`
- `packages/database`
- `packages/redis`
- 当前已有 `gateway` / `base-service` / `biz-service` 或其他服务结构

## Architecture Context

当前项目最终只保留 3 个服务：

1. `gateway`
2. `base-service`
3. `biz-service`

`gateway` 只负责 HTTP / WebSocket 入口。

`base-service` 包含基础能力：

- auth
- 系统配置
- 用户
- 角色
- 权限
- 菜单
- 通知
- 存储
- 字典
- 审计日志

`biz-service` 包含业务能力：

- 设备管理
- IoT 桥接
- 营养分析
- 饮食记录
- 实时事件
- OTA
- 遥测
- 设备命令

## Requirements

本阶段只做分析和计划，不要写代码。

请输出：

1. 当前项目结构分析
2. 已存在服务列表
3. 哪些服务需要保留
4. 哪些服务需要合并到 `base-service`
5. 哪些服务需要合并到 `biz-service`
6. `packages` 当前可复用能力分析
7. `proto` 当前结构分析
8. 推荐的最终目录结构
9. 分 Agent 并行开发计划
10. 每个 Agent 的任务边界
11. 阶段性验收标准
12. 风险点
13. 第一轮应该让哪个 Agent 先开始执行

## Important

- 不要修改代码
- 不要删除文件
- 不要重构
- 只输出计划
