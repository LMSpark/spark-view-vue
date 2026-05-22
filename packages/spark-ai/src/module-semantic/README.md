# module-semantic

`@spark-view/spark-ai/module-semantic` is the protocol layer between Host and business modules. It owns semantic discovery and execution routing, but it does not own business live state or Host session history.

## Public Concepts

- `ModuleKind`: core class for kind metadata plus runner/list/find delegates.
- `ModuleActionMetadata` and `ModuleAttributeMetadata`: action and attribute declarations.
- `ModulePath`, `ModulePathSegment`, `ModulePathParseError`: path parsing.
- `ModulePathContext`, `ModuleHostContext`, `ModuleInstanceRef`, `ModuleInstanceQuery`: execution context and instance references.
- `ModuleOperationResult` and `ModuleCheckEntry`: protocol result envelope and diagnostics.
- `ModuleSemanticRuntime`: composition root and tool-call router.

## Protocol Tools

The LLM-facing tool set is fixed:

1. `listChildren(path, childKind?)`
2. `findInstance(path, childKind, query)`
3. `describeKind(kind)`
4. `invokeAction(path, actionName, args)`
5. `getAttribute(path, attrName)`
6. `setAttribute(path, attrName, value)`

Recommended discovery order:

1. `listChildren("/")`
2. `findInstance("/", kind, {})`
3. `describeKind(kind)`
4. `invokeAction("/kind[id]", actionName, args)`

## Registration Example

```ts
import {
  ModuleKind,
  ModuleOperationResult,
  ModuleSemanticRuntime,
  type ModuleKindRunner,
  type ModulePathContext,
} from '@spark-view/spark-ai/module-semantic'
import type { LlmJsonValue } from '@spark-view/spark-ai/schema'

const runtime = new ModuleSemanticRuntime()

const runner: ModuleKindRunner = (ctx, actionName, args) => runSchoolAction(ctx, actionName, args)

runtime.registerKind(new ModuleKind({
  kind: 'school',
  name: 'School',
  description: 'School business module',
  actions: [
    {
      name: 'archive',
      description: 'Archive the current school',
      paramsSchema: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string', description: 'Archive reason' },
        },
        additionalProperties: false,
      },
      resultSchema: { type: 'object' },
      usageRules: ['Call findInstance first to get the current school id.'],
      failureModes: [
        { code: 'NOT_FOUND', when: 'School does not exist', fix: 'Call findInstance again.' },
      ],
      example: { reason: 'test archive' },
    },
  ],
  runner,
  find: (ctx) => ModuleOperationResult.ok([
    { id: ctx.host?.moduleInstanceId ?? 'school-1', label: 'Current school' },
  ]),
}))

function runSchoolAction(
  ctx: ModulePathContext,
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
) {
  if (actionName !== 'archive') {
    return ModuleOperationResult.failCode('UNKNOWN_ACTION', `${actionName} is not implemented`)
  }
  return ModuleOperationResult.ok<LlmJsonValue>({
    schoolId: ctx.segment.id,
    reason: args['reason'],
  })
}
```

## Runtime Split

`ModuleSemanticRuntime` is intentionally small. It composes:

- `ModuleKindRegistry`
- `Navigator`
- `AttributeAccessor`
- `ActionInvoker`
- `ProtocolToolGenerator`
- `ProtocolToolRouter`
- `ProtocolToolArgsParser`
- `ProtocolResultProjector`

Parameter parsing and JSON result projection do not live in the runtime class.

## File Structure

```text
module-semantic/
├── protocol/
│   ├── module-kind.ts
│   ├── module-context.ts
│   ├── module-operation.ts
│   └── module-path.ts
├── internal/
├── runtime/
└── host/
```

Reference business registrations live in:

- `packages/spark-page-config/src/ai/page-design-module.ts`
- `packages/spark-page-config/src/ai/leave-request.ts`
