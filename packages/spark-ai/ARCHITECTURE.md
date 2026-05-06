# spark-ai 架构全景

> 更新于 2026-05-06。

本文描述当前目标架构。旧 stills / FC 全局注册 / 会话循环编排链路不再作为兼容目标；迁移期间若仍有文件残留，只能视为待拆除实现细节，不能作为新代码依赖入口。

## 1. 包定位

`@spark-view/spark-ai` 的核心目标是提供业务优先的 AI 核心层：

1. 注册业务定义，而不是注册函数、模块实例或运行载体。
2. 按业务定义创建业务实例和模块运行态。
3. 按 `instanceId` 管理通用历史、函数可用集和事件。
4. 只执行 AI 会话宿主转交的一次函数调用。
5. 不在核心层内做模型通讯、多轮编排、重试、追问或 tool schema 投喂。

AI 会话宿主位于核心层外。它负责模型通讯、提示词投喂、函数选择、重试、暂停和继续。

## 2. 当前新核心入口

公开入口：

- `createAiCore()`
- `AiCore.registerBusiness(definition)`
- `AiCore.startSession({ businessId, instanceId? })`
- `AiCore.appendMessages({ instanceId, messages })`
- `AiCore.getAvailableFunctions(instanceId)`
- `AiCore.executeFunctionCall({ instanceId, action, args })`
- `AiCore.stopSession({ instanceId, mode })`
- `AiCore.listInstances()`
- `AiCore.getInstanceDetail(instanceId)`
- `AiCore.getSessionHistory(instanceId)`
- `AiCore.subscribe(listener)`

核心 TypeScript 契约位于：

- `src/core/protocol/business-contracts.ts`
- `src/core/runtime/ai-core.ts`
- `src/core/index.ts`

## 3. 核心对象层次

唯一可注册对象是业务定义：

```text
BusinessDefinition
  -> ModuleDefinition
    -> FunctionDefinition

BusinessInstance(instanceId)
  -> ModuleRuntimeDirectory
  -> History
  -> Event stream
  -> Available function snapshot
```

关键约束：

1. `businessId` 标识业务定义。
2. `instanceId` 标识运行中的业务实例。
3. `sessionId` 只由核心内部派生，不出现在公开 API 返回值中。
4. `action = businessId@moduleId@functionId`。
5. `instanceId` 是函数调用信封字段，不进入业务 `args`。
6. 模块运行态由核心创建和索引，业务只能通过模块门面或 `runtimeReader` 按 `instanceId` 读取。

## 4. 迁移原则

不做旧接口兼容。

旧公开口径全部下线：

- `registerFunction` / `registerFunctions`
- `registerFunctionCarrier` / `registerFunctionCarriers`
- `runFunctionLoop`
- `createSessionBackend`
- `functionToToolDefinition` / `generateToolDefinitions`
- `core@knowledge@*` 作为 core 公共 API
- `Llm*` / `Orchestrator*` 命名出现在 core 出口

如果某个业务还依赖这些入口，应该迁移为：

1. 先定义 `IBusinessDefinition`。
2. 在业务定义内部声明 `IModule[]`。
3. 模块通过 `getPrompt()` 提供模块提示词。
4. 模块通过 `getFunctions()` 声明函数目录。
5. 模块通过 `createRuntime()` 交给核心创建运行态。
6. 函数通过 `execute(args, context)` 执行业务正文。
7. AI 会话宿主自己把核心函数集合投影成模型工具 schema。

## 5. 验证口径

当前核心落地优先验证新链路：

```powershell
pnpm exec vitest run tests/ai-core-business-runtime.test.ts --reporter verbose
```

这个测试覆盖：

1. 只注册业务定义。
2. 启动实例不暴露 `sessionId`。
3. 函数调用必须显式携带 `instanceId`。
4. action business 与 instance business 必须一致。
5. 参数先按函数 schema 校验。
6. 通用历史由核心记录。
7. 暂停、恢复、停止由核心状态机管理。
8. 模块运行态由核心释放。
9. 事件只作为观测面发布。

全仓旧测试可能仍反映旧 registry / stills 口径，不作为本轮核心设计阻塞。
