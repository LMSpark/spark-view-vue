# 业务工厂注册体系

> 状态：2026-06，按当前 `main` 源码校正。本文把“业务工厂”定义为一条可验收的能力生产线：从业务域原料出发，生产可注册、可查询、可校验、可治理、可运行、可交付的 `AiAgentRegistration` 能力包。

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
| 交付端口 | `src/services/ai/ai-delivery-port.ts` | APP 层 save、trace、rollback，形成交付回执 |

这里最关键的边界是：`Host.ensure` 是激活门，不是全部工厂；`AiAgentRegistration` 是成品形态，不是工艺流程；`DeliveryPort` 当前在 APP 层，不在 registration 类型内，但它必须被业务工厂的验收流程覆盖。

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

## 4. 工艺流程

建议把完整流程命名为 `BusinessCapabilityFactoryWorkflow`。它不是一个运行时类名，而是一套阶段化契约。

| 阶段 | 目标 | 输入 | 输出 | 验收点 | 当前锚点 |
| ---- | ---- | ---- | ---- | ------ | -------- |
| F0 能力定义 | 明确“这是哪类业务能力” | alias、moduleId、rootClassName、业务边界 | `BusinessCapabilityIdentity` | alias 稳定；moduleId 唯一；rootClassName 存在 | `ensureXxxBusiness()` |
| F1 原料绑定 | 绑定领域根对象和 APP 上下文 | moduleClass、instance/resolveInstance、manifest URL、delivery context | `BusinessFactoryMaterials` | 可解析领域实例；不把 instanceId 混成 alias | APP service |
| F2 知识绑定 | 让 LLM 可查 API | JSON manifest、knowledge provider、rootClassName | 可查询知识闭包 | root class 可达；子模型链可达；componentIndex 可查 | `ClassModelKnowledgeService` |
| F3 工单契约 | 把外部请求变成可执行任务 | paramsSchema、identityField、messageField、normalize | `AiAgentInputContract` | normalize 前后 schema 均通过；scope 与 identity 一致 | `createAiAgentTask()` |
| F4 运行时装配 | 组装工具闭集和 script 执行器 | moduleClass、runtime options、knowledge、script runner | `AiAgentToolRuntime` | `runtime.inspect()` healthy；7 工具参数白名单正确 | `ClassModelAgentAdapter` |
| F5 治理接入 | 控制工具调用过程 | before/after hooks、nudge、recovery、maxToolRounds | lifecycle policy | mutation gate 生效；失败提示可恢复；执行阶段可控 | tool-loop / executor |
| F6 工厂验收 | 注册前做出厂检查 | sample input、runtime inspect、knowledge query、delivery plan | acceptance report | dryRun 通过；关键 guide/script 链路通过；delivery 策略明确 | `host.dryRun()` + 测试 |
| F7 激活注册 | 把能力包接入 Host | alias、moduleId、registrationProvider | registry + alias map | alias 幂等；moduleId 不冲突；registration.moduleId 一致 | `Host.ensure()` |
| F8 工单生产 | 执行一次业务请求 | alias、input、chat options | session + tool loop result | input 合法；session 可追踪；tool result 可诊断 | `Host.run()` |
| F9 交付回执 | 把 Working Copy 出厂 | dirty state、delivery context | save/rollback/trace result | 成功才保存；失败 rollback；回执进入 resultExtras | `AiDeliveryPort` |

## 5. 工厂验收报告

当前 `dryRun` 已能覆盖注册、输入契约、scope、orchestration 和 runtime inspect，但还不是完整“工厂验收”。建议把它提升为显式报告，用于 APP 启动自检、CI、诊断面板和按需加载验收。

建议契约：

```typescript
type BusinessFactoryCheckStatus = 'pass' | 'warn' | 'fail'

type BusinessFactoryCheck = Readonly<{
  phase: 'identity' | 'materials' | 'knowledge' | 'contract' | 'runtime' | 'governance' | 'activation' | 'delivery'
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

## 6. 消费矩阵

| 消费方 | 消费什么 | 为什么必须保留 |
| ------ | -------- | -------------- |
| APP 启动注册 | alias、moduleId、provider、manifest URL、delivery context | 决定哪些业务能力被激活 |
| `Host.ensure` | alias、moduleId、registration provider | 控制幂等、冲突和 registry 写入 |
| `AiAgentRegistry` | `AiAgentRegistration` | 运行期按 moduleId 查找能力 |
| `host.dryRun` | inputContract、runtime.inspect、tools | 注册后但 LLM 前的前置验收 |
| `createAiAgentTask` | paramsSchema、normalize、identityField、toScope、toOrchestration | 运行时参数检测和业务实例绑定 |
| `AiAgentSession` | registration、scope、sessionStore | 建立会话、投影固定 module 工具 |
| `ToolLoopRunner` | runtime tools、systemPrompt、toolLoopNudge、executionToolNames | 控制 agent 工作流和执行阶段 |
| `ToolCallExecutor` | beforeFunctionCall、afterFunctionCall、runtime.executeTool | 参数执行、gate、生命周期指令 |
| ClassModel runtime | JSON 知识、paramsSchema、script executor | guide 查询、参数检测、`model_script` |
| Knowledge worker | manifest、classIndex、componentIndex、子模型链 | 按需加载和分级查询 |
| Delivery adapter | run context、dirty artifacts、result extras | 出厂保存、失败回滚、回执追踪 |
| UI / 诊断面板 | listRegistrations、describe、dryRun diagnostics、delivery result | 让业务能力可观察、可排错 |

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
type BusinessCapabilityFactoryRecipe<TInput> = Readonly<{
  identity: {
    alias: string
    moduleId: string
    rootClassName: string
  }
  materials: {
    moduleClass: Function
    manifestUrl: string
    resolveInstance?: (context: unknown) => unknown
  }
  knowledge: {
    provider: unknown
    requiredQueries?: readonly unknown[]
  }
  inputContract: AiAgentInputContract<TInput>
  governance?: {
    beforeFunctionCall?: unknown
    afterFunctionCall?: unknown
    toolLoopNudge?: unknown
    enrichRecoveryHints?: unknown
  }
  delivery?: {
    mode: 'manual' | 'auto'
    portName: string
  }
  accept?: (sampleInput: TInput) => Promise<BusinessFactoryAcceptanceReport>
  provideRegistration: () => AiAgentRegistration<TInput>
}>
```

这个配方不要求立即替换现有 `ensureXxxBusiness()`，但它能把“工艺流程”从散落在 service、Host、runtime、Delivery 的隐式约定，提升成可查询、可测试、可验收的业务描述。

## 9. 现状缺口

| 缺口 | 影响 | 优先级 |
| ---- | ---- | ------ |
| `AiAgentHostEnsureCommand.create` 命名偏窄 | 容易误以为 `{ moduleId, create }` 就是业务工厂 | 高 |
| 缺少显式 factory acceptance report | dryRun、knowledge query、delivery 策略分散，启动自检不完整 | 高 |
| Delivery 未进入能力配方 | Script 与交付边界清楚，但接新业务时仍靠人工记忆 | 高 |
| 工艺阶段未显式建模 | 阶段验收无法被 UI/CI 统一消费 | 中 |
| 诊断面板未展示工厂阶段 | 出问题时只能看 registration/runtime/task 的局部信息 | 中 |
| 旧文档仍有 `create` 简写 | 容易继续传播旧理解 | 中 |

## 10. 迭代路线

| 阶段 | 目标 | 改动范围 |
| ---- | ---- | -------- |
| A | 文档口径统一：`create` 是 provider，不是完整工厂 | docs |
| B | 增加 `BusinessFactoryAcceptanceReport` 类型，先由工具函数生成 | spark-ai types + tests |
| C | 将 `host.dryRun` 扩展为 factory acceptance 的子集 | Host API 兼容增强 |
| D | 新增 `registrationProvider` 兼容字段，保留 `create` | Host 类型与接入点 |
| E | 将 delivery plan 纳入接入 checklist 和诊断输出 | APP services + docs |
| F | 可选引入 `BusinessCapabilityFactoryRecipe` builder | 新业务接入层 |

最低可执行标准：新增业务不只回答“怎么 create registration”，而是必须交付 identity、knowledge、contract、runtime、governance、acceptance、delivery 七类信息，并能通过 dryRun 与关键 guide/script 链路验证。
