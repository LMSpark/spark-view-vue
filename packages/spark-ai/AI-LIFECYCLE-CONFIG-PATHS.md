# spark-ai AI lifecycle configurable paths

This document tracks the target lifecycle configuration surface for the business-registration AI runtime.

## Layer split

- Runtime layer: business registry, runtime-instance lifecycle, business/module/function exposure, core-owned knowledge read model, unified history, event bus, single function execution gateway.
- AI session host layer: model communication, prompt/tool-schema projection, retry, follow-up, pause/resume decisions, transport details.
- Business layer: service lifecycle, business registrations, module prompts, function catalogs, function business bodies, concrete knowledge payload providers.

Runtime also enforces registration interface constraints so business modules and functions expose standardized metadata (`AiBusinessRegistration`, `AiBusinessModuleRegistration`, `AiFunctionRegistration`).

Runtime does not own model orchestration or business service state.

## Lifecycle paths

- runtime
  - business-registry
    - business.register -> `new AiRuntime().registerBusiness`
    - business.get -> `AiRuntime.getBusinessRegistration`
    - business.list -> `AiRuntime.listBusinessRegistrations`
  - instance
    - instance.start -> `AiRuntime.startInstance({ businessId, businessInstanceId })`
    - instance.resume -> same entrypoint, repeated `startInstance({ businessId, businessInstanceId })` for the same running pair
    - instance.pause -> `AiRuntime.stopInstance({ instanceId, mode: 'pause' })`
    - instance.stop -> `AiRuntime.stopInstance({ instanceId, mode: 'stop' })`
    - instance.list -> `AiRuntime.listInstances`
    - instance.detail -> `AiRuntime.getInstanceDetail`
  - exposure
    - exposure.business -> `AiRuntimeStartInstanceResult.business`
    - exposure.module -> `AiRuntimeInstanceDetail.modules`
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
  - knowledge
    - payload.register -> `KnowledgePayloadRegistry.register`
    - payload.query -> `KnowledgePayloadRegistry.defaultRegistry.queryPayloads`
    - payload.guide -> `KnowledgePayloadRegistry.defaultRegistry.guidePayload`

- business
  - registration
    - business.identity -> `AiBusinessRegistration.businessId/name/description`
    - business.modules -> `AiBusinessRegistration.modules`
    - business.release-instance -> `AiBusinessRegistration.releaseInstance`
  - module
    - module.identity -> `AiBusinessModuleRegistration.moduleId/name/description`
    - module.prompt -> `AiBusinessModuleRegistration.prompt`
    - module.catalog -> `AiBusinessModuleRegistration.getFunctions`
  - function
    - function.address -> `business@module@function`
    - function.schema -> `AiFunctionRegistration.paramsSchema/resultSchema`
    - function.validate -> `AiFunctionRegistration.validate`
    - function.execute -> `AiFunctionRegistration.execute`
    - function.post-validate -> `AiFunctionRegistration.postValidate`
  - service-state
    - service.start -> business-owned service code
    - service.instance-state -> business-owned map/store keyed by `businessInstanceId` when needed
    - service.stop -> business-owned service code

- ai-session-host
  - prompt-projection -> host reads `startInstance().promptSnapshot`
  - tool-schema-projection -> host reads `getAvailableFunctions(instanceId)`
  - model-turn -> host-owned transport/model call
  - tool-call-forward -> host calls `executeFunctionCall({ instanceId, action, args })`
  - pause-stop-decision -> host calls `stopInstance`

## Removed core paths

The following old paths are no longer target core configuration paths:

- `core.session.backend.*`
- `core.orchestration.*`
- `core.tooling.fc.definition-filter`
- `session.destroy-all`
- stale domain registry paths
- global function registry paths
- carrier registry paths
- core-owned module runtime directory paths

If a caller still needs these concepts, they belong to the AI session host or business migration layer, not to core.

## Validation

Primary runtime validation:

```powershell
pnpm exec vitest run tests/ai-runtime-business.test.ts --reporter verbose
```
