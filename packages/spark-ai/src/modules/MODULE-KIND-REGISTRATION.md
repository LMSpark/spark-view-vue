# AiModule Registration

> Current source note for `packages/spark-ai/src/modules`. This document replaces the legacy dynamic-tool registration notes.

## Registration Shape

- `AiModuleRuntime.register(module)` accepts only a constructed `AiModule`.
- Constructor-based registration is removed.
- An `AiModule` that declares `functions` must provide a runner, either through `runner` or `runFunction`.
- An `AiModule` that declares readable/writable `attributes` must provide `attributeAccessor`.
- An `AiModule` that declares `children` must provide `list` and `find`.
- Root modules must provide `find` so `module_find({ path: "/", childKind, query })` can resolve the current business instance.

## Fixed Tool Protocol

The runtime exposes exactly these transport-ready tools:

- `module_query`
- `module_guide`
- `module_find`
- `module_attr`
- `module_call`
- `human_question`

Business functions are never exported as dynamic tool names. Invoke them with:

```json
{
  "path": "/pageDesign[page-a]/node-tree[page-a]",
  "functionName": "addNode",
  "args": {
    "parentComponentId": "page__0",
    "node": {}
  }
}
```

Instance identity comes from `path` plus the current agent session scope. Protocol-only identity arrays are not supported.

## Session Contract

`AiAgentSessionStore` is owned by the agent registration and must be injected explicitly. It records user messages, assistant messages, tool-call args/results/errors, stop reason, turn ids, and session identifiers. `startSession` resumes the same business-instance history, `send` appends a turn, and `stopSession` only marks lifecycle state.

Business packages may read transcript/summary/diagnostics from the store, but must not maintain a second copy of conversation history.
