# spark-ai AI 生命周期可配置路径

本文记录递归模块注册 AI 运行时当前的生命周期边界和配置路径。

## 分层

- 运行时层：模块注册表、运行实例生命周期、递归模块/函数曝光、活动路径、core 自有知识只读模型、统一历史、事件总线和单次函数执行入口。
- AI 会话宿主层：模型通信、提示词/工具 schema 投影、重试、追问、暂停/恢复决策、活动路径写入和传输细节。
- 模块实现层：服务生命周期、模块注册、模块提示词、函数目录、函数体和具体知识负载提供者。

运行时只强制模块和函数按标准元数据暴露注册接口（`AiModuleRegistration`、`AiFunctionRegistration`）。运行时不拥有模型编排，也不拥有模块服务状态。

## 生命周期路径

- runtime
  - module-registry
    - module.register -> `new AiRuntime().registerModule`
    - module.get -> `AiRuntime.getModuleRegistration`
    - module.list -> `AiRuntime.listModuleRegistrations`
  - instance
    - instance.start -> `AiRuntime.startInstance({ moduleId, moduleInstanceId })`
    - instance.resume -> 同一个运行中的 `moduleId + moduleInstanceId` 再次调用 `startInstance({ moduleId, moduleInstanceId })`
    - instance.pause -> `AiRuntime.stopInstance({ instanceId, mode: 'pause' })`
    - instance.stop -> `AiRuntime.stopInstance({ instanceId, mode: 'stop' })`
    - instance.stop-by-scope -> `AiRuntime.stopInstanceByModuleScope({ moduleId, moduleInstanceId, mode })`
    - instance.list -> `AiRuntime.listInstances`
    - instance.detail -> `AiRuntime.getInstanceDetail`
  - active-path
    - active-path.set -> `AiRuntime.setActivePath({ instanceId, bindings })`
    - active-path.clear -> `AiRuntime.clearActivePath({ instanceId, keys })`
    - active-path.get -> `AiRuntime.getActivePath(instanceId)`
  - exposure
    - exposure.module -> `AiRuntimeStartInstanceResult.module`
    - exposure.function -> `AiRuntime.getAvailableFunctions(instanceId)`
  - history
    - history.append-message -> `AiRuntime.appendMessages`
    - history.append-function-call -> `AiRuntime.executeFunctionCall`
    - history.exposure-snapshot -> `AiRuntime.startInstance` / `AiRuntime.executeFunctionCall`
    - history.query -> `AiRuntime.getInstanceHistory`
  - function
    - function.available -> `AiRuntime.getAvailableFunctions`
    - function.execute -> `AiRuntime.executeFunctionCall`
  - event
    - event.subscribe -> `AiRuntime.subscribe`
    - event.envelope -> 每个事件都携带 `moduleId + moduleInstanceId + instanceId`
    - event.types -> `instance.*` / `function.*` / `history.*` / `activePath.*`
  - knowledge
    - payload.register -> `KnowledgePayloadRegistry.register`
    - payload.query -> `KnowledgePayloadRegistry.defaultRegistry.queryPayloads`
    - payload.guide -> `KnowledgePayloadRegistry.defaultRegistry.guidePayload`

- module
  - registration
    - module.identity -> `AiModuleRegistration.moduleId/name/description`
    - module.modules -> `AiModuleRegistration.modules`
    - module.prompt -> `AiModuleRegistration.prompt`
    - module.instance-param -> `AiModuleRegistration.instanceParam`
    - module.catalog -> `AiModuleRegistration.getFunctions`
    - module.release-instance -> `AiModuleRegistration.releaseInstance`
  - function
    - function.address -> `module/.../function`
    - function.schema -> `AiFunctionRegistration.paramsSchema/resultSchema`
    - function.validate -> `AiFunctionRegistration.validate`
    - function.execute -> `AiFunctionRegistration.execute`
    - function.post-validate -> `AiFunctionRegistration.postValidate`
  - service-state
    - service.start -> 模块自有服务代码
    - service.instance-state -> 模块自有 map/store，按 `moduleInstanceId` 或 context 中的模块实例 ID 建索引
    - service.stop -> 模块自有服务代码
    - service.state-contract -> 模块保存领域状态；core 只保存运行时生命周期、历史、函数曝光和活动路径

- ai-session-host
  - prompt-projection -> 宿主读取 `startInstance().promptSnapshot`
  - tool-schema-projection -> 宿主读取 `getAvailableFunctions(instanceId)`
  - model-turn -> 宿主自有传输和模型调用
  - tool-call-forward -> 宿主调用 `executeFunctionCall({ instanceId, action, args })`
  - active-path-write -> 宿主调用 `setActivePath` / `clearActivePath`
  - pause-stop-decision -> 宿主调用 `stopInstance`

## 已移除的 core 路径

以下旧路径不再作为 core 配置目标：

- 业务注册路径
- `core.session.backend.*`
- `core.orchestration.*`
- `core.tooling.fc.definition-filter`
- `session.destroy-all`
- 全局函数注册表路径
- carrier 注册表路径
- core 自有模块运行时目录路径

如果调用方仍然需要这些概念，应放到 AI 会话宿主层，或放到模块自有迁移层，而不是放在 core。

## 验证

主要运行时验证命令：

```powershell
pnpm --filter @spark-view/spark-ai run typecheck
pnpm run test:run -- --config vitest.spark-ai.config.ts tests/ai-runtime-business.test.ts tests/page-design-business-definition.test.ts tests/protocol-parser-json-extract.test.ts tests/llm-params-validator.test.ts --reporter verbose
```
