# modules 模块协议

`@spark-appworks/spark-ai/modules` 是 Agent 与业务模块之间的协议层。它负责语义发现和执行路由，但不持有业务运行状态，也不持有 Agent 会话历史。

## 边界

SPARK AI 只定义协议与运行时。业务 AI 包消费这些协议，并在消费层注册自己的模块、服务、输入契约和副作用。`pageDesign` 是业务层案例，不是 SPARK AI 内核物料。

旧 `core`、`runtime`、`protocol`、`adapter` public entry 只作为禁止旧入口出现。新代码必须使用四个 public subpath：根入口、`json`、`modules`、`agent`。

**业务注册禁止手工 `new AiModule`**。业务能力 metadata 必须来自 VCM 生成 JSON，经 `AiModuleAdapter` 注册。`AiModuleRuntime.register()` 仅供框架内部使用。

## 公共概念

- `AiModule`：模块元数据与显式运行时 delegate 的核心 class（框架内部；业务方勿直接构造）。
- `AiModuleRuntime`：组合根与固定工具调用路由器。
- `AiModuleFunctionMetadata`、`AiModuleAttributeMetadata`：函数与属性声明。
- `AiModuleOptions`：组合声明式元数据和运行时 delegate 的构造契约。
- `AiModulePath`、`AiModulePathContext`、`AiModuleInstanceRef`：路径与实例引用。
- `AiModuleResult`、`AiModuleCheck`：协议结果信封与诊断信息。

## 工具协议

LLM 可见工具集合固定为：

1. `module_query` … `module_memory`
2. `human_question`、`agent_complete`
3. 业务函数 direct tool：`<functionName>`

嵌套 API（VCM `resultApis`）通过 `module_script` 链式调用，不通过 `/kind[id]` path 直调。

## 注册

业务唯一入口：`AiModuleAdapter.createRegistration` / `AiModuleAdapter.register`。

```ts
import { AiModuleAdapter, createAiAgentHost } from '@spark-appworks/spark-ai/agent'
import { resolveModuleMetadataJson } from '@spark-appworks/spark-ai/modules'

AiModuleAdapter.register({
  host,
  alias: 'pageDesign',
  moduleClass: ProjectModel,
  metadata: resolveModuleMetadataJson(runtimeDoc.modules[0]),
  options: {
    jsonSchemaDefs: runtimeDoc.$defs,
    inputContract: /* ... */,
  },
})
```

构建期：`TS class + @moduleKind JSDoc` → `pnpm run generate:module-metadata` → `*.runtime.generated.json`。
