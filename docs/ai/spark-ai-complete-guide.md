# SPARK AI 完整指南

> 本文是 SPARK AI 业务、Host、LLM 工具协议、pageDesign 页面设计 AI 和验证入口的唯一说明文档。代码生成约束仍保留在 `AI_CODE_GENERATION_BEHAVIOR.md`，因为 `AGENTS.md` 会直接引用它。

## 一句话结论

SPARK AI 不让 LLM 直接面对一堆散乱小工具。业务先注册稳定的 `kindID`、输入契约和 ModuleKind 能力树，Host 再把用户输入校验成 registered task，最后由 LLM 通过固定知识入口和执行协议工具完成发现、反问、读状态、写入和验证。

```text
业务 service
  -> ModuleKind class
  -> ModuleSemanticRuntime
  -> AiHostBusinessKindDefinition(kindID + inputContract)
  -> projectAiHostBusinessRegistration()
  -> AiHostBusinessRegistry
  -> createAiHostBusinessTask(registry, kindID, input)
  -> createAiHostBusinessSession(options, task.target)
  -> session.start()
  -> session.send(task.toChatRequest())
  -> LLM fixed tool loop
  -> business ModuleKind action
  -> live state / workspace / backend persistence
```

## 当前边界

| 层 | 拥有什么 | 不拥有什么 |
| --- | --- | --- |
| `spark-ai/schema` | LLM JSON Schema、参数校验 | 业务含义 |
| `spark-ai/module-semantic` | ModuleKind、固定知识入口、执行协议工具、工具 schema 投影 | Host 会话、页面状态、业务持久化 |
| `spark-ai/host` | 业务注册表、输入任务、session、transport、tool loop、会话历史 | pageDesign 四文件、业务 live state |
| `spark-page-config/ai` | pageDesign / leaveRequest 等业务注册真源 | 通用 AI 传输和模型通讯 |
| `spark-page-config/design` | pageDesign live edit workspace、四文件读写、语义校验 | LLM session 历史 |
| `spark-ai-server` | Java AI 后端、SSE、模型调用、会话 API | 前端 pageDesign 业务工具实现 |

禁止把业务工具 schema、sessionId、页面四文件保存逻辑塞进 LLM prompt 或 smoke 脚本里临时拼。能注册就注册，能 schema 校验就 schema 校验，能由 Host 投影就不手写。

## 公共入口

推荐只从这些入口导入：

```ts
import { paramsSchema, stringSchema } from '@spark-view/spark-ai/schema'
import {
  ModuleKind,
  ModuleOperationResult,
  ModuleSemanticRuntime,
  type ModulePathContext,
} from '@spark-view/spark-ai/module-semantic'
import {
  AiHostBusinessRegistry,
  AiHostFetchTransport,
  createAiHostBusinessSession,
  createAiHostBusinessTask,
} from '@spark-view/spark-ai/host'
```

不要恢复旧 `core`、旧 `protocol`、旧 runtime adapter、旧 namespace 类型或业务私有 subpath。

## 注册化输入模型

`kindID` 是 AI 业务真源。每个业务必须先声明一个 kind definition，再投影成 registration。

```ts
const definition = {
  kindID: 'pageDesign',
  name: 'Page Design',
  description: '页面设计 AI',
  runtime,
  inputContract: {
    paramsSchema: paramsSchema({
      pageId: stringSchema('页面 ID', { minLength: 1 }),
      userRequirement: stringSchema('用户原始需求', { minLength: 1 }),
    }, ['pageId', 'userRequirement']),
    identityField: 'pageId',
    normalize: (input) => ({
      ...input,
      pageId: String(input.pageId).trim(),
      userRequirement: String(input.userRequirement).trim(),
    }),
    toScope: (input) => createAiHostBusinessScope('pageDesign', String(input.pageId)),
    toOrchestration: (input) => ({
      title: 'pageDesign registered task orchestration',
      userMessage: String(input.userRequirement),
      systemPrompt: '先定位实例，再只读确认进度和设计流程，缺事实先反问。',
      readonlySteps: [
        'find current pageDesign instance',
        'describeProgress',
        'describeDesignFlow with userRequirement intent',
      ],
    }),
  },
}

const registration = projectAiHostBusinessRegistration(definition)
```

`inputContract` 的职责：

| 字段 | 作用 |
| --- | --- |
| `paramsSchema` | Host 创建 task 前后都校验输入，非法输入 fail-fast |
| `identityField` | 定义业务实例主键，例如 pageDesign 的 `pageId` |
| `normalize()` | 去空白、规范枚举、补齐安全默认值 |
| `toScope()` | 把输入投影为 `AiHostBusinessScope` |
| `toOrchestration()` | 生成首轮 LLM 用户消息、system prompt 和只读步骤 |

调用方推荐入口：

```ts
const task = createAiHostBusinessTask(registry, 'pageDesign', {
  pageId,
  userRequirement,
})
```

`createAiHostBusinessTask()` 会做五件事：

1. 按 `kindID` 从 registry 找 registration。
2. 用 `paramsSchema` 校验原始输入。
3. 调 `normalize()` 并再次校验归一化输入。
4. 用 `identityField` 校验 scope 身份一致。
5. 生成 `AiHostBusinessTask(target, normalizedInput, orchestration)`。

`task.toChatRequest()` 会统一向 LLM 注入：

- `kindID`
- `businessInstanceId`
- `normalizedInput(JSON)`
- `readonlySteps`
- 业务 `toOrchestration()` 返回的 system prompt

这一步是“用户输入如何启动 LLM 编排”的结构层。不要让调用方绕过它手写裸 `AiHostBusinessTarget`。

## Session 与 Tool Loop

session 只接收 registered task 生成的 target：

```ts
const session = createAiHostBusinessSession({
  registry,
  transport: new AiHostFetchTransport({ baseUrl: '/api/ai' }),
  maxToolRounds: 16,
}, task.target)

await session.start()
await session.send(task.toChatRequest())
```

`session.start()`：

1. 从 registry 解析 registration。
2. 调 `registration.onStartSession(context)`。
3. 创建或接入 `sessionStore` 记录。
4. 调 `runtime.getLlmTools()`。
5. 经 `ModuleSemanticToolCodec` 投影给 LLM。

`session.send()`：

1. 提取最新用户消息。
2. 追加用户消息到 Host session store。
3. 启动 `AiHostToolLoopRunner`。
4. 调 transport stream。
5. 执行 LLM tool calls。
6. 追加工具结果和助手结果。
7. 根据 lifecycle directive 决定继续、结束或释放业务实例。

session 身份字段：

| 字段 | 含义 |
| --- | --- |
| `businessRegistrationId` | Host registry 中的业务 ID，等于 `kindID` |
| `businessInstanceId` | 顶层业务实例 ID，兼容旧字段名 |
| `moduleId` | runtime context 中的模块 ID，等于 `kindID` |
| `moduleInstanceId` | 顶层模块实例 ID，例如 `pageId` |
| `instanceId` | 后端 sessionId 的实例部分，通常等于 `moduleInstanceId` |
| `sessionId` | `${kindID}:${instanceId}` |

## LLM 固定工具协议

LLM 只看到固定知识入口和执行协议工具，不直接看到每个业务 action。

| 工具 | 用途 |
| --- | --- |
| `queryModules` | 查询当前注册的业务/模块知识 |
| `queryFunctions` | 查询某个 kind 可用动作 |
| `guideFunction` | 调复杂动作前读取参数、规则和失败模式 |
| `guideHumanQuestion` | 缺少用户事实时生成反问指南 |
| `listChildren` | 枚举子实例 |
| `findInstance` | 按条件定位实例 |
| `describeKind` | 读取 kind 元数据、action schema、usageRules |
| `invokeAction` | 统一调用业务 action |
| `getAttribute` | 读取注册属性 |
| `setAttribute` | 写入注册属性 |

LLM 执行顺序必须是：

```text
queryModules / queryFunctions
  -> guideFunction or describeKind
  -> guideHumanQuestion if facts are missing
  -> listChildren("/") / findInstance("/", kind, query)
  -> invokeAction(path, actionName, args)
  -> read result code/msg/fix
  -> retry with corrected args or ask human
```

`guideHumanQuestion` 只生成反问指南，不替用户决定。拿到 question 后应停止写工具，用自然语言问用户，等下一轮输入。

## 如何新增一个 AI 业务

新增业务默认按这个顺序做：

1. 定义稳定 `KIND_ID`。
2. 写业务 service，service 自管 live state 和领域状态。
3. 写 root `ModuleKind` 和必要 child `ModuleKind`。
4. 每个 action 写清 `paramsSchema`、`usageRules`、`failureModes`。
5. 创建 `ModuleSemanticRuntime` 并 `registerKind()`。
6. 创建 `createXxxBusinessKindDefinition(options)`。
7. 在 definition 中声明 `inputContract`。
8. 用 `projectAiHostBusinessRegistration(definition)` 生成 registration。
9. 提供 `createXxxBusinessRegistration()` 兼容旧入口。
10. 提供 `registerXxxBusiness({ registry, ... })` 窄门面。
11. 调用方只用 `createAiHostBusinessTask(registry, KIND_ID, input)`。
12. 补 host/task、business definition、public import 和业务 action 测试。
13. 更新本文，不再新增分散 AI 流程文档。

最小骨架：

```ts
export function createTodoBusinessKindDefinition(options: TodoBusinessOptions) {
  const service = new TodoService(options)
  const runtime = new ModuleSemanticRuntime()
  runtime.registerKind(new TodoRootKind())
  runtime.registerKind(new TodoListKind({ service, parentKind: TODO_KIND_ID }))

  return {
    kindID: TODO_KIND_ID,
    name: 'Todo',
    description: '待办事项 AI',
    runtime,
    inputContract: {
      paramsSchema: paramsSchema({
        todoListId: stringSchema('待办列表 ID', { minLength: 1 }),
        userRequirement: stringSchema('用户原始需求', { minLength: 1 }),
      }, ['todoListId', 'userRequirement']),
      identityField: 'todoListId',
      normalize: normalizeTodoInput,
      toScope: (input) => createAiHostBusinessScope(TODO_KIND_ID, String(input.todoListId)),
      toOrchestration: createTodoOrchestration,
    },
    onStartSession: (context) => service.bootstrap(context.moduleInstanceId),
    releaseModuleInstance: (moduleInstanceId) => service.release(moduleInstanceId),
  }
}
```

## pageDesign 当前定稿

pageDesign 的真源在 `packages/spark-page-config/src/ai/page-design-module.ts`。

`pageDesign` 注册内容：

- root kind：`pageDesign`
- child kind：`lifecycle`
- child kind：`dataset`
- child kind：`node-tree`
- child kind：`payload-catalog`
- child kind：`text-model`
- input identity：`pageId`
- required input：`pageId`、`userRequirement`
- optional input：`mode`、`allowedOperations`、`preserveExistingInteractions`

pageDesign 首轮 LLM 编排：

```text
Host session.start()
  -> onStartSession()
  -> PageDesignService.bootstrap()
  -> LLM receives registered task prompt
  -> findInstance("/", "pageDesign", { id: pageId })
  -> invokeAction("/pageDesign[pageId]/lifecycle[pageId]", "describeProgress", {})
  -> invokeAction("/pageDesign[pageId]/lifecycle[pageId]", "describeDesignFlow", { intent: userRequirement })
  -> guideHumanQuestion if business facts are missing
```

注意：`bootstrap` 是 Host 启动会话时自动执行的 live binding 校验。LLM 常规页面设计流程不要主动调用 `bootstrap`，除非工具结果明确要求重新校验。

pageDesign 写入顺序：

1. `dataset`：先设计或修正 `pagedata.json`，走 `pagedata.json -> parsePageData() -> DataSet` 管线。
2. `node-tree`：再改 `rule.json` 节点树，组件 props 必须先经过 payload guide 和 schema 校验。
3. `text-model`：最后改 `script.js` / `style.css`，遵守脚本沙箱。

高风险事实缺失时必须反问：

- 用户未说明业务范围。
- 用户需求包含相对日期、审批状态、默认选择等不可猜事实。
- 需要删除/覆盖已有交互。
- 需要新增表、脚本、组件，但输入未授权。
- 页面当前状态与用户需求冲突。

## pageDesign 四文件边界

| 文件 | AI 写入入口 | 约束 |
| --- | --- | --- |
| `pagedata.json` | dataset ModuleKind | 不绕过 DataSet 管线，不用旧拼接数据路径 |
| `rule.json` | node-tree ModuleKind | id/type/props 必须校验，props 错误返回给 LLM 修正 |
| `script.js` | text-model ModuleKind | 只允许 `$page`、`$route`、`$dataSet`、`$query`、`SparkData`、`h` 等沙箱变量 |
| `style.css` | text-model ModuleKind | 只写页面作用域样式，不用全局污染兜底 |

禁止在脚本中使用：

- `$data`
- ESM `import`
- `window.xxx` globals
- direct `ElMessage` / `ElMessageBox`
- direct Vue Router imports

## Transport 与后端

前端 Host transport 负责和 Java AI 后端通信：

```text
AiHostFetchTransport.prepareSession()
  -> POST /api/ai/sessions

AiHostFetchTransport.streamTurn()
  -> SSE /api/ai/sessions/{sessionId}/turns/{turnId}/stream

AiHostFetchTransport.appendMessages()
  -> POST /api/ai/sessions/{sessionId}/messages
```

SSE reader 只做 wire envelope 校验、delta/result/toolCalls 聚合，不解释 pageDesign 业务载荷。工具真正执行在 `AiHostToolLoopRunner`，再路由到 `ModuleSemanticRuntime.executeTool()`。

append AI 会话历史成功，不代表 pageDesign 四文件保存成功。四文件保存仍由 page-config workspace 完成。

## 源码定位

常用入口：

| 问题 | 文件 |
| --- | --- |
| task 输入注册化 | `packages/spark-ai/src/host/business/business-task.ts` |
| session/start/send | `packages/spark-ai/src/host/business/business-session.ts` |
| tool loop | `packages/spark-ai/src/host/tool-loop/tool-loop-runner.ts` |
| fetch transport | `packages/spark-ai/src/host/transport/fetch-transport.ts` |
| module-semantic runtime | `packages/spark-ai/src/module-semantic/runtime/module-semantic-runtime.ts` |
| pageDesign 注册 | `packages/spark-page-config/src/ai/page-design-module.ts` |
| pageDesign lifecycle | `packages/spark-page-config/src/ai/lifecycle-tool-catalog.ts` |
| pageDesign dataset | `packages/spark-page-config/src/ai/dataset-tool-catalog.ts` |
| pageDesign node-tree | `packages/spark-page-config/src/ai/node-tree-tool-catalog.ts` |
| pageDesign payload guide | `packages/spark-page-config/src/ai/payload-catalog-tool-catalog.ts` |
| pageDesign script/style | `packages/spark-page-config/src/ai/text-model-tool-catalog.ts` |
| live edit bridge | `packages/spark-page-config/src/design/page-design-service.ts` |
| workspace load/save | `packages/spark-page-config/src/design/page-edit-workspace.ts` |
| e2e live smoke | `scripts/verify-page-design-e2e.mjs` |

源码里仍可用 `PAGE_DESIGN_AI_TRACE[...]` 快速定位边界：

```bash
rg "PAGE_DESIGN_AI_TRACE" scripts packages/spark-ai/src packages/spark-page-config/src packages/spark-utils/src
```

trace 是源码边界标记，不再维护单独 trace 文档。

## 验证命令

常规改动后优先跑：

```bash
pnpm --filter @spark-view/spark-ai run typecheck
pnpm --filter @spark-view/spark-ai run lint
pnpm --filter @spark-view/spark-ai run test:run
pnpm --filter @spark-view/spark-page-config run typecheck
pnpm --filter @spark-view/spark-page-config run lint
pnpm --filter @spark-view/spark-page-config exec vitest run tests/page-design-business-definition.test.ts tests/page-design-node-tree-module-semantic.test.ts tests/leave-request-module.test.ts tests/public-api-imports.test.ts
pnpm run verify:rules
```

真实 LLM 页面设计验收按需跑：

```bash
pnpm run verify:ai:page-design-leave:llm
```

这个脚本会登录、准备页面、注册 pageDesign、创建 registered task、启动 AI 会话、保存 dirty 四文件并远端回读验收。它不是常规 CI 的默认命令。

## 文档维护规则

- AI 业务流程、边界、pageDesign、工具协议、验证入口统一维护在本文。
- 不再新增 UPPER_SNAKE 风格的分散 AI 流程、trace 或边界文档。
- 代码生成行为规则继续维护在 `AI_CODE_GENERATION_BEHAVIOR.md`。
- 新业务只更新本文的“如何新增一个 AI 业务”和对应业务小节。
- 源码 trace 可以保留在代码首次职责边界处，但不再为 trace 生成单独 Markdown 台账。
