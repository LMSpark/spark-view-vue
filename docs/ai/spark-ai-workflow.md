# spark-ai 工作流 SOP（速查）

> 完整架构见 [`packages/spark-ai/ARCHITECTURE.md`](../../packages/spark-ai/ARCHITECTURE.md)。

## 角色一览

| 层 | 做什么 |
|----|--------|
| **Java** (`spark-ai-server`) | 持久化 session、代理 LLM、SSE / Host Run |
| **Host** (`createAiAgentHost`) | 注册业务、`run` → ToolLoop |
| **VcmNativeRuntime** | 7 工具闭集、`executeTool` 路由 |
| **Worker 知识** | lazy 查 ClassModel + component catalog |
| **pageDesign 业务** | `ProjectModel` 注册、闸门、四文件内存编辑 |

## 一次 turn（最短路径）

1. `host.run('pageDesign', { pageId, description, effectiveDescription, … })`
2. ToolLoop：`prepareSession` → 循环 `executeTurn`
3. LLM 发起 tool_call（每轮最多 1 个受控 call）
4. `tool-call-executor` → `beforeFunctionCall`（gates/审批）→ `VcmNativeRuntime.executeTool`
5. 写页面：`vcm_script({ script })` → `this.openPageDesign` → `editDataSet` / `editNodeTree` → return 四文件
6. `agent_complete({ summary })` → 会话收尾

## 知识消费顺序

```text
vcm_query → vcm_model_guide / vcm_attribute_guide / vcm_action_guide → vcm_script
```

- 组装 UI：`vcm_action_guide({ className: "SparkNodeTree", actionName: "addNode", componentType: "r-table" })`
- **不要**用 path 直调；**不要**用旧 `module_*` 工具名

## 相位门控（Host 自动 nudge）

- 读完 `vcm_action_guide` 仍只查目录 → 强制 `vcm_script`
- `vcm_script` 失败 → 按 RECOVERY_HINT 修正，禁止再查 catalog
- 正文伪 tool_call / 只写计划 → 强制真实 OpenAI tool_calls

## 生成物

| 文件 | 命令 |
|------|------|
| `page-design-module-metadata.runtime.generated.json` | `pnpm run generate:module-metadata` |
| `payload/component-catalog.json` | `packages/vite-plugin-spark-catalog/src/cli.ts` |

## 入口

| 场景 | 文件 |
|------|------|
| DevSystem 面板 | `src/services/page-design-ai-runner.ts` |
| SSE Host Run | `src/services/ai-host-run-bridge.ts` + `page-design-host-run-provider.ts` |
| 业务注册 | `src/services/page-design-business.ts` |

## 未实现（勿假设存在）

- `callbackApis` metadata 字段
- `verifyPageDesignModelEdit` root action
- `vcm_query({ includePayloads: true })`
