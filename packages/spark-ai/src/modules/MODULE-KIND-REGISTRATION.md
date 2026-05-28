# AiModule 注册

> `packages/spark-ai/src/modules` 的当前源码说明。本文替代旧的动态工具注册说明。

## 边界

SPARK AI 定义模块协议、固定工具、运行时 inspect 和 Agent 注册原语。业务 AI 在内核外消费这些原语。`pageDesign` 是业务层案例，不是 `packages/spark-ai` 内可复用的内核物料。

旧 `core`、`runtime`、`protocol`、`adapter` subpath 只作为禁止旧入口出现。受支持的导入入口只限根入口、`json`、`modules`、`agent`。

## 注册形态

- `AiModuleRuntime.register(module)` 只接受已经构造完成的 `AiModule`。
- 基于构造参数的旧注册方式已移除。
- 声明了 `functions` 的 `AiModule` 必须通过 `runner` 或 `runFunction` 提供执行 delegate。
- 声明了可读/可写 `attributes` 的 `AiModule` 必须提供 `attributeAccessor`。
- 声明了 `children` 的 `AiModule` 必须提供 `list` 和 `find`。
- 根模块必须提供 `find`，让 `module_find({ path: "/", childKind, query })` 能解析当前业务实例。

## 固定工具协议

运行时只暴露以下传输就绪工具：

- `module_query`
- `module_guide`
- `module_find`
- `module_attr`
- `module_call`
- `human_question`

业务函数绝不导出为动态工具名。通过以下协议调用：

```json
{
  "path": "/ticket[T-1001]/detail[T-1001]",
  "functionName": "summarize",
  "args": {
    "includeHistory": true
  }
}
```

实例身份来自 `path` 与当前 Agent 会话 scope。协议层不支持旧的纯 identity 数组。

## 会话契约

`AiAgentSessionStore` 归 Agent registration 所有。底层注册必须显式注入；`createAiBusinessKit` 会在业务代码未提供时创建默认 store。它记录用户消息、助手消息、工具调用参数/结果/错误、停止原因、turn id 和 session 标识。`startSession` 会续接同一个业务实例历史，`send` 追加一个 turn，`stopSession` 只标记生命周期状态。

业务包可以从 store 读取 transcript、summary 和 diagnostics，但不能维护第二份完整对话历史。
