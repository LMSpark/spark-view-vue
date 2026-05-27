# modules

`@spark-view/spark-ai/modules` is the protocol layer between the agent and business modules. It owns semantic discovery and execution routing, but it does not own business live state or agent session history.

## Public Concepts

- `AiModule`: core class for module metadata plus explicit runtime delegates.
- `AiModuleRuntime`: composition root and fixed tool-call router.
- `AiModuleFunctionMetadata` and `AiModuleAttributeMetadata`: function and attribute declarations.
- `AiModuleOptions`: constructor contract that combines declarative metadata with runtime delegates.
- `AiModulePath`, `AiModulePathSegment`, `AiModulePathParseError`: path parsing.
- `AiModulePathContext`, `AiModuleHostContext`, `AiModuleInstanceRef`, `AiModuleInstanceQuery`: execution context and instance references.
- `AiModuleResult` and `AiModuleCheck`: protocol result envelope and diagnostics.

## Tool Protocol

The LLM-facing tool set is fixed:

1. `module_query`
2. `module_guide`
3. `module_find`
4. `module_attr`
5. `module_call`
6. `human_question`

Business functions are not separate dynamic tool names. Call them with:

```json
{ "path": "/pageDesign[page-a]/lifecycle[page-a]", "functionName": "bootstrap", "args": {} }
```

## Registration

`AiModuleRuntime.register(module)` accepts only an already-constructed `AiModule`.

```ts
import {
  AiModule,
  AiModuleResult,
  AiModuleRuntime,
  type AiModuleRunner,
} from '@spark-view/spark-ai/modules'

const runtime = new AiModuleRuntime()

const runner: AiModuleRunner = (ctx, functionName, args) => {
  if (functionName !== 'archive') {
    return AiModuleResult.failCode('FUNCTION_NOT_DECLARED', `${functionName} is not implemented`)
  }
  return AiModuleResult.ok({ schoolId: ctx.segment.id, reason: args['reason'] })
}

runtime.register(new AiModule({
  kind: 'school',
  name: 'School',
  description: 'School business module',
  functions: [{
    name: 'archive',
    description: 'Archive the current school',
    paramsSchema: {
      type: 'object',
      required: ['reason'],
      properties: { reason: { type: 'string' } },
      additionalProperties: false,
    },
  }],
  runner,
  find: (ctx, childKind) => childKind === 'school'
    ? AiModuleResult.ok([{ id: ctx.host?.moduleInstanceId ?? 'school-1', label: 'Current school' }])
    : AiModuleResult.ok([]),
}))
```

If a module declares functions, attributes, or children, the corresponding runner/accessor/list/find delegate must be explicit.
