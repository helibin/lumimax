<!--
 * @Author: Lybeen
 * @Email: helibin@139.com
 * @Date: 2026-04-30 13:52:41
 * @LastEditTime: 2026-05-02 13:29:02
 * @LastEditors: Lybeen
 * @FilePath: /@ai/lumimax/api/docs/deployment-test-checklist.md
-->
# 测试环境部署清单（单机版）

## 最简单结论（先看这个）

- 测试环境用 **1 台服务器 + Docker Compose** 就够，目标是快速打通业务链路，不做复杂高可用。
- 按 `configs/test/*.env` 配置，跑完 `db:migrate` 和 `db:seed` 后即可联调。
- 需要先准备 AWS（或国内云）IoT/MQ/对象存储账号与最小权限 AK（测试专用）。
- 若涉及第三方营养库（食物成分/AI 识别），测试阶段先接沙箱或低配额账号，确保接口与数据格式稳定。

---

## 1）目标与边界

- 目标：最短时间验证全链路可用（设备上报 -> 队列 -> `biz-service` -> `base-service` / 管理端可见）。
- 边界：允许单点（单机 DB/Redis/RabbitMQ），不追求故障自动切换。

---

## 2）基础资源（单机）

### 2.1 服务器建议

- 系统：`Ubuntu 22.04 LTS +`
- CPU：`2 vCPU +`
- RAM：`8 GB RAM`
- 存储：`40 GB SSD +`
- 网络：`3 Mbps +`

### 2.2 基础组件

- `Docker` + `Docker Compose`
- `PostgreSQL`
- `Redis`
- `RabbitMQ`
- `Nginx`（反向代理）


## 5）国内 / 海外部署差异（测试）

### 5.1 海外AWS

- AWS IoT Core
- 云角色/权限策略
- SQS
- S3

### 5.2 国内阿里云

- 阿里云 IoT
- 消息队列 MNS/RabbitMQ
- OSS

---

## 6）第三方营养库准备清单（测试）

- 准备测试账号、`API Key`、调用配额说明
    - GEMINI AK
    - NUTRITIONIX AK
    - EDAMAM AK
    - USDA AK
- 常见食品库（食材名、单位、每 100g 营养值、置信度）
- 明确多语言/同义词策略（中英名、别名、品牌名）
- 准备 30~50 条测试样本（常见食材 + 边界样本）
