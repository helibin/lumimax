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

## 7. GitHub Actions `docker.yml`：`api` / `web` 缺失、`COPY api/...` 失败

本仓库 **不使用 Git submodule**；`api/`、`web/` 均为普通目录，应完整出现在默认分支的提交树中。

### 当前流水线行为

根目录 [`.github/workflows/docker.yml`](../.github/workflows/docker.yml) 使用 **`docker/build-push-action` 的 Git 上下文**：按 **`${{ github.server_url }}/${{ github.repository }}.git#${{ github.sha }}`** 让 BuildKit **直接从 GitHub 拉该提交下的树**，**不依赖** runner 上 `actions/checkout` 后的工作区是否完整。

若 **Git 上下文构建仍失败**，说明 **该 `sha` 在 GitHub 上的树里没有完整 `api/` + `web/`**（常见：未 push、推到了别的 remote/分支、或 CI 跑的仓库/提交不是你以为的那份）。

### 自检

- 在 GitHub 网页打开 **该次 workflow 的 `github.sha`** → 浏览仓库根下是否能看到 `api/turbo.json`、`web/package.json` 等。  
- 本地：`git fetch && git checkout <sha> && test -f api/turbo.json && test -f web/package.json`（与 CI 使用同一提交）。

### 处理

把本地完整的 **`api/`、`web/`、`docker/`** 等 monorepo 内容 **commit 并 push 到触发构建的分支**；确认 **Actions 跑在正确的 GitHub 仓库**（fork 与 upstream 不要混用错 remote）。

修复后重新 push，Docker 构建应能通过。
