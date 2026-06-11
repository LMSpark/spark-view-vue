# Native Runtime 与全新 AI 流程

> 状态：有效（2026-06）。本文从 `packages/spark-ai/src/agent/native-runtime` 出发，说明 DTS ClassModel 驱动的执行流程。

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

执行只通过 ClassModel 工具闭集进入 native-runtime。

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
     -> resolveRuntimeApiMetadataJson()
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

所有工具都运行时拒绝未知参数。额外别名不会被接受。

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

## 当前边界

- 只暴露 `@spark-appworks/spark-ai/json`、`/class-model`、`/agent` 这些当前入口。
- 工具名固定为 ClassModel 7 工具闭集。
- `model_script` 参数只接受 `{ script }`。
- script 通过 native object chain 执行，不开放路径字符串调用协议。

未知工具名或未知参数进入 runtime 时会 fail-fast，不做 silent fallback。

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
| LLM 传 `path` | `model_script` 只接受 `{ script }`，重新查 `model_class_guide` |
| action 参数不对 | 先读 `model_action_guide`，按签名重写脚本 |
| pageDesign 被门禁拒绝 | 检查 planningStatus / implGate / upstreamContractsSatisfied |

## 验证命令

```bash
pnpm run typecheck
pnpm --filter @spark-appworks/spark-ai test:run
pnpm run test
```
