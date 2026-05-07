# spark-ai Architecture

`spark-ai` is the AI runtime package for SPARK. The package now has one mainline architecture: a business-registration runtime plus business-owned services. The old global function registry, carrier registry, model session loop, and page-model session helpers have been removed instead of kept as compatibility layers.

## Runtime Boundary

`src/core` is the deterministic runtime boundary between business services and an LLM-facing host:

- define a unified AI-facing standard: business info -> module info -> function info registration
- modules must implement `AiBusinessModuleRegistration`/`AiFunctionRegistration`; metadata is driven by the registration contract
- register an `AiBusinessRegistration`
- expose business -> module -> function metadata as `business@module@function`
- start, pause, stop, and resumable start of a runtime instance by `businessId + businessInstanceId`
- keep per-instance history and function-call records
- expose the currently available functions for an instance
- execute exactly one function call through an explicit `instanceId`
- publish lifecycle, history, and function events

The runtime does not own business service lifecycle, create module runtime state, talk to an LLM, retry model turns, or keep a process-wide function registry. Business services self-manage their state and optionally release per-instance state through `releaseInstance`.

## Core-Layer Contract Model

Core is the standard-owner and should be read as one contract layer:

- **Registration graph**
  - `AiBusinessRegistration` = business identity and module list (e.g. `pageDesign`)
  - `AiBusinessModuleRegistration` = module identity and function catalog (e.g. `nodeTree`, `dataset`)
  - `AiFunctionRegistration` = callable action contract (params/result/validation/execution)
- **Type-level implementation rule**
  - classes are preferred to plain objects: standard interfaces should be implemented by TS class-based modules and business registrations.
  - module/function metadata and behavior must remain consistent with the contract, not inferred from loose side channels.
- **Session semantics**
  - startup/recovery entrypoint is always `startInstance({ businessId, businessInstanceId })`
  - `businessId + businessInstanceId` is the external session identity used by callers and hosts
  - each active runtime instance maps to one `instanceId`
  - same pair resumes the same runtime instance
- **Event semantics**
  - `AiRuntime.subscribe` is the event bridge for UI hooks and business observers
  - events include lifecycle + function + history events for state sync and audit trails

## Action Address

Actions use one canonical address form:

```text
business@module@function
```

For example:

```text
pageDesign@nodeTree@addNode
pageDesign@dataset@createTable
pageDesign@textModel@writeScript
```

`startInstance` takes `{ businessId, businessInstanceId }`:

- first call creates a new AI core instance and returns `instanceId`
- same pair again resumes that same core instance (backwards compatibility removed)

Function calls must provide `instanceId` in the core envelope, not in business args.

## Directory Layout

```text
src/core/protocol/business-contracts.ts
src/core/protocol/invocation-helpers.ts
src/core/protocol/parameter-schema.ts
src/core/protocol/llm-params-validator.ts
src/core/protocol/knowledge-payload-contracts.ts
src/core/knowledge/payload-provider-registry.ts
src/core/runtime/ai-runtime.ts
src/core/runtime/ai-runtime-support.ts
```

`src/business/page-design` defines the `pageDesign` business and now uses class-first business components for prompts, payload providers, function catalogs, cache handles, and live edit-state adapters.

## Page Design Business

`PageDesignBusiness` registers four modules:

- `lifecycle`
- `textModel`
- `nodeTree`
- `dataset`

The business reads and writes the live model through `EditToolHost` and owns per-instance edit state through `PageDesignEditSession`. It does not accept old file snapshot payloads as a compatibility path, and it does not expose export/history actions through the dialogue action surface.

## Knowledge Payloads

Knowledge payload contracts and provider registry live under `core`. This is the read-model side of `core@knowledge`; concrete payload providers such as `page-design.component` live with the business that owns the domain facts.

## Public Surface

The package root exports:

- `AiRuntime`, `KnowledgePayloadRegistry`, and core business contracts
- protocol helper classes such as `AiInvocationProtocol` and `LlmParamsValidator`
- class-first page-design exports such as `PageDesignBusiness`, `PageDesignEditSession`, `PageDesignEditActionClassifier`, `PageDesignEditRuntimePrompt`, `PageDesignPageCache`, and `PageDesignComponentPayloadProvider`
- component catalog projection helpers and catalog types

The package also provides layered subpath exports:

- `@spark-view/spark-ai/core`
- `@spark-view/spark-ai/business`
- `@spark-view/spark-ai/business/page-design`
- `@spark-view/spark-ai/catalog`

The package root intentionally does not export old APIs such as `registerFunction`, `executeFunction`, `runFunctionLoop`, `SessionBackend`, `createPageModelSessionHost`, or `createPageModelEditSession`.

Migrating callers should use registration-first lifecycle:

- `AiRuntime.registerBusiness`
- `AiRuntime.startInstance({ businessId, businessInstanceId })`
- `AiRuntime.stopInstance({ instanceId, mode: 'pause' | 'stop' })`
- `AiRuntime.getAvailableFunctions(instanceId)`
- `AiRuntime.executeFunctionCall({ instanceId, action, args })`

## Validation

Focused validation for this package:

```bash
pnpm --filter @spark-view/spark-ai run typecheck
pnpm exec vitest run tests/ai-runtime-business.test.ts tests/ai-runtime-public-api.test.ts tests/page-design-business-definition.test.ts tests/protocol-parser-json-extract.test.ts tests/llm-params-validator.test.ts --reporter verbose
```
