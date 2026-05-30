# modules 模块协议

`@spark-view/spark-ai/modules` 是 Agent 与业务模块之间的协议层。它负责语义发现和执行路由，但不持有业务运行状态，也不持有 Agent 会话历史。

## 边界

SPARK AI 只定义协议与运行时。业务 AI 包消费这些协议，并在消费层注册自己的模块、服务、输入契约和副作用。`pageDesign` 是业务层案例，不是 SPARK AI 内核物料。

旧 `core`、`runtime`、`protocol`、`adapter` public entry 只作为禁止旧入口出现。新代码必须使用四个 public subpath：根入口、`json`、`modules`、`agent`。

## 公共概念

- `AiModule`：模块元数据与显式运行时 delegate 的核心 class。
- `AiModuleRuntime`：组合根与固定工具调用路由器。
- `AiModuleFunctionMetadata`、`AiModuleAttributeMetadata`：函数与属性声明。
- `AiModuleOptions`：组合声明式元数据和运行时 delegate 的构造契约。
- `AiModulePath`、`AiModulePathSegment`、`AiModulePathParseError`：路径解析。
- `AiModulePathContext`、`AiModuleHostContext`、`AiModuleInstanceRef`、`AiModuleInstanceQuery`：执行上下文与实例引用。
- `AiModuleResult`、`AiModuleCheck`：协议结果信封与诊断信息。

## 工具协议

LLM 可见工具集合固定为：

1. `module_query`
2. `module_guide`
3. `module_attribute_guide`
4. `module_function_guide`
5. `module_find`
6. `module_attr`
7. `module_call`
8. `human_question`
9. 业务函数 direct tool：`<functionName>`

业务函数优先导出为 OpenAI 标准 direct tool，`function.name` 直接等于业务函数名，
`arguments` 固定为 `{ "path": "...", "args": {...} }`。`module_call` 只作为旧协议兼容路由。

```json
{
  "name": "summarize",
  "arguments": {
    "path": "/ticket[T-1001]/detail[T-1001]",
    "args": {}
  }
}
```

## 注册

`AiModuleRuntime.register(module)` 只接受已经构造完成的 `AiModule`。

```ts
import {
  AiModule,
  AiModuleResult,
  AiModuleRuntime,
  type AiModuleRunner,
} from '@spark-view/spark-ai/modules'

const runtime = new AiModuleRuntime()

const runner: AiModuleRunner = (ctx, functionName, args) => {
  if (functionName !== 'close') {
    return AiModuleResult.failCode('FUNCTION_NOT_DECLARED', `${functionName} 未实现`)
  }
  return AiModuleResult.ok({ ticketId: ctx.segment.id, reason: args['reason'] })
}

runtime.register(new AiModule({
  kind: 'ticket',
  name: '工单',
  description: '工单业务模块',
  functions: [{
    name: 'close',
    description: '关闭当前工单',
    paramsSchema: {
      type: 'object',
      required: ['reason'],
      properties: { reason: { type: 'string' } },
      additionalProperties: false,
    },
  }],
  runner,
  find: (ctx, childKind) => childKind === 'ticket'
    ? AiModuleResult.ok([{ id: ctx.host?.moduleInstanceId ?? 'T-1001', label: '当前工单' }])
    : AiModuleResult.ok([]),
}))
```

模块只要声明了 functions、attributes 或 children，就必须显式提供对应的 runner、accessor、list、find delegate。
