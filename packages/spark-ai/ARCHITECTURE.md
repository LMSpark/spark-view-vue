# spark-ai Architecture

`spark-ai` is the AI runtime package for SPARK. The package now has one mainline architecture: a business-registration core plus business-owned services. The old global function registry, carrier registry, model session loop, and page-model session helpers have been removed instead of kept as compatibility layers.

## Core Boundary

`src/core` is the deterministic adapter between business services and an LLM-facing host:

- register an `AiBusinessRegistration`
- expose business -> module -> function metadata as `business@module@function`
- start, pause, resume, and stop an adapter session
- keep per-instance history and function-call records
- expose the currently available functions for an instance
- execute exactly one function call through an explicit `instanceId`
- publish lifecycle, history, and function events

The core does not own business service lifecycle, create module runtime state, talk to an LLM, retry model turns, or keep a process-wide function registry. Business services self-manage their state and optionally release per-adapter-session state through `releaseSession`.

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

`sessionId` is an implementation detail outside the business contract. Function calls must provide `instanceId` in the core envelope, not in business args.

## Directory Layout

```text
src/core/protocol/business-contracts.ts
src/core/protocol/invocation-helpers.ts
src/core/protocol/parameter-schema.ts
src/core/protocol/llm-params-validator.ts
src/core/protocol/knowledge-payload-contracts.ts
src/core/knowledge/payload-provider-registry.ts
src/core/runtime/ai-core.ts
```

`src/business/page-design` defines the `pageDesign` business and owns page-design specific prompts, payload providers, function catalogs, and live edit-state adapters.

## Page Design Business

`createPageDesignBusinessRegistration()` registers four modules:

- `lifecycle`
- `textModel`
- `nodeTree`
- `dataset`

The business reads and writes the live model through `EditToolHost` and owns the per-adapter-session edit state. It does not accept old file snapshot payloads as a compatibility path, and it does not expose export/history actions through the dialogue action surface.

## Knowledge Payloads

Knowledge payload contracts and provider registry live under `core`. This is the read-model side of `core@knowledge`; concrete payload providers such as `page-design.component` live with the business that owns the domain facts.

## Public Surface

The package root exports:

- `createAiCore` and core business contracts
- protocol parsing helpers such as `extractFirstJsonObject`, `parseTokenUsage`, and `formatTokenUsage`
- `createPageDesignBusinessRegistration`, compatibility alias `createPageDesignBusinessDefinition`, and page-design edit-state helpers
- component catalog projection helpers and catalog types

The package also provides layered subpath exports:

- `@spark-view/spark-ai/core`
- `@spark-view/spark-ai/business`
- `@spark-view/spark-ai/business/page-design`
- `@spark-view/spark-ai/catalog`

The package root intentionally does not export old APIs such as `registerFunction`, `executeFunction`, `runFunctionLoop`, `SessionBackend`, `createPageModelSessionHost`, or `createPageModelEditSession`.

## Validation

Focused validation for this package:

```bash
pnpm --filter @spark-view/spark-ai run typecheck
pnpm exec vitest run tests/ai-core-business-runtime.test.ts tests/page-design-business-definition.test.ts tests/protocol-parser-json-extract.test.ts tests/llm-params-validator.test.ts --reporter verbose
```
