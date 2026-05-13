# 自建 Drone 接入说明

本文说明如何在 **自建 Drone Server**（含 **docker runner**）上跑本仓库根目录的 [`.drone.yml`](../.drone.yml)，并与根目录 [`.github/workflows/`](../.github/workflows/) **并存**。

---

## 1. 流水线做什么

| Pipeline | 触发 | 步骤 |
| --- | --- | --- |
| `ci-api` | `push` / `pull_request`，分支 `main`、`master`、`develop` | `api`：install → `arch:check` → `lint` → `build`；成功/失败 **飞书 webhook**（`FEISHU_WEBHOOK`） |
| `ci-web` | 同上 | `web`：install → `build:admin` + `build:www`；成功/失败飞书通知 |
| `docker-lumimax` | `push` / `tag`，且 ref 为上述分支或 `refs/tags/v*` | `plugins/docker` 构建 `docker/Dockerfile` 并推送；成功/失败飞书通知 |

`docker-lumimax` 的 **ref 不包含** `refs/pull/*`，因此 **不会在 PR 上打镜像**（与根目录 `.github/workflows/docker.yml` 的语义接近）。

与 [`api/.drone.yml`](../api/.drone.yml) 对齐的优化：**`depends_on`** 串联构建与通知；**`plugins/webhook` + `when: status`** 区分成功/失败模板；可在文件头注释将 `plugins/docker` / `plugins/webhook` 换为自建镜像加速（与 api 中 `ccr.ccs.tencentyun.com/ovlb/plugins.*` 一致）。

---

## 2. 在 Drone 里启用仓库

1. Drone 与 GitHub 做 OAuth 集成（见 [Drone GitHub](https://docs.drone.io/server/provider/github/)）。
2. 在 Drone UI 中 **Activate** 本仓库，Drone 会读根目录 **`.drone.yml`**。
3. 默认 **amd64**；若 runner 只有 arm64，请把各 pipeline 里的 `platform.arch` 改为 `arm64`（或拆多架构 pipeline）。

### Drone `plugins.docker` / `registry-1.docker.io` 超时

日志里 **`Get "https://registry-1.docker.io/v2/" ... Client.Timeout`** 多半是 BuildKit 在解析 Dockerfile 首行 **`# syntax=docker/dockerfile:...`** 时，要从 **Docker Hub** 拉取 **Dockerfile 前端镜像**（与 `FROM` 是否用自建镜像无关）。

本仓库已将 **`api/Dockerfile`**、**`web/Dockerfile`**、**`docker/Dockerfile`** 的 syntax 改为经 **DaoCloud 镜像代理** 拉取，例如：

`# syntax=docker.m.daocloud.io/docker/dockerfile:1.7` / `1.18-labs`

若你环境 **DaoCloud 也不可达**，可任选其一：

- 在 **Drone runner 宿主机** `/etc/docker/daemon.json` 配置 **`registry-mirrors`**（如阿里云、腾讯云、USTC 等提供的 Docker Hub 加速），并 `systemctl restart docker`；或  
- 把 **`docker/dockerfile`**（含 `*-labs` tag）同步到 **Harbor `hub.vlb.cn`**，再把各 Dockerfile 首行 syntax 改成你们内网地址。

---

## 3. 飞书通知 Secret（可选但默认已接线）

根 `.drone.yml` 已引用 **`FEISHU_WEBHOOK`**（与 `api/.drone.yml` 同名，可复用同一机器人）。通知 step 带有 **`failure: ignore`**：未配置或推送失败时**不会**把整条流水线标红，可在构建日志里排查。

- **需要通知**：在 Drone 仓库 Secrets 中配置 `FEISHU_WEBHOOK` 为飞书自定义机器人 Webhook URL。  
- **不需要通知**：可不配置；无需再手动删 YAML 中的 notify 步骤。

---

## 4. 镜像推送所需 Secrets（`docker-lumimax`）

在 **Drone → 该仓库 → Settings → Secrets** 中新增（名称需与 `.drone.yml` 一致）：

| Secret | 示例 | 说明 |
| --- | --- | --- |
| `docker_registry` | `ghcr.io` 或 `registry.example.com` | 镜像仓库 host，**不要**带 `https://` |
| `docker_repo` | `myorg/lumimax` | 仓库路径；GHCR 一般为 **小写 owner** + `/` + 镜像名 |
| `docker_username` | GitHub 用户名或机器人账号 | 登录用户名 |
| `docker_password` | `ghp_…` PAT 或 registry 密码 | GHCR 需 PAT 且勾选 **`write:packages`**（或等价权限） |

**Harbor / 自建 registry**：`docker_registry` 填域名，`docker_repo` 填 `项目名/镜像名`。

未配置上述 secret 时，`docker-lumimax` 会在 `publish` 步骤失败；**CI 两条 pipeline 不依赖这些 secret**。

---

## 5. 与 GitHub Actions 同时开

可以同时保留：

- **GitHub Actions**：`.github/workflows/ci.yml`、`.github/workflows/docker.yml`（仅推 **Harbor `hub.vlb.cn/work/lumimax`**，可选飞书 `FEISHU_WEBHOOK`）。
- **Drone**：`.drone.yml`（自建 runner、可推内网 Harbor 或同一 GHCR）。

同一 `push` 可能 **各跑一套** CI/CD。若希望「GitHub 只做 PR 检查、镜像只走 Drone」，可在 GitHub 里关掉 `docker.yml` 的 `push` 触发，或只在 Drone 配 `docker-lumimax` 所需 secret。

---

## 6. 进阶（按需）

- **按路径跳过 job**：可用 Drone 条件表达式或拆 pipeline；本仓库默认全量跑，与当前 GitHub `ci.yml` 一致。
- **Promote 才推生产镜像**：另建一条 pipeline，`trigger: event: promote`，用 `DRONE_DEPLOY_TO` 等区分环境。
- **缓存 pnpm**：在 runner 上挂 host volume，在 `.drone.yml` 里为 `ci-*` steps 增加 `volumes`（视 Drone / runner 版本配置）。

---

## 7. GitHub Actions `docker.yml`：`api` / `web` 缺失、`COPY api/...` / `eslint.config.mjs` not found

本仓库 **工程上不采用 Git submodule**；`api/`、`web/` 应为普通目录。若 GitHub 上曾把 `api` **误记为 submodule（gitlink）**，会出现两类现象：

1. **Git 上下文 + 默认拉子模块**：`git submodule update` 报 `No url found for submodule path 'api'`。  
2. **Git 上下文 + `?submodules=0`**：不拉子模块，父仓库里 **没有** `api/` 下的 blob → `COPY api/eslint.config.mjs` 等报 **not found**。

因此 **`docker.yml` 已改为 `actions/checkout` + 路径上下文 `context: .`**，不再用带 `?submodules=0` 的 Git URL。构建前有一步 **Ensure api + web present**，若 `api/eslint.config.mjs` 缺失会打印 `git ls-tree HEAD api` 便于确认是否为 `160000`。

[`docker/Dockerfile`](../docker/Dockerfile) 使用 **`# syntax=docker.m.daocloud.io/docker/dockerfile:1.18-labs`**（`COPY --parents` 等 labs 能力），与上述 CI 策略独立。

### 自检

- GitHub 网页打开该 **`github.sha`**，确认根下存在 `api/eslint.config.mjs` 等。  
- 本地：`git fetch && git checkout <sha>` 后 `test -f api/eslint.config.mjs`。

### 根治（若 `git ls-tree` 显示 api 为 160000）

在有完整源码的克隆中去掉错误的 submodule 指针，把 `api/` 作为普通目录重新提交并 push（可先备份，再按团队规范执行 `git rm --cached api` 等操作后重新 `git add api`）。
