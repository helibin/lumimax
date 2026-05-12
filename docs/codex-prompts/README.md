# Lumimax Codex Multi-Agent Prompts

这是一组用于 Lumimax 三服务 MVP 架构的 Codex / Cursor / Claude Code 多 Agent 分段执行提示词。

## 当前架构

- `gateway`：只负责 HTTP / WebSocket 入口
- `base-service`：基础能力服务
- `biz-service`：业务能力服务

## 推荐使用顺序

1. `00-AGENTS.md`  
   放到仓库根目录，作为长期规则。

2. `01-master-planning-agent.md`  
   先让主控 Agent 只读项目并输出计划。

3. `02-shared-proto-agent.md`  
   统一 proto、common 类型和跨服务协议。

4. `03-base-service-agent.md` 与 `04-biz-service-agent.md`  
   可以在两个 Agent 中并行执行。

5. `05-gateway-agent.md`  
   等 base / biz / proto 稳定后接入 gateway。

6. `06-integration-test-agent.md`  
   跑联调，修启动、构建和主链路问题。

7. `07-code-review-agent.md`  
   专门做代码审查和架构边界检查。

8. `08-parallel-dispatch-master.md`  
   如果你的工具支持主控 Agent 调度多个 Agent，可以使用这个总控版本。

9. `09-minimal-mvp-start-prompt.md`  
   如果你想先跑最小 MVP 链路，直接用这个简版。

## 更新说明

- `04-biz-service-agent.md` 已更新：Food Analysis / Nutrition 阶段要求实现 provider / interface，并真实接入 Nutritionix、USDA FDC、Vision LLM 等第三方 API；mock 仅作为本地 fallback。

- `04-biz-service-agent.md` 已更新：biz-service 模块从平铺结构合并为 `device-domain`、`iot-domain`、`meal-domain`、`realtime-domain` 四个一级业务域，方便后续按域拆分服务。
