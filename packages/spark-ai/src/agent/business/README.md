# business 层（Host 注册与业务适配）

> VCM runtime metadata → `ClassModelDocument` → `VcmNativeRuntime` → `AiAgentRegistration`。

## 核心文件

| 文件 | 职责 |
|------|------|
| `vcm-native-agent-adapter.ts` | `VcmNativeAgentAdapter.register`：metadata → ClassModel + VCM-native tool runtime |
| `ai-host.ts` | `createAiAgentHost`：ToolLoop + session + turnCallbacks |
| `business-session.ts` | `startSession` / `send` / `stopSession` |
| `registration-types.ts` | `resolveInstance`、`beforeFunctionCall`、lifecycle、`toolLoopNudge` / `enrichRecoveryHints` |
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

## 业务 Nudge / Recovery 下沉（app 层注入）

内核 `tool-loop-runner`、`function-call-recovery-enricher`、`native-runtime` 只保留 VCM-native 协议级提示。
业务 SOP 通过 `AiAgentRegistration` 可选 hook 注入：

| Hook | 用途 |
|------|------|
| `toolLoopNudge` | plan-without-tool / execution-phase / module-script-retry 回合纠偏 |
| `planWithoutToolMarkers` | 扩展「口头承诺要调工具」检测关键词 |
| `executionToolNames` | 判定已进入执行阶段的工具名（默认 `vcm_script`） |
| `enrichRecoveryHints` | FC / 脚本失败后的业务 RECOVERY_HINT |

## APP 消费方

| 文件 | 职责 |
|------|------|
| `src/services/page-design-business.ts` | `ensurePageDesignBusiness`、pageDesign SOP hooks |
| `src/services/project-planning-business.ts` | `ensureProjectPlanningBusiness`、策划阶段 hooks |
| `src/services/page-design-ai-runner.ts` | DevSystem `runPageDesignAiSession` |
| `src/services/page-design-gates.ts` | mutation tool gate |
| `src/services/ai-host.ts` | `appAiAgent` 生产 Host |

DevSystem 端到端：[`docs/pagedesign-devsystem-zh-cn.md`](../../../docs/pagedesign-devsystem-zh-cn.md)

## 文档

- 注册拓扑：[`docs/native-runtime-and-agent-flow-zh-cn.md`](../../../docs/native-runtime-and-agent-flow-zh-cn.md)
- VCM-native metadata：[`src/vcm-native/metadata`](../../vcm-native/metadata)
