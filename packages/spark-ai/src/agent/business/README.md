# business 层（Host 注册与业务适配）

> VCM runtime metadata → `ClassModelDocument` → `VcmNativeRuntime` → `AiAgentRegistration`。

## 核心文件

| 文件 | 职责 |
|------|------|
| `vcm-native-agent-adapter.ts` | `VcmNativeAgentAdapter.register`：metadata → ClassModel + VCM-native tool runtime |
| `ai-host.ts` | `createAiAgentHost`：ToolLoop + session + turnCallbacks |
| `business-session.ts` | `startSession` / `send` / `stopSession` |
| `registration-types.ts` | `resolveInstance`、`beforeFunctionCall`、lifecycle |
| `business-task.ts` | `AiAgentInputContract`、systemPrompt 拼接 |

## VcmNativeAgentAdapter 注册流程

```text
VcmNativeAgentAdapter.register({ host, alias, metadata, moduleClass, options })
  ├─ resolveModuleMetadataJson(metadata)
  ├─ createClassModelDocumentFromRuntimeDocument()
  ├─ new VcmNativeRuntime({ document, knowledge, scriptExecutor })
  │    └─ vcm_script → executeAiNativeScript(instance, rootApi, script)
  └─ host.register(AiAgentRegistration)
```

**实例钉死**：`options.resolveInstance({ moduleInstanceId })` 在执行 `vcm_script` 时解析业务实例；脚本 `this` 绑定该实例，**不**经 path 解析。

## APP 消费方（pageDesign）

| 文件 | 职责 |
|------|------|
| `src/services/page-design-business.ts` | `ensurePageDesignBusiness`、`resolvePageDesignProject` |
| `src/services/page-design-ai-runner.ts` | DevSystem `runPageDesignAiSession` |
| `src/services/page-design-gates.ts` | mutation tool gate |
| `src/services/ai-host.ts` | `appAiAgent` 生产 Host |

DevSystem 端到端：[`docs/PAGEDESIGN-DEVSYSTEM.zh-CN.md`](../../../docs/PAGEDESIGN-DEVSYSTEM.zh-CN.md)

## 文档

- 注册拓扑：[`docs/NATIVE-RUNTIME-AND-AGENT-FLOW.zh-CN.md`](../../../docs/NATIVE-RUNTIME-AND-AGENT-FLOW.zh-CN.md)
- VCM-native metadata：[`src/vcm-native/metadata`](../../vcm-native/metadata)
