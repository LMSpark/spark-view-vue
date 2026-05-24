# @spark-view/spark-ai Architecture

> SSOT for the `packages/spark-ai` source layout. Keep this document aligned with exported subpaths and runtime data flow.

## Public Subpaths

`package.json` exposes exactly four public entries:

- `@spark-view/spark-ai`
- `@spark-view/spark-ai/schema`
- `@spark-view/spark-ai/module-semantic`
- `@spark-view/spark-ai/host`

Do not restore old `core`, `protocol`, or `adapter` public subpaths.

## Data Flow

```text
schema
  -> module-semantic/protocol
  -> module-semantic/runtime
  -> host/session
  -> host/tool-loop
  -> host/transport contracts
```

Business packages sit outside this package. They create `ModuleKind` classes, register them in `ModuleSemanticRuntime`, and pass the runtime to `AiHostBusinessRegistration`.

## Source Tree

```text
packages/spark-ai/src/
├── index.ts
├── schema/
│   ├── types.ts
│   ├── helpers.ts
│   └── validator.ts
├── module-semantic/
│   ├── protocol/
│   │   ├── module-kind.ts
│   │   ├── module-context.ts
│   │   ├── module-operation.ts
│   │   └── module-path.ts
│   ├── internal/
│   │   ├── module-kind-registry.ts
│   │   ├── navigator.ts
│   │   ├── action-invoker.ts
│   │   ├── attribute-accessor.ts
│   │   └── protocol-tool-generator.ts
│   ├── runtime/
│   │   ├── module-semantic-runtime.ts
│   │   ├── protocol-tool-args.ts
│   │   ├── protocol-tool-router.ts
│   │   └── protocol-result-projector.ts
│   └── host/
│       └── module-semantic-tool-codec.ts
└── host/
    ├── business/
    │   ├── scope-types.ts
    │   ├── lifecycle-types.ts
    │   ├── registration-types.ts
    │   ├── host-options.ts
    │   └── business-types.ts
    ├── session/
    ├── tool-loop/
    │   ├── payload-codec.ts
    │   ├── result-mapper.ts
    │   ├── diagnostic-events.ts
    │   ├── tool-call-executor.ts
    │   ├── turn-event-collector.ts
    │   └── tool-loop-runner.ts
    └── transport/
        ├── transport-types.ts
        ├── transport-turn.ts
        ├── app-sse-events.ts
        └── http-utils.ts
```

## Layer Responsibilities

- `schema`: JSON value types, JSON Schema helpers, and `LlmSchemaValidator`. `paramsSchema` uses `LlmJsonSchemaObject`.
- `module-semantic/protocol`: stable protocol concepts: `ModuleKind`, `ModulePath`, `ModuleOperationResult`, `ModuleCheckEntry`, `ModulePathContext`, `ModuleInstanceRef`, runner/list/find delegate types, and metadata types.
- `module-semantic/runtime`: composition root and protocol tool routing. `ModuleSemanticRuntime` wires registry, navigation, action invocation, attribute access, tool generation, argument parsing, and result projection.
- `host/session`: framework-free session history and function call history.
- `host/tool-loop`: LLM round loop, tool-call execution, APP SSE turn event aggregation, payload serialization, result mapping, and diagnostic events.
- `host/transport`: pure callback contracts, turn identity projection, APP SSE event types, and envelope helpers. Network I/O belongs to the APP/script layer.

## Boundary Rules

- `spark-ai` must not import `spark-page-config`, Vue, Element Plus, Router, or app UI code.
- `schema`, `module-semantic`, and `host` stay framework-free.
- Business state belongs to business services, never to Host session history.
- Protocol arguments must be standard JSON Schema object roots. Do not add private parameter DSLs.
