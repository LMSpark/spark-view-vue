# spark-ai AI lifecycle configurable paths

This document tracks the target lifecycle configuration surface for the new business-first AI core.

## Layer split

- Core layer: business registry, instance lifecycle, module runtime directory, unified history, event bus, function availability, single function execution gateway.
- AI session host layer: model communication, prompt/tool-schema projection, retry, follow-up, pause/resume decisions, transport details.
- Business layer: business definitions, module prompts, module runtime factories, function catalogs, function business bodies.

Core does not own model orchestration.

## Lifecycle paths

- core
  - business-registry
    - business.register -> `core/runtime/ai-core.ts#createAiCore().registerBusiness`
    - business.get -> `AiCore.getBusinessDefinition`
    - business.list -> `AiCore.listBusinesses`
  - instance
    - instance.start -> `AiCore.startSession({ businessId })`
    - instance.resume -> `AiCore.startSession({ businessId, instanceId })`
    - instance.pause -> `AiCore.stopSession({ instanceId, mode: 'pause' })`
    - instance.stop -> `AiCore.stopSession({ instanceId, mode: 'stop' })`
    - instance.list -> `AiCore.listInstances`
    - instance.detail -> `AiCore.getInstanceDetail`
  - module-runtime
    - module.create -> `IModule.createRuntime`
    - module.start-hook -> `ModuleRuntime.onStart`
    - module.before-function -> `ModuleRuntime.beforeExecute`
    - module.after-function -> `ModuleRuntime.afterExecute`
    - module.stop-hook -> `ModuleRuntime.onStop`
    - module.destroy -> `IModule.destroyRuntime`
    - module.read -> `AiCore.runtimeReader.get(instanceId, moduleId)`
  - history
    - history.append-message -> `AiCore.appendMessages`
    - history.append-function-call -> `AiCore.executeFunctionCall`
    - history.exposure-snapshot -> `AiCore.startSession` / `AiCore.executeFunctionCall`
    - history.query -> `AiCore.getSessionHistory`
  - function
    - function.available -> `AiCore.getAvailableFunctions`
    - function.execute -> `AiCore.executeFunctionCall`
  - event
    - event.subscribe -> `AiCore.subscribe`

- business
  - definition
    - business.identity -> `IBusinessDefinition.businessId/name/description`
    - business.modules -> `IBusinessDefinition.modules`
  - module
    - module.prompt -> `IModule.getPrompt`
    - module.catalog -> `IModule.getFunctions`
    - module.runtime -> `IModule.createRuntime`
  - function
    - function.schema -> `IFunctionDefinition.paramsSchema/resultSchema`
    - function.validate -> `IFunctionDefinition.validate`
    - function.execute -> `IFunctionDefinition.execute`
    - function.post-validate -> `IFunctionDefinition.postValidate`

- ai-session-host
  - prompt-projection -> host reads `startSession().promptSnapshot`
  - tool-schema-projection -> host reads `getAvailableFunctions(instanceId)`
  - model-turn -> host-owned transport/model call
  - tool-call-forward -> host calls `executeFunctionCall({ instanceId, action, args })`
  - pause-stop-decision -> host calls `stopSession`

## Removed core paths

The following old paths are no longer target core configuration paths:

- `core.session.backend.*`
- `core.orchestration.*`
- `core.tooling.fc.definition-filter`
- `session.destroy-all`
- stills domain registry paths
- global function registry paths
- carrier registry paths

If a caller still needs these concepts, they belong to the AI session host or business adapter migration layer, not to core.

## Validation

Primary new-core validation:

```powershell
pnpm exec vitest run tests/ai-core-business-runtime.test.ts --reporter verbose
```
