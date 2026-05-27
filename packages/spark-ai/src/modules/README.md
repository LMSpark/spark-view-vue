# module-semantic

`@spark-view/spark-ai/modules` is the protocol layer between Host and business modules. It owns semantic discovery and execution routing, but it does not own business live state or Host session history.

## Public Concepts

- `AiModule`: core class for kind metadata plus constructor delegates exposed only through protocol methods.
- `AiModuleConstructor`: constructor contract accepted by `AiModuleRuntime.register(Constructor, ...args)`.
- `AiModuleFunctionMetadata` and `AiModuleAttributeMetadata`: function and attribute declarations.
- `AiModuleOptions`: constructor contract that combines declarative metadata with runtime delegates.
- `AiModuleSetAttributeRequest`, `AiModuleFindInstanceRequest`: API boundary DTOs.
- `AiModulePath`, `AiModulePathSegment`, `AiModulePathParseError`: path parsing.
- `AiModulePathContext`, `AiModuleHostContext`, `AiModuleInstanceRef`, `AiModuleInstanceQuery`: execution context and instance references.
- `AiModuleResult` and `AiModuleCheck`: protocol result envelope and diagnostics.
- `AiModuleRuntime`: composition root and tool-call router.

## Protocol Tools

The LLM-facing tool set:

1. `listChildren(path, childKind?)`
2. `findInstance(path, childKind, query)`
3. `describeKind(kind)`
4. `<kindPath>_<functionName>($paths, ...args)` — 标准业务函数 tool
5. `getAttribute(path, attrName)`
6. `setAttribute(path, attrName, value)`
7. `queryModules(kind?, parentKind?, keyword?)`
8. `queryFunctions(kind?, keyword?)`
9. `guideFunction(toolName | kind+functionName)`
10. `guideHumanQuestion(context, reason, missingFacts?)`

Recommended discovery order:

1. `queryModules()` / `queryFunctions({ kind })`
2. `guideFunction({ toolName })`
3. `guideHumanQuestion(...)` when user facts are missing
4. `listChildren("/")`
5. `findInstance("/", rootKind, {})`
6. for child kinds, `listChildren(parentPath)` / `findInstance(parentPath, childKind, {})`
7. `describeKind(kind)`
8. `<kindPath>_<functionName>({ $paths: [...], ...args })`

## Registration Example

```ts
import {
  AiModule,
  AiModuleResult,
  AiModuleRuntime,
  type AiModuleRunner,
  type AiModulePathContext,
} from '@spark-view/spark-ai/modules'
import type { AiJsonValue } from '@spark-view/spark-ai/json'

const runtime = new AiModuleRuntime()

const runner: AiModuleRunner = (ctx, functionName, args) => runSchoolFunction(ctx, functionName, args)

runtime.register(new AiModule({
  kind: 'school',
  name: 'School',
  description: 'School business module',
  functions: [
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
  find: (ctx) => AiModuleResult.ok([
    { id: ctx.host?.moduleInstanceId ?? 'school-1', label: 'Current school' },
  ]),
}))

// Subclass constructors can be registered through the same entry.
runtime.register(SchoolAiModule, { runner })

function runSchoolFunction(
  ctx: AiModulePathContext,
  functionName: string,
  args: Readonly<Record<string, AiJsonValue>>,
) {
  if (functionName !== 'archive') {
    return AiModuleResult.failCode('FUNCTION_NOT_DECLARED', `${functionName} is not implemented`)
  }
  return AiModuleResult.ok<AiJsonValue>({
    schoolId: ctx.segment.id,
    reason: args['reason'],
  })
}
```

## Runtime Split

`AiModuleRuntime` is intentionally small. It composes:

- `AiModuleRegistry`
- `Navigator`
- `AttributeAccessor`
- `FunctionInvoker`
- `ProtocolToolGenerator`
- `ProtocolToolRouter`
- `ProtocolToolArgsParser`
- `ProtocolResultProjector`

Parameter parsing and JSON result projection do not live in the runtime class.

## File Structure

```text
module-semantic/
├── protocol/
│   ├── index.ts
│   ├── module-context.ts
│   ├── module-kind.ts
│   ├── module-metadata.ts
│   ├── module-operation.ts
│   ├── module-path.ts
│   └── module-request.ts
├── internal/
└── runtime/
```

Reference business registrations live in:

- `packages/spark-page-config/src/ai/page-design-module.ts`
- `packages/spark-page-config/src/ai/leave-request.ts`
