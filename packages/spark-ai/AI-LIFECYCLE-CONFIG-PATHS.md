# spark-ai AI 生命周期可配置路径

本文记录递归模块注册 AI core 当前的生命周期边界和配置路径。

## 分层

- core 层：模块知识注册表、AI session/history ledger、递归模块/函数曝光、LLM 函数调用翻译、函数结果回传协议、core 自有知识只读模型。
- AI 会话宿主层：模型通信、提示词/tool schema 投递、重试、追问、暂停/停止决策、active path 维护和传输细节。
- 模块实现层：服务生命周期、模块提示词、函数目录、函数体、模块运行状态和具体参数 payload 提供者。

core 只强制模块和函数按标准元数据暴露注册接口（`AiModuleRegistration`、`AiFunctionRegistration`）。core 拥有通用 AI 会话记录，不拥有模型编排，不拥有模块服务状态，也不依据函数执行结果做编排。

AI 会话隔离键是 `moduleId + moduleInstanceId`，即模块注册 ID + 根模块实例 ID。`instanceId` 只作为技术 envelope/alias，不作为隔离主键。

## 生命周期路径

- core
  - module-registry
    - module.register -> `new AiRuntime().registerModule`，返回绑定当前 `moduleId` 的 `AiRegisteredModuleApi`
    - module.get -> `AiRuntime.getModuleRegistration`
    - module.list -> `AiRuntime.listModuleRegistrations`
  - registered-module-api
    - api.start -> `AiRegisteredModuleApi.startInstance({ moduleInstanceId, instanceId })`
    - api.project -> `AiRegisteredModuleApi.projectModule({ moduleInstanceId, instanceId, runtimeInstanceId })`
    - api.append-message -> `AiRegisteredModuleApi.appendMessage({ moduleInstanceId, instanceId, runtimeInstanceId, role, content })`
    - api.translate -> `AiRegisteredModuleApi.translateFunctionCall({ moduleInstanceId, instanceId, runtimeInstanceId, action, args, projection })`
    - api.record-request -> `AiRegisteredModuleApi.recordFunctionCallRequest(...)`
    - api.result-message -> `AiRegisteredModuleApi.createFunctionResultMessage({ action, result })`
    - api.complete -> `AiRegisteredModuleApi.completeFunctionCall(...)`
    - api.stop -> `AiRegisteredModuleApi.stopInstance({ moduleInstanceId, instanceId })`
    - 该 API 只补齐 moduleId 并维护 AI session/history 链路，不创建、停止或释放模块服务实例。
    - 同一个 API 可服务多个 `moduleInstanceId`；每个根模块实例拥有独立 AI session/history。
  - session-notification
    - session.started -> `AiRuntime.startInstance({ moduleId, moduleInstanceId, instanceId })`
    - session.stopped -> `AiRuntime.stopInstance({ moduleId, moduleInstanceId, instanceId })`
    - 以上路径会更新 AI session record；不创建、停止或释放模块服务实例。
  - session-history
    - session.get -> `AiRuntime.getSession(instanceId)`
    - session.get-by-scope -> `AiRuntime.getSessionByModuleScope({ moduleId, moduleInstanceId })`
    - history.query -> `AiRuntime.getSessionHistory(instanceId)`
    - history.append-message -> `AiRuntime.appendMessage({ ...scope, role, content })`
    - history.record-function-request -> `AiRuntime.recordFunctionCallRequest({ ...scope, action, args })`
    - history.complete-function-call -> `AiRuntime.completeFunctionCall({ ...scope, historyEntryId, result })`
    - history.append-function-call -> `AiRuntime.appendFunctionCall({ ...scope, action, args, result })`，作为低阶兼容入口。
  - exposure
    - exposure.module -> `AiRuntime.projectModule(scope)` 或 `AiRuntime.startInstance(...).module`
    - exposure.function -> `AiRuntimeKnowledgeProjection.availableFunctions`
  - function-call
    - function.translate -> `AiRuntime.translateFunctionCall({ ...scope, action, args, activePath, projection })`
    - function.result-message -> `AiRuntime.createFunctionResultMessage({ action, result })`
    - core 不执行函数体，不读取执行结果做编排；函数调用轨迹写入 session history。
  - knowledge
    - payload.register -> `ParameterPayloadRegistry.register`
    - payload.query -> `ParameterPayloadRegistry.defaultRegistry.queryPayloads`
    - payload.guide -> `ParameterPayloadRegistry.defaultRegistry.guidePayload`

- module
  - registration
    - module.identity -> `AiModuleRegistration.moduleId/name/description`
    - module.modules -> `AiModuleRegistration.modules`
    - module.prompt -> `AiModuleRegistration.prompt`
    - module.instance-param -> `AiModuleRegistration.instanceParam`
    - module.catalog -> `AiModuleRegistration.getFunctions`
  - function
    - function.id -> 注册内部函数键
    - function.address -> 由 core 在会话投影时生成 `rootInstanceId[/childInstanceId]@moduleId@actionName`
    - function.schema -> `AiFunctionRegistration.paramsSchema/resultSchema`
    - function.execute -> 模块自有执行器；不属于 core 契约。
  - service-state
    - service.start -> 模块自有服务代码
    - service.instance-state -> 模块自有 map/store，按 `moduleInstanceId` 或领域实例 ID 建索引
    - service.stop -> 模块自有服务代码
    - service.state-contract -> 模块保存领域状态；core 只保存 AI session/history，不保存模块运行态或 active path 状态

- ai-session-host
  - prompt-projection -> 宿主读取 `projectModule().promptSnapshot` 或 `startInstance().promptSnapshot`
  - tool-schema-projection -> 宿主读取 `projection.availableFunctions`
  - model-turn -> 宿主自有传输和模型调用
  - tool-call-forward -> 宿主调用 `translateFunctionCall` 后转交模块执行器
  - tool-result-forward -> 宿主把模块执行结果通过 `createFunctionResultMessage` 回传 LLM，并通过 `appendFunctionCall` 写入历史
  - active-path-input -> 宿主在每次 `translateFunctionCall` 时传入当前 active path
  - pause-stop-decision -> 宿主调用 `stopInstance` 仅表示 AI 会话结束通知

## 已移除的 core 路径

以下旧路径不再作为 core 配置目标：

- 模块注册路径
- `core.session.backend.*` 中与模块服务生命周期绑定的旧后端路径
- `core.orchestration.*`
- `core.tooling.fc.definition-filter`
- `session.destroy-all`
- 全局函数注册表路径
- carrier 注册表路径
- core 自有模块运行时目录路径
- core 自有模块 instance/event/active-path 状态路径
- core 函数执行、结果验证、结果驱动编排路径

如果调用方仍然需要这些概念，应放到 AI 会话宿主层，或放到模块自有迁移层，而不是放在 core。

## 验证

主要运行时验证命令：

```powershell
pnpm --filter @spark-view/spark-ai run typecheck
pnpm run test:run -- --config vitest.spark-ai.config.ts tests/ai-runtime-business.test.ts tests/page-design-business-definition.test.ts tests/protocol-parser-json-extract.test.ts tests/llm-params-validator.test.ts --reporter verbose
```
