# @spark-view/spark-ai Architecture

> SSOT for `packages/spark-ai`. The package is intentionally breaking: old `schema`, `module-semantic`, `host`, dynamic tool names, and `$paths` are not public compatibility surfaces.

## Public Subpaths

`package.json` exposes exactly four public entries:

- `@spark-view/spark-ai`
- `@spark-view/spark-ai/json`
- `@spark-view/spark-ai/modules`
- `@spark-view/spark-ai/agent`

Root export is a small facade. New code should import from `json`, `modules`, or `agent`.

## Data Flow

```text
json
  -> modules/protocol
  -> modules/runtime
  -> agent/session
  -> agent/tool-loop
  -> agent/transport contracts
```

Business packages create already-constructed `AiModule` instances, register them in `AiModuleRuntime`, and pass the runtime into an explicit `AiAgentRegistration`.

## Source Tree

```text
packages/spark-ai/src/
├── index.ts
├── json/
├── modules/
│   ├── protocol/
│   │   ├── ai-module.ts
│   │   ├── module-context.ts
│   │   ├── module-operation.ts
│   │   └── module-path.ts
│   ├── internal/
│   │   ├── ai-module-registry.ts
│   │   ├── ai-module-path.ts
│   │   ├── navigator.ts
│   │   ├── function-invoker.ts
│   │   ├── attribute-accessor.ts
│   │   └── protocol-tool-generator.ts
│   ├── knowledge/
│   │   └── ai-module-knowledge.ts
│   └── runtime/
│       ├── ai-module-runtime.ts
│       ├── protocol-tool-args.ts
│       ├── protocol-tool-router.ts
│       └── protocol-result-projector.ts
└── agent/
    ├── business/
    ├── chat/
    ├── session/
    ├── tool-loop/
    └── transport/
```

## Fixed Tool Protocol

Runtime exposes only these transport-ready tools:

- `module_query`
- `module_guide`
- `module_find`
- `module_attr`
- `module_call`
- `human_question`

`module_call` uses `{ path, functionName, args }`. Instance identity comes from `path` plus current agent session scope.

## Session History

Session history is first-class state, not disposable cache. `AiAgentSessionStore` must be explicitly injected into every `AiAgentRegistration`; the registry does not create a hidden default store.

History records user messages, assistant messages, tool args/result/error, lifecycle stop reason, and turn/session identifiers. `startSession` reuses the same business instance record, `send` appends a new turn, and `stopSession` marks lifecycle without clearing transcript.

## Boundary Rules

- `spark-ai` must not import `spark-page-config`, Vue, Element Plus, Router, or app UI code.
- `json`, `modules`, and `agent` stay framework-free.
- Business live state belongs to business services. Agent session history stores resumable conversation and diagnostics.
- Protocol arguments must be standard JSON Schema object roots.
