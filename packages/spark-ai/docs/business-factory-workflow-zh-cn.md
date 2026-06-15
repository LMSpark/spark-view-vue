# 业务工厂注册体系

> 状态：2026-06-15，按当前 `main` 源码校正。本文把“业务工厂”定义为一条可验收的能力生产线：从业务域原料出发，生产可注册、可查询、可校验、可治理、可运行、可交付的 `AiAgentRegistration` 能力包。

> **目标读者**：新增业务能力的开发者和评审者、诊断面板和 Vue Flow 画布的前端开发者、架构演进决策者。本文不面向终端用户。
>
> **关联文档**：
>
> | 文档 | 与本文的关系 |
> | ---- | ------------ |
> | [usiness-capability-onboarding.md](business-capability-onboarding.md) | 速查 checklist，本文 §12 的精简版；接入新业务时两份对照使用 |
> | [g-ui-adapter-zh-cn.md](ag-ui-adapter-zh-cn.md) | AG-UI 协议映射层；本文 §9.5 factory custom events 必须扩展该文档定义的 SparkAgUiCustomEventName 联合类型 |
> | [	ransport-and-session-zh-cn.md](transport-and-session-zh-cn.md) | 底层 transport 与 session 机制；AG-UI adapter 不参与 session 创建和历史持久化 |
>
> 业务工厂定义了 F0-F9 工艺阶段；onboarding checklist 按接入动作组织；AG-UI adapter 负责把工厂运行态事件投影为标准事件流。三者数据流：工厂阶段 → ` host.inspectFactory() ` → 报告与图 DTO → AG-UI custom events → 前端画布与 timeline。

## 1. 核心结论

业务工厂不是一个 `create` 回调。`create` 只是当前 `AiAgentHostEnsureCommand` 里的延迟 registration provider 字段，负责在 alias 尚未存在时提供一份 `AiAgentRegistration`。

完整业务工厂应包含工艺流程、阶段验收、消费矩阵和出厂回执：

```text
业务原料
  → 能力定义
  → 知识绑定
  → 工单契约
  → 运行时装配
  → 治理策略
  → 工厂验收
  → Host 激活注册
  → 工单生产
  → Delivery 交付
```

从 AI 视角看，业务工厂确实可以被外层系统当成一种“工具能力”，但它不是传统 one-shot tool。它同时拥有领域知识、输入契约、运行时工具闭集、生命周期 gate、会话治理和交付策略，内涵更接近一个可治理的 agent workflow 工厂。

当前最容易混淆的是三层边界：

| 层 | 当前真源 | 业务工厂里的角色 |
| -- | -------- | ---------------- |
| 语义真源 | 业务 `.ts/.vue` 源码，经 TypeScript / Vue 编译语义投影 | 定义领域 API、Props、JSDoc、子模型关系 |
| 能力成品 | `AiAgentRegistration` | Host 可注册、可运行、可诊断的能力包 |
| 出厂交付 | APP 层 `AiDeliveryPort` / Host Run provider | 决定 Working Copy 保存、回滚、trace 与回执 |

因此本文讨论的“工厂”不是把 JSON、registration 或 delivery 任意一层抬成唯一真源，而是把这些层串成可验收的生产线。

## 2. 当前代码真值

| 层 | 源码锚点 | 当前职责 |
| -- | -------- | -------- |
| Host 激活门 | `packages/spark-ai/src/agent/business/ai-host.ts` | `ensure(alias, command)` 做别名幂等、moduleId 一致性、注册表写入 |
| 延迟 provider | `AiAgentHostEnsureCommand` | 当前字段为 `{ moduleId, create }`，`create()` 只在 alias 不存在时执行 |
| Registration 成品 | `packages/spark-ai/src/agent/business/registration-types.ts` | `AiAgentRegistration` 承载身份、runtime、inputContract、sessionStore、hooks、nudge |
| ClassModel 装配 | `packages/spark-ai/src/agent/business/class-model-agent-adapter.ts` | `createRegistration()` 把 moduleClass、知识、contract、lifecycle 组装成 Registration |
| 工单入口 | `packages/spark-ai/src/agent/business/business-task.ts` | 校验 input、normalize、生成 scope、生成 orchestration |
| 会话闭环 | `packages/spark-ai/src/agent/business/business-session.ts` | 启动 registration session、创建 turn、委托 tool loop |
| 工具循环 | `packages/spark-ai/src/agent/tool-loop/tool-loop-runner.ts` | 发送 LLM turn、执行工具、处理生命周期指令与 nudge |
| 工具执行 | `packages/spark-ai/src/agent/tool-loop/tool-call-executor.ts` | 调 before/after hooks、调用 runtime.executeTool、回填 tool result |
| 工厂投影 | `packages/spark-ai/src/agent/business/business-factory.ts` | 定义 `BusinessFactoryAcceptanceReport`、F0-F9 graph DTO，并把 dryRun 投影成首版报告 |
| 交付端口 | `src/services/ai/ai-delivery-port.ts`（APP 层，项目根） | APP 层 save、trace、rollback，形成交付回执 |

> **层边界说明**：上表中除交付端口外，其余锚点均位于 `packages/spark-ai/`（内核层）；交付端口位于项目根 `src/services/ai/`（APP 层），不在 `spark-ai` 包内。这个边界意味着 `spark-ai` 的 `dryRun` 无法直接检查 Delivery，需要 APP 层在 Host Run provider 中补充验收。

这里最关键的边界是：`Host.ensure` 是激活门，不是全部工厂；`AiAgentRegistration` 是成品形态，不是工艺流程；`DeliveryPort` 当前在 APP 层，不在 registration 类型内，但它必须被业务工厂的验收流程覆盖。

### 2.1 当前实现覆盖面

按源码看，当前已经实现的是“可注册、可 dryRun、可 Host Run、可 APP 层交付”的分散能力；`host.inspectFactory(alias, sampleInput, checks?)` 已能把 dryRun 投影成首版 `BusinessFactoryAcceptanceReport` 和 `BusinessFactoryWorkflowGraph`。它还不是完整验收执行器：knowledge smoke、script smoke、governance summary 和 delivery plan 仍需要 APP 或后续 helper 通过补充 checks 接入。

| 能力 | 当前是否已实现 | 证据 | 还缺什么 |
| ---- | -------------- | ---- | -------- |
| alias/moduleId 幂等注册 | 已实现 | `AiAgentHost.ensure()`，测试 `ai-agent-host-business-factory.test.ts` | `create` 命名仍像完整 factory |
| Registration 成品 | 已实现 | `AiAgentRegistrationOptions`、`ClassModelAgentAdapter.createRegistration()` | 缺显式 factory recipe 汇总 |
| 输入契约校验 | 已实现 | `createAiAgentTask()` normalize 前后 schema 校验、identity/scope 断言 | 缺跨业务 checklist 产物化 |
| Runtime inspect | 已实现 | `host.describe()`、`host.dryRun()` 调 `runtime.inspect()` | 缺知识闭包和 guide/script smoke test |
| Tool loop 治理 | 已实现 | `beforeFunctionCall`、`afterFunctionCall`、`toolLoopNudge`、`executionToolNames` | 缺在验收报告里显式展示策略 |
| Delivery 回执 | APP 层已实现 | `AiDeliveryPort`、pageDesign/projectPlanning Host Run provider | 未纳入 `spark-ai` dryRun 或 factory report |
| 工厂报告/图 DTO | 首版已实现 | `business-factory.ts`、`` host.inspectFactory() `` | 仍需接入知识、治理、Delivery 的真实补充 checks |
| AG-UI run timeline | 已实现基础事件 | `createAiRunAdapter()`、`spark.stream.event`、tool call events | 未实现 `spark.factory.*` custom events |
| 工厂阶段图 | DTO 已实现 | `BusinessFactoryWorkflowGraph` | 需要前端 reducer、Vue Flow 页面和截图测试 |

这个覆盖面决定了文档里的“工厂验收”必须写成目标契约，而不能反向暗示现有 `dryRun()` 已经完成全部工厂检查。

## 3. 命名校正

当前 API：

```typescript
type AiAgentHostEnsureCommand<TInput> = Readonly<{
  moduleId: string
  create: () => AiAgentRegistration<TInput>
}>
```

这个命名容易误导，因为仓库里已经存在三层“构造”语义：

| 名称 | 真实语义 |
| ---- | -------- |
| `AiAgentHost.create()` | 创建 Host 宿主 |
| `ClassModelAgentAdapter.createRegistration()` | 组装 Registration 成品 |
| `new AiAgentRegistration()` | 构造 registration 实例 |
| `AiAgentHostEnsureCommand.create()` | 延迟提供 registration，概念上不是完整工厂 |

文档层建议统一称为 `registrationProvider` 或 `provideRegistration`。代码层可分两步演进：

```typescript
type AiAgentHostEnsureCommand<TInput> = Readonly<{
  moduleId: string
  create: () => AiAgentRegistration<TInput> // 兼容字段：当前代码真值
  // 后续可增量引入：
  // registrationProvider?: () => AiAgentRegistration<TInput>
}>
```

短期不必为了命名立刻破坏 API；但架构文档、接入文档和后续类型设计应把 `create` 解释为 provider，而不是把 `{ moduleId, create }` 当成业务工厂的完整表达。

### 3.1 `messageField` 归属说明

`messageField` 不在核心类型 `AiAgentInputContract` 内。`AiAgentInputContract` 的实际字段为 `{ paramsSchema, identityField, normalize, toScope, toOrchestration }`。`messageField` 属于 `business-kit.ts` 中 `CreateSimpleInputContractOptions` 的高层选项，由 `createSimpleInputContract()` 在内部映射到 `toOrchestration` 的 `userMessage` 字段。因此在工艺流程 F3 中应理解为"输入契约参数"，而非 `AiAgentInputContract` 的直接成员。

## 4. 工艺流程

建议把完整流程命名为 `BusinessCapabilityFactoryWorkflow`。它不是一个运行时类名，而是一套阶段化契约。

| 阶段 | 目标 | 输入 | 输出 | 验收点 | 当前锚点 |
| ---- | ---- | ---- | ---- | ------ | -------- |
| F0 能力定义 | 明确“这是哪类业务能力” | alias、moduleId、rootClassName、业务边界 | `BusinessCapabilityIdentity` | alias 稳定；moduleId 唯一；rootClassName 存在 | `ensureXxxBusiness()` |
| F1 原料绑定 | 绑定领域根对象和 APP 上下文 | moduleClass、instance/resolveInstance、manifest URL、delivery context | `BusinessFactoryMaterials` | 可解析领域实例；不把 instanceId 混成 alias | APP service |
| F2 知识绑定 | 让 LLM 可查 API | JSON manifest、knowledge provider、rootClassName | 可查询知识闭包 | root class 可达；子模型链可达；componentIndex 可查 | `ClassModelKnowledgeService` |
| F3 工单契约 | 把外部请求变成可执行任务 | paramsSchema、identityField、messageField（经由 `createSimpleInputContract` 映射到 orchestration）、normalize | `AiAgentInputContract` | normalize 前后 schema 均通过；scope 与 identity 一致 | `createAiAgentTask()` / `createSimpleInputContract()` |
| F4 运行时装配 | 组装工具闭集和 script 执行器 | moduleClass、runtime options、knowledge、script runner | `AiAgentToolRuntime` | `runtime.inspect()` healthy；7 工具参数白名单正确 | `ClassModelAgentAdapter` |
| F5 治理接入 | 控制工具调用过程 | before/after hooks、nudge、recovery、maxToolRounds | lifecycle policy | mutation gate 生效；失败提示可恢复；执行阶段可控 | tool-loop / executor |
| F6 工厂验收 | 注册前做出厂检查 | sample input、runtime inspect、knowledge query、delivery plan | acceptance report | dryRun 通过；关键 guide/script 链路通过；delivery 策略明确 | `` host.inspectFactory() `` + 测试 |
| F7 激活注册 | 把能力包接入 Host | alias、moduleId、registrationProvider | registry + alias map | alias 幂等；moduleId 不冲突；registration.moduleId 一致 | `Host.ensure()` |
| F8 工单生产 | 执行一次业务请求 | alias、input、chat options | session + tool loop result | input 合法；session 可追踪；tool result 可诊断 | `Host.run()` |
| F9 交付回执 | 把 Working Copy 出厂 | dirty state、delivery context | save/rollback/trace result | 成功才保存；失败 rollback；回执进入 resultExtras | `AiDeliveryPort` |

### 4.1 最小可落地闭环

新增业务能力的最低闭环不是把 F0-F9 都做成新类型，而是必须把七类信息交清楚：

| 信息 | 必须回答 | 可接受的首版来源 |
| ---- | -------- | ---------------- |
| identity | alias、moduleId、rootClassName 是否稳定且互不混用 | `ensureXxxBusiness()` 常量和 `rootClassName` |
| materials | 领域实例怎么解析，是否隔离 session/tenant/project | APP service、`instance` 或 `resolveInstance` |
| knowledge | manifest 是否可加载，root class 与子模型链是否可达 | `generated/dts-class-model/manifest.json` + knowledge provider |
| contract | 外部 args 如何进入 schema、normalize、scope、orchestration | `AiAgentInputContract` |
| runtime | 7 工具、参数白名单、script executor 是否可用 | `ClassModelAgentAdapter` + `runtime.inspect()` |
| governance | 哪些 tool 需要 gate、nudge、recovery、maxToolRounds | registration hooks + Host options |
| delivery | 成功保存什么、失败回滚什么、回执写到哪里 | APP `AiDeliveryPort` + Host Run provider |

如果其中任一项只能靠口头记忆，业务工厂就还没有真正完成接入。

## 5. 工厂验收报告

当前 `dryRun` 已能覆盖注册、输入契约、scope、orchestration 和 runtime inspect；`host.inspectFactory(alias, sampleInput, checks?)` 已把它提升为首版显式报告，用于 APP 启动自检、CI、诊断面板和按需加载验收。未传补充 checks 时，该报告会把 dryRun 无法证明的阶段标为 warn。

当前契约：

```typescript
type BusinessFactoryCheckStatus = 'pass' | 'warn' | 'fail'

type BusinessFactoryWorkflowPhaseKind =
  | 'identity'
  | 'materials'
  | 'knowledge'
  | 'contract'
  | 'runtime'
  | 'governance'
  | 'acceptance'
  | 'activation'
  | 'workOrder'
  | 'delivery'

type BusinessFactoryCheck = Readonly<{
  phase: BusinessFactoryWorkflowPhaseKind
  status: BusinessFactoryCheckStatus
  code: string
  message: string
  evidence?: unknown
  fix?: string
}>

type BusinessFactoryAcceptanceReport = Readonly<{
  alias: string
  moduleId: string
  rootClassName: string
  status: BusinessFactoryCheckStatus
  checks: readonly BusinessFactoryCheck[]
}>
```

报告应覆盖：

| 检查域 | 必查内容 |
| ------ | -------- |
| identity | alias、moduleId、rootClassName 三者不混用 |
| materials | moduleClass 可构造或 resolveInstance 可解析 |
| knowledge | manifest 可加载；root class 在 classIndex；子模型链闭包可达 |
| contract | paramsSchema、normalize、identityField、toScope、toOrchestration |
| runtime | 7 工具齐全；未知参数拒绝；`model_script` 参数检测可用 |
| governance | before/after hooks、nudge、recovery、maxToolRounds 策略明确 |
| activation | `Host.ensure` 幂等；moduleId 与 registration.moduleId 一致 |
| delivery | manual/auto 策略明确；save/rollback/trace 有回执 |

### 5.1 `dryRun` 与完整验收的差距

`host.dryRun(alias, sampleInput)` 是工厂验收的核心子集，但不是完整验收。它的当前覆盖面应按下面方式消费：

| 检查 | 当前 `dryRun` 是否覆盖 | 说明 |
| ---- | --------------------- | ---- |
| alias 已注册 | 是 | 未注册时返回 `DRY_RUN_FAILED` |
| inputContract 存在 | 是 | 缺失时判定 non-runnable |
| paramsSchema 校验 | 是 | normalize 前后各校验一次 |
| identityField 与 scope 一致 | 是 | `businessRegistrationId` 和 `businessInstanceId` 都会断言 |
| orchestration 非空 | 是 | `userMessage` 和 `systemPrompt` 不允许为空 |
| runtime inspect | 是 | 返回 tools、inspectReport、diagnostics |
| manifest 可加载 | 间接 | 只有 runtime inspect 或知识 provider 访问到时才暴露问题 |
| root 子模型闭包 | 未完整覆盖 | 需要专门的 knowledge query / guide smoke test |
| `model_script` 真实链路 | 未覆盖 | dryRun 不执行工具和脚本 |
| lifecycle gate 策略 | 未覆盖 | 只能从 registration 配置或运行态事件推断 |
| Delivery save/rollback/trace | 未覆盖 | APP Host Run provider 在 run 成功/失败后处理 |

所以目标态 `BusinessFactoryAcceptanceReport` 应该复用 `dryRun` 结果，但必须额外补 knowledge smoke、script smoke、governance summary 和 delivery plan。

### 5.2 ClassModel 知识验收角色

业务工厂不把 ClassModel JSON 当成业务真源，但必须把知识体系纳入出厂验收。对应关系如下：

| 工厂阶段 | ClassModel 应提供的证据 |
|----------|-------------------------|
| F2 知识绑定 | manifest 可加载；`classIndex[rootClassName]` 存在；关键子模型可通过属性、参数、返回值链路到达 |
| F4 运行时装配 | 7 工具 schema 与 runtime 参数白名单一致；`runtime.inspect()` 能暴露 rootKinds、moduleCount 和 findings |
| F6 工厂验收 | 至少一条 `model_query`、一条 guide 查询和一条安全 `model_script` smoke test 通过 |
| F8 工单生产 | LLM 在执行前能查到真实 kind、attribute、action，不依赖旧参数或猜测成员名 |

如果业务工厂验收只跑 `host.dryRun()`，它只能确认输入契约和 runtime inspect，不能证明 guide/script 链路真的可用。因此新增业务还需要显式补充知识查询与脚本 smoke test。

## 6. 消费矩阵

| 消费方 | 源码锚点 | 消费什么 | 为什么必须保留 |
| ------ | -------- | -------- | -------------- |
| APP 启动注册 | `src/services/*/xxx-business.ts` | alias、moduleId、provider、manifest URL、delivery context | 决定哪些业务能力被激活 |
| `Host.ensure` | `ai-host.ts` | alias、moduleId、registration provider | 控制幂等、冲突和 registry 写入 |
| `AiAgentRegistry` | `ai-host.ts` 内部 | `AiAgentRegistration` | 运行期按 moduleId 查找能力 |
| `host.dryRun` | `ai-host.ts` | inputContract、runtime.inspect、tools | 注册后但 LLM 前的前置验收 |
| `host.inspectFactory` | `business-factory.ts` | dryRun 结果 + 补充 checks | 工厂验收报告与 graph DTO |
| `createAiAgentTask` | `business-task.ts` | paramsSchema、normalize、identityField、toScope、toOrchestration | 运行时参数检测和业务实例绑定 |
| `AiAgentSession` | `business-session.ts` | registration、scope、sessionStore | 建立会话、投影固定 module 工具 |
| `ToolLoopRunner` | `tool-loop-runner.ts` | runtime tools、systemPrompt、toolLoopNudge、executionToolNames | 控制 agent 工作流和执行阶段 |
| `ToolCallExecutor` | `tool-call-executor.ts` | beforeFunctionCall、afterFunctionCall、runtime.executeTool | 参数执行、gate、生命周期指令 |
| ClassModel runtime | `class-model-agent-adapter.ts` | JSON 知识、paramsSchema、script executor | guide 查询、参数检测、`model_script` |
| Knowledge provider | `class-model-knowledge-service.ts` | manifest、classIndex、componentIndex、子模型链 | 按需加载和分级查询 |
| Delivery adapter | `src/services/ai/ai-delivery-port.ts` | run context、dirty artifacts、result extras | 出厂保存、失败回滚、回执追踪 |
| UI / 诊断面板 | `ai-host.ts` listRegistrations/describe | listRegistrations、describe、dryRun diagnostics、delivery result | 让业务能力可观察、可排错 |

这也是为什么不能只按“字段有没有被代码直接读取”判断 JSON 或 registration 元数据是否冗余。运行时参数检测、按需加载、知识体系分层查询、H 函数链恢复、诊断面板和交付回执都是消费层。

## 7. 与传统 Tool / Agent 的区别

| 维度 | 传统 tool | 传统 agent workflow | 业务工厂 |
| ---- | --------- | ------------------- | -------- |
| 产物 | 单个函数能力 | 一次会话或任务流程 | 可复用业务能力包 |
| 输入 | 函数参数 | 用户目标 + 工具集 | 工单契约 + 领域实例 + 知识体系 |
| 知识 | 通常靠 prompt 描述 | prompt + 工具说明 | JSON 知识索引 + 子模型链 + componentIndex |
| 控制 | 函数内校验 | loop 策略 | 注册验收 + runtime 参数检测 + hooks + delivery |
| 生命周期 | 调完结束 | 一次任务结束 | 能力长期注册，工单多次运行 |
| 交付 | 返回值 | 最终回答 | Working Copy save/rollback/trace |

因此，“业务工厂”可以向 AI 暴露为工具入口，但实现上必须按能力生产线治理，不能降级为一个 `create()`。

## 8. 建议的工厂配方

为了让后续业务接入更可控，可在概念层先形成 `BusinessCapabilityFactoryRecipe`，再逐步落代码。

```typescript
// 类型引用来自 spark-ai 包内：
//   ClassModelKnowledgeProvider    → class-model-knowledge-service.ts
//   ClassModelKnowledgeQueryInput  → class-model-knowledge-service.ts
//   AiAgentBeforeFunctionCallOptions / AiAgentBeforeFunctionCallDirective → lifecycle-types.ts
//   AiAgentAfterFunctionCallOptions / AiAgentLifecycleDirective → lifecycle-types.ts
//   AiAgentToolLoopNudgeContext → registration-types.ts
//   EnrichFunctionCallFailureCommand → function-call-recovery-enricher.ts
//   AiAgentRuntimeContext → scope-types.ts
//   AiDeliveryMode → ai-delivery-port.ts

type BusinessCapabilityFactoryRecipe<
  TInput extends AiJsonParams = AiJsonParams,
  TModule = unknown,
> = Readonly<{
  identity: {
    alias: string
    moduleId: string
    rootClassName: string
  }
  materials: {
    moduleClass: new (...args: unknown[]) => TModule
    manifestUrl: string
    resolveInstance?: (context: AiAgentRuntimeContext) => TModule
  }
  knowledge: {
    provider: ClassModelKnowledgeProvider
    requiredQueries?: readonly ClassModelKnowledgeQueryInput[]
  }
  inputContract: AiAgentInputContract<TInput>
  governance?: {
    beforeFunctionCall?: (
      instance: TModule,
      options: AiAgentBeforeFunctionCallOptions,
    ) => AiAgentBeforeFunctionCallDirective | Promise<AiAgentBeforeFunctionCallDirective>
    afterFunctionCall?: (
      instance: TModule,
      options: AiAgentAfterFunctionCallOptions,
    ) => AiAgentLifecycleDirective | Promise<AiAgentLifecycleDirective>
    toolLoopNudge?: (context: AiAgentToolLoopNudgeContext) => string | undefined
    enrichRecoveryHints?: (command: EnrichFunctionCallFailureCommand) => readonly string[]
  }
  delivery?: {
    mode: AiDeliveryMode
    portName: string
  }
  accept?: (sampleInput: TInput) => Promise<BusinessFactoryAcceptanceReport>
  provideRegistration: () => AiAgentRegistration<TInput>
}>
```

这个配方不要求立即替换现有 `ensureXxxBusiness()`，但它能把“工艺流程”从散落在 service、Host、runtime、Delivery 的隐式约定，提升成可查询、可测试、可验收的业务描述。

## 9. 可视化方案：AG-UI + Vue Flow

> 方案状态：设计稿，暂不落代码。核心原则是 **Vue Flow 只负责画布和交互，AG-UI 只负责事件流，`spark-ai` 仍是 SSOT 和执行真源**。

### 9.1 分层边界

```text
spark-ai
  Host / Registration / dryRun / ToolLoop / Delivery
  └─ 输出：业务工厂阶段、验收报告、AG-UI events

AG-UI
  run/message/reasoning/tool_call/approval/custom events
  └─ 输出：运行时间线、工具调用时间线、人工审批状态

Vue Flow
  canvas nodes / edges / interaction
  └─ 输出：可视化选择、展开、定位、过滤；不执行业务
```

禁止反向依赖：

| 禁止项 | 原因 |
| ------ | ---- |
| Vue Flow 节点状态反写 `AiAgentRegistration` | 画布是视图，不是执行真源 |
| AG-UI custom event 直接修改业务实例 | AG-UI 是事件协议，不是领域运行时 |
| APP 侧绕过 `host.dryRun` 自造验收状态 | 会破坏参数检测和 runtime inspect 的统一入口 |
| 画布节点直接调用 DeliveryPort | 交付必须由 APP run 生命周期统一控制 |

### 9.2 Graph DTO 设计

已在 `packages/spark-ai/src/agent/business/business-factory.ts` 提供画布无关 DTO，前端再薄映射到 Vue Flow。DTO 按 Vue Flow 习惯设计，但不导入 `@vue-flow/core`：

```typescript
type BusinessFactoryWorkflowPhaseId =
  | 'F0' | 'F1' | 'F2' | 'F3' | 'F4'
  | 'F5' | 'F6' | 'F7' | 'F8' | 'F9'

type BusinessFactoryWorkflowNodeStatus =
  | 'idle'
  | 'ready'
  | 'running'
  | 'passed'
  | 'warning'
  | 'failed'

type BusinessFactoryWorkflowGraphNode = Readonly<{
  id: BusinessFactoryWorkflowPhaseId
  type: 'businessFactoryPhase'
  position: { x: number; y: number }
  data: {
    phaseId: BusinessFactoryWorkflowPhaseId
    acceptancePhase: BusinessFactoryWorkflowPhaseKind
    title: string
    goal: string
    input: string
    output: string
    acceptance: string
    source: string
    status: BusinessFactoryWorkflowNodeStatus
    details: readonly string[]
    checks: readonly BusinessFactoryCheck[]
  }
}>

type BusinessFactoryWorkflowGraphEdge = Readonly<{
  id: string
  source: BusinessFactoryWorkflowPhaseId
  target: BusinessFactoryWorkflowPhaseId
  type: 'smoothstep'
  animated: boolean
  label: string
  data: {
    status: BusinessFactoryWorkflowNodeStatus
  }
}>

type BusinessFactoryWorkflowGraph = Readonly<{
  nodes: readonly BusinessFactoryWorkflowGraphNode[]
  edges: readonly BusinessFactoryWorkflowGraphEdge[]
}>
```

### 9.3 F0-F9 默认布局

当前首版使用固定布局，不引入自动排版。这样每个阶段的位置稳定，方便截图、测试和用户记忆。

```text
F0 能力定义 ─→ F1 原料绑定 ─→ F2 知识绑定 ─→ F3 工单契约 ─→ F4 运行时装配
                                                                 │
F9 交付回执 ←─ F8 工单生产 ←─ F7 激活注册 ←─ F6 工厂验收 ←─ F5 治理接入
```

| Phase | 默认坐标 | 节点类型 | 展示重点 |
| ----- | -------- | -------- | -------- |
| F0 | `(0, 0)` | identity | alias、moduleId、rootClassName |
| F1 | `(260, 0)` | materials | moduleClass、instance/resolveInstance、manifest URL |
| F2 | `(520, 0)` | knowledge | manifest、classIndex、componentIndex、子模型闭包 |
| F3 | `(780, 0)` | contract | paramsSchema、identityField、normalize、scope |
| F4 | `(1040, 0)` | runtime | 7 工具、script runner、runtime.inspect |
| F5 | `(1040, 240)` | governance | gates、nudge、recovery、maxToolRounds |
| F6 | `(780, 240)` | acceptance | dryRun、guide/script 链路、delivery plan |
| F7 | `(520, 240)` | activation | Host.ensure、alias map、registry |
| F8 | `(260, 240)` | workOrder | Host.run、session、ToolLoop、tool calls |
| F9 | `(0, 240)` | delivery | save、rollback、trace、resultExtras |

### 9.4 状态来源矩阵

| 阶段 | 可视化状态来源 |
| ---- | -------------- |
| F0 / F7 | `host.describe(alias)` 中 alias、moduleId 和 registration 摘要 |
| F1 | 业务工厂 recipe 或 APP ensure 配置；首版可从人工声明读取 |
| F2 | manifest 加载、rootClassName、knowledge query、componentIndex query |
| F3 | `host.dryRun(alias, sampleInput)` 中 normalizedInput、scope、orchestration |
| F4 | `runtime.inspect()` 的 `ok / warning / error` 和工具清单 |
| F5 | registration hooks、executionToolNames、toolLoopNudge、recovery hints |
| F6 | factory acceptance report 汇总 |
| F8 | contract 与 activation 通过，且 identity/materials/knowledge/runtime/governance 无 fail 后标为 `ready`；实际 run 中由 AG-UI / stream event 标为 `running / passed / failed` |
| F9 | APP DeliveryPort 的 save / rollback / trace 回执 |

### 9.5 AG-UI custom events

现有 AG-UI adapter 已覆盖 run、message、reasoning、tool call 和 `spark.stream.event`。业务工厂画布建议只新增 custom events，不扩 AG-UI 官方事件语义：

当前 `SparkAgUiCustomEventName` 只允许 `spark.toolApproval.requested`、`spark.toolApproval.resolved` 和 `spark.stream.event`。下面的 factory 事件是扩展提案，落代码前必须先扩展该联合类型、mapper 测试和 app adapter 事件投影。

| Event name | 触发时机 | value 建议 |
| ---------- | -------- | ---------- |
| `spark.factory.graph.snapshot` | 注册或 dryRun 后，发送完整 F0-F9 快照 | `BusinessFactoryWorkflowGraph` |
| `spark.factory.phase.started` | 某阶段开始执行或校验 | `{ alias, moduleId, phaseId, runId? }` |
| `spark.factory.phase.completed` | 某阶段通过 | `{ alias, moduleId, phaseId, checks? }` |
| `spark.factory.phase.failed` | 某阶段失败 | `{ alias, moduleId, phaseId, error, checks? }` |
| `spark.factory.acceptance.report` | 工厂验收结束 | `BusinessFactoryAcceptanceReport` |
| `spark.delivery.result` | Delivery save / rollback / trace 后 | `AiDeliveryResult` |

AG-UI 与 Vue Flow 消费方式：

```text
AG-UI standard events
  → Chat / timeline / tool-call panel

AG-UI spark.factory.* custom events
  → Workflow graph state reducer
  → Vue Flow nodes / edges
```

### 9.6 前端薄映射

Vue Flow 页面只做四件事：

1. 接收 `BusinessFactoryWorkflowGraph`。
2. 把 graph DTO 映射为 Vue Flow `nodes / edges`。
3. 根据 `status` 渲染节点颜色、图标、边动画。
4. 节点点击时展示 `details / checks / source / evidence`。

```typescript
const vueFlowNodes = graph.nodes.map(node => ({
  id: node.id,
  type: node.type,
  position: node.position,
  data: node.data,
}))

const vueFlowEdges = graph.edges.map(edge => ({
  id: edge.id,
  source: edge.source,
  target: edge.target,
  type: edge.type,
  animated: edge.animated,
  label: edge.label,
  data: edge.data,
}))
```

首版组件建议：

| 组件 | 职责 |
| ---- | ---- |
| `BusinessFactoryWorkflowGraph.vue` | Vue Flow 外壳，接收 graph |
| `BusinessFactoryPhaseNode.vue` | 单个 F0-F9 节点 |
| `BusinessFactoryPhaseDrawer.vue` | 节点详情、checks、evidence |
| `useBusinessFactoryWorkflowGraph.ts` | AG-UI custom event reducer |

### 9.7 落地优先级

本表只描述可视化方案落地顺序；类型冻结、`dryRun` 增强和 delivery 诊断仍按 §11 的全局迭代路线执行。

| 阶段 | 目标 | 当前状态 | 不做什么 |
| ---- | ---- | -------- | -------- |
| P0 文档冻结 | 固定 F0-F9、状态枚举、事件名、DTO 契约 | 已完成首版 | 不引入 UI 依赖 |
| P1 静态画布 | 用 mock graph 渲染 Vue Flow 页面 | 待做 | 不接 Host，不接 AG-UI |
| P2 dryRun 接入 | `` host.inspectFactory() `` 生成 F0-F9 首版状态 | 已完成首版 | 不执行 `Host.run` |
| P3 AG-UI 运行态 | 消费 tool call / stream / custom events 更新 F8 | 待做 | 不改变 ToolLoop |
| P4 Delivery 接入 | Delivery result 更新 F9 | 待做 | 不让画布直接保存 |
| P5 Factory Report | 形成 `BusinessFactoryAcceptanceReport` 类型与测试 | 已完成首版 | 不一次性引入 builder DSL |

### 9.8 验收标准

首版可视化方案必须满足：

| 验收点 | 标准 |
| ------ | ---- |
| SSOT | graph 来源于 `spark-ai`/APP 运行状态，不从 Vue Flow 反推 |
| 可解释 | 任一红色/黄色节点都能展开看到 `code/message/fix/evidence` |
| 可追踪 | F8 能定位到 AG-UI runId/threadId/toolCallId |
| 可分层 | 可只看工厂阶段，也可点开查看 AG-UI timeline |
| 可降级 | 没装 Vue Flow 时，graph DTO 仍可被日志/表格/诊断面板消费 |
| 可测试 | P1 静态节点快照、P2 dryRun 投影、P3 event reducer 都有单测 |

## 10. 现状缺口

| 缺口 | 影响 | 优先级 |
| ---- | ---- | ------ |
| `AiAgentHostEnsureCommand.create` 命名偏窄 | 容易误以为 `{ moduleId, create }` 就是业务工厂 | 高 |
| 暂无完整 factory acceptance runner | knowledge query、script smoke、governance summary、delivery 策略仍需外部补充 checks | 高 |
| Delivery 未进入能力配方 | Script 与交付边界清楚，但接新业务时仍靠人工记忆 | 高 |
| `dryRun` 容易被误当完整验收 | guide/script、governance、delivery 未覆盖，问题会拖到真实 run 才暴露 | 高 |
| 工艺阶段 graph 尚未接入前端与 AG-UI | Vue Flow 页面和运行态事件 reducer 还没有落地 | 中 |
| AG-UI 尚无 `spark.factory.*` custom events，类型联合也未放开 | 工厂阶段无法跟运行时间线统一 | 中 |
| 诊断面板未展示工厂阶段 | 出问题时只能看 registration/runtime/task 的局部信息 | 中 |
| 旧文档仍有 `create` 简写 | 容易继续传播旧理解 | 中 |

## 11. 迭代路线

| 阶段 | 目标 | 改动范围 |
| ---- | ---- | -------- |
| A | 文档口径统一：`create` 是 provider，不是完整工厂 | docs |
| B | 冻结 `BusinessFactoryAcceptanceReport` 与 `BusinessFactoryWorkflowGraph` DTO | 已有首版：spark-ai types + `` host.inspectFactory() `` |
| C | 将 `host.dryRun` 扩展为 factory acceptance 的子集 | Host API 兼容增强 |
| D | 新增 `spark.factory.*` AG-UI custom events | AG-UI mapper / app adapter |
| E | 引入 APP 侧 Vue Flow 静态原型页 | app/component 层 |
| F | 将 delivery plan 纳入接入 checklist 和诊断输出 | APP services + docs |
| G | 新增 `registrationProvider` 兼容字段，保留 `create` | Host 类型与接入点 |
| H | 可选引入 `BusinessCapabilityFactoryRecipe` builder | 新业务接入层 |

最低可执行标准：新增业务不只回答“怎么 create registration”，而是必须交付 identity、knowledge、contract、runtime、governance、acceptance、delivery 七类信息，并能通过 dryRun 与关键 guide/script 链路验证。

## 12. 新业务接入验收清单

本节是业务工厂的统一接入清单。其他文档可以链接本文，但业务工厂口径以本文为准。

### 12.1 七件套

新增业务不要只交一个 `create()`。接入评审时必须能给出下面七类材料：

| 材料 | 需要落到哪里 |
|------|--------------|
| identity | alias、moduleId、rootClassName 常量 |
| materials | moduleClass、instance/resolveInstance、APP 上下文 |
| knowledge | manifest URL、knowledge provider、root class 查询 |
| contract | paramsSchema、identityField、normalize、scope、orchestration |
| runtime | ClassModel 7 工具、script executor、runtime.inspect |
| governance | gates、nudge、recovery、maxToolRounds |
| delivery | manual/auto、save、rollback、trace、resultExtras |

### 12.2 阶段清单

#### A. 领域

- [ ] 根 class + `@module`（职责/边界/AI 用途）
- [ ] 公开 mutator；子 model 经 public 属性可达
- [ ] 确定 `identityField` 语义（进入 `businessInstanceId`）

#### B. 知识

- [ ] `pnpm run generate:class-model-surface`（内存 emit，产物为 JSON，不落盘 `.d.ts`）
- [ ] 迭代单个领域模型时可用 `pnpm run generate:class-model-surface:model -- RootClassName`
- [ ] 浏览器侧 `WorkerClassModelKnowledgeProvider` + manifest URL 已接线
- [ ] `classIndex[RootClass]` 存在
- [ ] `model_query({ kind: "RootClass", includeMembers: true })` 可返回根模型摘要
- [ ] 至少一个关键子模型可通过 attribute/action guide 链路查到
- [ ] `semantic-gaps.json` 可接受
- [ ] mutator 回调 ref 闭包可达

#### C. 能力包

- [ ] `host.ensure(alias, { moduleId, create })` 幂等；`create` 是当前 API 字段，概念上是 registration provider
- [ ] `ClassModelAgentAdapter.createRegistration({ rootClassName, manifestUrl, knowledge, inputContract, sessionStore })`
- [ ] `createSimpleInputContract({ businessId, identityField, messageField, paramsSchema, systemPrompt })`
- [ ] `beforeFunctionCall` gates（仅拦 mutation）
- [ ] `runtime.inspect()` 为 ok 或可解释的 warn
- [ ] `host.dryRun(alias, sampleInput)` 通过
- [ ] `create` / `registrationProvider` 不持有会跨 tenant/session 串扰的实例状态

#### D. 运行

- [ ] `host.run(alias, input, chat?)` 入口
- [ ] 工单 DTO 与 `paramsSchema` 一致
- [ ] `turnCallbacks` 已在 Host 构造时注入
- [ ] `maxToolRounds` 已按业务风险设置
- [ ] 请求级 `beforeFunctionCall` 与注册级 gate 的顺序已确认

#### E. 交付

- [ ] Commit 时机：手动 save / Host Run auto-save
- [ ] 可选 Receipt：`ai-host-run-bridge`
- [ ] 明确：Script 不等于 Delivery
- [ ] 成功 run 后 `delivery.save()` 的产物范围明确
- [ ] run 失败或 delivery 失败时 `delivery.rollback()` 和错误 extras 明确
- [ ] `delivery.trace()` 至少能保留 status、artifacts、message

#### F. 验收

- [ ] dryRun + guide/script smoke test
- [ ] `host.inspectFactory(alias, sampleInput, checks?)` 可生成 report + graph
- [ ] 知识闭包：root + 关键子模型 + 关键 action/attribute guide
- [ ] 脚本闭环：一个只读 `model_script` 或 sandbox smoke test
- [ ] 治理闭环：mutation gate 拒绝路径可见
- [ ] 交付闭环：save / rollback / resultExtras 可见
- [ ] loader 闭包测试
- [ ] DevSystem 或 staging Host Run
- [ ] 模型收敛回归：`pnpm run verify:model-convergence`
