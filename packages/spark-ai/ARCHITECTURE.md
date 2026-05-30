# @spark-view/spark-ai Architecture

> SSOT for `packages/spark-ai`. The package is intentionally breaking: old `schema`, `module-semantic`, `host`, dynamic tool names, and `$paths` are not public compatibility surfaces.

## Governance Priority

`spark-ai` follows this order when philosophy, protocol, generated code, structure, and compatibility conflict:

```text
理念 > 逻辑 > AI 生成代码规则 > SSOT || SOLID > 该删则删 || 该合则合 || 该拆则拆 > 兼容
```

Compatibility is the last constraint, not the first. If an old public shape makes the production line less stable, harder for AI to generate correctly, or inconsistent with the runtime protocol, narrow or remove it and keep compatibility only at the boundary.

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
│       ├── protocol-result-projector.ts
│       └── runtime-inspector.ts
└── agent/
    ├── business/
    ├── chat/
    ├── session/
    ├── tool-loop/
    └── transport/
```

## Tool Protocol

Runtime exposes three tool groups.

Protocol tools are stable production-line controls:

- `module_query`
- `module_guide`
- `module_attribute_guide`
- `module_function_guide`
- `module_find`
- `module_attr`
- `human_question`
- `agent_complete`

Business functions are exposed as standard OpenAI direct function tools:

```text
tool_call.function.name = <registered functionName>
tool_call.function.arguments = { "path": "/kind[id]", "args": { ... } }
```

`functionName` stays in the OpenAI tool name. Instance identity stays in `path`; function payload stays in `args`.

Compatibility tools are kept only at the boundary:

- `module_call({ path, functionName, args })`

`module_call` is not the primary production protocol. It exists for legacy callers and compatibility tests; new business flows should use direct function tools.

## Session History

Session history is first-class state, not disposable cache. `AiAgentSessionStore` must be explicitly injected into every `AiAgentRegistration`; the registry does not create a hidden default store.

History records user messages, assistant messages, tool args/result/error, lifecycle stop reason, and turn/session identifiers. `startSession` reuses the same business instance record, `send` appends a new turn, and `stopSession` marks lifecycle without clearing transcript.

## Boundary Rules

- `spark-ai` must not import `spark-page-config`, Vue, Element Plus, Router, or app UI code.
- `json`, `modules`, and `agent` stay framework-free.
- Business live state belongs to business services. Agent session history stores resumable conversation and diagnostics.
- Protocol arguments must be standard JSON Schema object roots.
