# spark-ai Architecture

`spark-ai` is the AI runtime package for SPARK. The package now has one mainline architecture: a business-first core plus business definitions. The old global function registry, carrier registry, model session loop, and page-model session helpers have been removed instead of kept as compatibility layers.

## Core Boundary

`src/core` owns only deterministic runtime concerns:

- register an `IBusinessDefinition`
- start, pause, resume, and stop a business instance
- keep per-instance history and function-call records
- expose the currently available functions for an instance
- execute exactly one function call through an explicit `instanceId`
- publish lifecycle, history, and function events

The core does not talk to an LLM, generate OpenAI tool schemas, retry model turns, ask follow-up questions, or keep a process-wide function registry.

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
src/core/runtime/ai-core.ts
src/core/knowledge/payload-provider-registry.ts
```

`src/business/page-design` defines the `pageDesign` business and owns page-design specific prompts, payload providers, function catalogs, and live edit-state adapters.

## Page Design Business

`createPageDesignBusinessDefinition()` registers four modules:

- `lifecycle`
- `textModel`
- `nodeTree`
- `dataset`

The business reads and writes the live model through `EditToolHost`. It does not accept old file snapshot payloads as a compatibility path, and it does not expose export/history actions through the dialogue action surface.

## Knowledge Payloads

Knowledge payload contracts live under `core/protocol`, while the provider registry lives under `core/knowledge`. Page-design component payloads are registered by business code and queried by the model host/tool projection layer.

## Public Surface

The package root exports:

- `createAiCore` and core business contracts
- protocol parsing helpers such as `extractFirstJsonObject`, `parseTokenUsage`, and `formatTokenUsage`
- `createPageDesignBusinessDefinition` and page-design edit-state helpers
- component catalog projection helpers and catalog types

The package root intentionally does not export old APIs such as `registerFunction`, `executeFunction`, `runFunctionLoop`, `SessionBackend`, `createPageModelSessionHost`, or `createPageModelEditSession`.

## Validation

Focused validation for this package:

```bash
pnpm --filter @spark-view/spark-ai run typecheck
pnpm exec vitest run tests/ai-core-business-runtime.test.ts tests/page-design-business-definition.test.ts tests/protocol-parser-json-extract.test.ts tests/llm-params-validator.test.ts --reporter verbose
```
