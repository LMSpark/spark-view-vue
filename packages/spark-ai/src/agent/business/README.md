# business 层（Host 注册与业务适配）

> VCM metadata → 可运行 `AiModule` 的唯一注册入口：`AiModuleAdapter`。

## 核心文件

| 文件 | 职责 |
|------|------|
| `ai-module-adapter.ts` | `AiModuleAdapter.register`：metadata → root `AiModule` + scriptContext |
| `ai-host.ts` | `createAiAgentHost`：ToolLoop + session + turnCallbacks |
| `business-session.ts` | `startSession` / `send` / `stopSession` |
| `registration-types.ts` | `resolveInstance`、`beforeFunctionCall`、lifecycle |
| `business-task.ts` | `AiAgentInputContract`、systemPrompt 拼接 |

## AiModuleAdapter 注册流程

```text
AiModuleAdapter.register({ host, alias, moduleClass, metadata, options })
  ├─ validateApiObjectMetadata(metadata)
  ├─ buildRootAiModule()
  │    ├─ functions ← metadata.actions（directCallable: false）
  │    ├─ scriptContext ← createAiApiScriptContext(instance, rootApi, ctx)
  │    └─ runner ← executeAiApiAction（单 action 直调，非 LLM 主路径）
  ├─ mergeCompanionChildDeclarations（guide-only 子 kind）
  └─ host.register(AiAgentRegistration)
```

**实例钉死**：`options.resolveInstance({ moduleInstanceId })` 在 `startSession` 时调用一次；`module_script` 的 `this` 绑定该实例，**不**经 path 解析。

## APP 消费方（pageDesign）

| 文件 | 职责 |
|------|------|
| `src/services/page-design-business.ts` | `ensurePageDesignBusiness`、`resolvePageDesignProject` |
| `src/services/page-design-ai-runner.ts` | DevSystem `runPageDesignAiSession` |
| `src/services/page-design-gates.ts` | mutation tool gate |
| `src/services/ai-host.ts` | `appAiAgent` 生产 Host |

DevSystem 端到端：[`docs/PAGEDESIGN-DEVSYSTEM.zh-CN.md`](../../../docs/PAGEDESIGN-DEVSYSTEM.zh-CN.md)

## 文档

- 注册拓扑与 companion：[`docs/NATIVE-RUNTIME-AND-AGENT-FLOW.zh-CN.md`](../../../docs/NATIVE-RUNTIME-AND-AGENT-FLOW.zh-CN.md) §6
- 协议 SSOT：[`src/modules/DM-VCM-MODULE-METADATA-SCOPE.md`](../../modules/DM-VCM-MODULE-METADATA-SCOPE.md)
