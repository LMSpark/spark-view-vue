# Native Runtime 与全新 AI 流程

> 状态：有效（2026-06）。本文从 `packages/spark-ai/src/agent/native-runtime` 出发，说明旧 `src/modules` 删除后的 ClassModel 流程。

## 一句话

新流程只有一条主线：

```text
DTS ClassModel runtime
  -> ClassModelDocument
  -> ClassModelRuntime 7 工具闭集
  -> ToolLoop
  -> model_script
  -> native-runtime
  -> 业务实例
```

旧 path/direct-call runtime 不参与，也没有兼容层。

## 关键文件

| 文件 | 职责 |
|------|------|
| `agent/native-runtime/native-script-context.ts` | 创建脚本可见的链式 API surface，执行单个 action |
| `agent/native-runtime/native-script-runner.ts` | 接收 root metadata、schema defs、instance、script，组装执行上下文 |
| `agent/native-runtime/native-script-sandbox.ts` | 执行脚本并把异常转换为 `AiAgentToolResult` |
| `agent/business/class-model-agent-adapter.ts` | 业务注册入口，连接 metadata、ClassModel、ClassModelRuntime、Host |
| `agent/tool-runtime/tool-runtime-types.ts` | Agent 层工具运行时抽象 |
| `class-model/runtime/class-model-runtime.ts` | 7 个 ClassModel tool 的运行时实现 |

## 注册流程

```text
page-design-business.ts
  -> ClassModelAgentAdapter.register()
     -> resolveModuleMetadataJson()
     -> createClassModelDocumentFromRuntimeDocument()
     -> new ClassModelRuntime({ document, knowledge, scriptExecutor })
     -> host.register(AiAgentRegistration)
```

`scriptExecutor` 做的事很窄：

```text
resolveInstance(host.moduleInstanceId)
  -> executeAiNativeScript({ instance, metadata, script })
  -> AiAgentToolResult
```

## ToolLoop 流程

```text
LLM request
  -> AiAgentToolLoopRunner.getTools()
  -> ClassModelRuntime.getTools()
  -> LLM tool_call
  -> tool-call-executor
  -> registration.runtime.executeTool()
  -> ClassModelRuntime.executeTool()
```

工具返回统一是 `AiAgentToolResult`。`agent_complete` 会写入 lifecycle state，ToolLoop 据此收尾。

## 7 工具闭集

| 工具 | 参数 |
|------|------|
| `model_query` | `kind?`, `keyword?`, `includeMembers?` |
| `model_class_guide` | `kind` |
| `model_attribute_guide` | `kind`, `attributeName` |
| `model_action_guide` | `kind`, `actionName` |
| `model_script` | `script` |
| `human_question` | `context`, `reason`, `missingFacts?`, `candidateOptions?` |
| `agent_complete` | `summary` |

所有工具都运行时拒绝未知参数。旧别名不会被接受。

## native-script-context

`createAiApiScriptContext()` 根据业务实例把公开 API 包装成脚本 API：

```text
attribute read/write
  -> schema / writable / readable 检查
  -> Reflect.get / Reflect.set

action call
  -> params schema 校验
  -> Reflect.apply(instance[methodName], instance, args)
  -> result API metadata 投影
```

脚本中的 `this` 是 root API surface。业务对象仍是原始 class 实例，LLM 看到的是由 metadata 投影出的原生方法签名。

## model_script

典型脚本：

```javascript
const page = await this.openPageDesign({ pageId: 'orders' })
await page.editDataSet(async (ds) => {
  ds.createTable({ tableName: 'Orders', columns: [] })
})
return page.getFileText('pagedata.json')
```

执行链路：

```text
ClassModelRuntime.executeTool('model_script')
  -> scriptExecutor({ script, host })
  -> executeAiNativeScript()
  -> createAiNativeScriptContext()
  -> executeNativeScriptInSandbox()
```

失败会返回 `AiAgentToolResult.fail(...)`，recovery hint 只提示 `model_action_guide` / `model_script` 修正方式。

## 不兼容删除点

- 删除 `packages/spark-ai/src/modules`。
- 删除 package export `./modules`。
- 删除 Vite/Vitest/tsconfig 的 modules alias。
- 删除 `AiModuleAdapter`、`AiModuleRuntime`、`AiModuleResult` 公共导出。
- 删除旧工具名映射。
- 删除 direct-call path 协议。

旧工具名或旧参数进入新 runtime 时会 fail-fast，不做 silent fallback。

## pageDesign 端到端

```text
DevSystem
  -> runPageDesignAiSession()
  -> appAiAgent.run('page-design', input)
  -> pageDesign registration
  -> ClassModel tools
  -> model_script
  -> ProjectModel / ConfigPageNode / DataSetCrudTool / SparkNodeTree
```

门禁：

- `AiToolApprovalBridge`：UI 审批每次 tool call。
- `page-design-gates.ts`：对 mutation tool 检查 planningStatus、implGate、upstreamContractsSatisfied。

## 排错

| 现象 | 处理 |
|------|------|
| LLM 传 `methodName` | 改用 `model_action_guide({ kind, actionName })` |
| LLM 传 `code` | 改用 `model_script({ script })` |
| LLM 传 `path` | 说明仍在旧 direct-call 思维，重新查 `model_class_guide` |
| action 参数不对 | 先读 `model_action_guide`，按签名重写脚本 |
| pageDesign 被门禁拒绝 | 检查 planningStatus / implGate / upstreamContractsSatisfied |

## 验证命令

```bash
pnpm run typecheck
pnpm --filter @spark-appworks/spark-ai test:run
pnpm run test
```
