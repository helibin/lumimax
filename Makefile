# Lumimax monorepo Makefile
# 顶层快捷命令；不进行 pnpm install 合并，避免 api/ 与 web/ 的 catalog 冲突。

SHELL := /bin/bash

.PHONY: help install dev dev-api dev-admin dev-www \
	build build-api build-admin build-www \
	db-setup db-migrate db-seed \
	docker-build docker-run compose-up compose-down compose-logs compose-shell \
	clean clean-deep

help: ## 显示所有命令
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## 分别在 api/ 与 web/ 子项目执行 pnpm install
	pnpm --dir api install
	pnpm --dir web install
i: ## 分别在 api/ 与 web/ 子项目执行 pnpm install
	pnpm --dir api install
	pnpm --dir web install

# ===================== 开发 =====================

dev: dev-api dev-admin ## 默认开发 = 拉起后端四服务（gateway/base/biz/iot）

dev-api: ## 同时启动 gateway / base-service / biz-service / iot-service（watch）
	pnpm --dir api dev

dev-admin: ## 启动 admin 前端
	pnpm --dir web --filter @lumimax/admin dev

dev-www: ## 启动 www 前端
	pnpm --dir web --filter @lumimax/www dev

# ===================== 构建 =====================

build: build-api build-admin build-www ## 串行构建后端 + 两个前端

build-api: ## 构建 gateway/base/biz/iot
	pnpm --dir api build

build-admin: ## 构建 admin 静态
	pnpm --dir web build:admin

build-www: ## 构建 www 静态
	pnpm --dir web build:www

# ===================== 数据库 =====================

db-setup: ## 自动建库 + migrate + seed（开发环境）
	pnpm --dir api db:setup

db-migrate: ## 仅执行 migration
	pnpm --dir api db:migrate

db-seed: ## 仅执行 seed
	pnpm --dir api db:seed

# ===================== 单镜像 Docker（lumimax:latest）=====================

docker-build: ## 构建单镜像（nginx + 4 个 NestJS + admin/www 静态）
	docker build -f docker/Dockerfile -t lumimax:latest .

docker-run: ## 单容器启动（需自备 .env，模板见 docker/.env.example；不含 postgres/redis/rabbitmq）
	docker run --rm -p 8080:80 \
		--env-file .env \
		--name lumimax \
		lumimax:latest

compose-up: ## compose 拉起业务镜像 + postgres + redis + rabbitmq + emqx
	docker compose -f compose.stack.yml up -d --build

compose-down: ## 关闭 compose.stack.yml 栈
	docker compose -f compose.stack.yml down

compose-logs: ## 查看 compose 日志
	docker compose -f compose.stack.yml logs -f

compose-shell: ## 进入业务容器排查
	docker compose -f compose.stack.yml exec lumimax sh

# ===================== 清理 =====================

clean: ## 清掉构建产物（不删 node_modules）
	rm -rf api/dist web/apps/*/dist web/internal/*/dist web/packages/*/dist

clean-deep: clean ## 清掉所有 node_modules + lock 缓存（慎用）
	find . -name "node_modules" -type d -prune -exec rm -rf {} +
	find . -name ".turbo" -type d -prune -exec rm -rf {} +
