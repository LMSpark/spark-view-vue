# DM: spark-ai Core 与 core@knowledge 模块边界

> **状态**：已实施，持续验证  
> **日期**：2026-05-05  
> **范围**：`packages/spark-ai/src/core`、`packages/spark-ai/src/stills`、`packages/spark-ai/src/business/page-design`  
> **目标**：core 只负责注册机和运行时；`core@knowledge` 只能作为注册机读模型和运行时内省入口存在，业务语义、函数定义、模块提示词、参数荷载来源、业务 prompt 由业务域维护。

---

## 1. 一句话目标

把 spark-ai core 收敛为“怎么注册、怎么运行、怎么把注册事实投影给模型”的基础设施；把 page-design 这类业务域收敛为“注册什么函数、如何解释函数、如何给模块提示、如何构造参数荷载、如何组织业务 prompt”的语义层。

最终函数寻址统一为：

```text
业务@模块@函数
```

其中：

- **业务**：业务域，例如 `core`、`pageDesign`。
- **模块**：语义分组，例如 `knowledge`、`lifecycle`、`nodeTree`、`dataset`、`textModel`。
- **函数**：实际可调用的 Agent tool/function，例如 `queryFunctions`、`addNode`、`createTable`。

---

## 2. 背景与问题

重构前，core 名义上是 stills/FC/session 内核，但混入了 page-design 业务事实：

| 文件 | 问题 | 新归属 |
|------|------|--------|
| `core/stills/stills-prompts.ts` | 混入 UI 组装、DataKey、script.js、四文件编辑等业务规则 | core 只保留协议基座，业务规则进入 page-design prompt |
| `core/stills/edit-flow-prompts.ts` | page-design edit-flow 策略放在 core | `business/page-design/prompts` |
| `core/stills/action-names.ts` | 用全局常量混合 core/page-design/project-planning action | 删除常量层，action 地址只在函数定义行上出现 |
| `core/session/repeat-detection-monitor.ts` | 硬编码旧业务 action、组件替换文案 | core 保留算法，业务域注入策略 |
| `stills/meta-methods.ts` | 单文件耦合函数目录、组件目录、旧 blueprint/page-design 语义 | `core@knowledge` 模块函数 + 参数荷载 provider |

核心问题不是目录摆放，而是真相来源被分散：函数定义、目录、常量、FC 名称、模块提示词、prompt 文案分别维护同一个 action 或模块语义，任何一层都可能丢失或滞后。

### 2.1 当前源码关系审计

这次按实际 import 和 action 字符串核对后，当前关系可归纳为四层，而不是简单的 core/page-design 两层：

```text
packages/spark-ai/src/core
  注册机: stills/dispatcher.ts, stills/domain.ts, knowledge/payload-provider-registry.ts
  运行时: function-call-schema.ts, fc-dispatcher.ts, session/*, orchestration/*
  运行时内省: knowledge/knowledge-functions.ts

packages/spark-ai/src/stills
  组合门面: 对外导出 core 能力，并按场景装配 core meta + page-design domain

packages/spark-ai/src/business/page-design
  业务域: prompt / payload provider / lifecycle / nodeTree / dataset / textModel / edit session

packages/spark-ai/src/catalog
  catalog 投影: 默认组件目录与 StillsCatalog 会话注入
```

当前依赖方向：

- `core/**` 没有直接 import `business/page-design/**`，也未在源码中出现 `pageDesign@`、`r-table`、`DataKey`、`script.js`、`SparkNode` 等业务关键字。
- `business/page-design/**` 依赖 core 的协议和运行时：`StillDefinition`、`IStillSession`、`DomainProvider`、`runStillsLoop`、FC schema、repeat monitor、follow-up policy、knowledge payload provider API。
- `packages/spark-ai/src/stills/index.ts` 同时 import core 与 page-design，它是场景装配/公共门面，不应再被理解为 core 内核。
- `catalog/stills-session.ts` 负责把默认组件 catalog 投影放入 session，支撑 page-design payload provider 查询组件荷载。

因此，真正的架构边界应是：

```text
core = 注册机 + 运行时 + 注册事实读模型
stills = 组合门面 / installer
business/page-design = 业务语义与运行时适配
catalog = 组件目录投影来源
```

这里的 `core@knowledge` 不是“知识库层”，而是 **registry read model**：它只能把已注册函数和已注册 payload provider 投影给模型，不能成为第二套业务目录。

### 2.2 本轮已收敛的边界点

| 边界点 | 收敛结果 | 说明 |
|--------|----------|------|
| `IStillSession.catalog` 绑定具体 `StillsCatalog` | 已从 `core/stills/types.ts` 与 `core/stills/domain.ts` 移除 | core session 只保留 `patchLog` 与 `domains`；page-design payload provider 自己持有组件目录投影。 |
| `src/stills/meta-methods.ts` 暴露 `page-design.component` | 已迁入 `core/stills/meta-methods.ts`，并改为通用 `queryPayloads({ category, keyword })` 入口提示 | `core@session@describe` 不再知道任何业务 payloadRef。 |
| page-design host 反向 import `../../stills` 门面 | 已新增 `business/page-design/register-edit-stills.ts`，host 改为直接使用 core 注册机与本业务注册入口 | 避免 business -> facade -> business 的装配环。 |
| page-design import `core/knowledge/knowledge-functions` 的 still 对象 | 已改为业务本地协议动作字符串，不再引用 concrete still definition | 业务 follow-up 只描述协议动作，不绑定 core implementation object。 |
| `business/index.ts` re-export `../stills` | 已移除，business barrel 只导出 page-design 业务入口 | 公共 facade 继续存在，但业务层不再通过 barrel 反向导出 facade。 |
| `core/knowledge/json-schema-inference.ts` 通用 helper | 保留在 core | 仅用于通用 TypeScript type text -> JSON Schema 推断；一旦出现组件专用规则，立即下沉到 page-design payload provider。 |

至此，core 与 page-design 的代码层物理分离完成：core 不依赖 page-design，page-design 不依赖公共 stills facade，只依赖 core 注册机/运行时协议。

---

## 3. 核心决策

| # | 决策 | 说明 |
|---|------|------|
| D1 | **core 零业务语义** | core 不知道 page-design 的节点树、数据集、组件类型、编辑流程；catalog 具体形状也不应长期留在 core session 协议里。 |
| D2 | **统一 `业务@模块@函数`** | 模块是分组，函数才是 Agent tool；禁止恢复旧 `datasetTool.*` / `sparkNodeTree.*` / `knowledge.*` dot 地址。 |
| D3 | **函数定义行为 SSoT** | `StillDefinition.action` 或 catalog row 的 `action` 是唯一事实来源；不再建立 action 常量层。 |
| D4 | **FC 名称派生** | `actionToFunctionName` 从 action 派生 FC 名称；`functionNameToAction` 优先通过 registry 反查。 |
| D5 | **`core@knowledge` 只是注册事实读模型** | 函数目录、函数指南只能来自 Still registry；payload 查询只能来自 provider registry，不允许再引入工具 provider 第二事实源。 |
| D6 | **payload 与 function 分线** | 函数说明解决“调用什么”；payload provider 只解决“嵌套 JSON 参数如何构造”。 |
| D7 | **prompt 分层** | core 只保留 L1/L2 协议纪律；page-design 编辑规则进入业务 prompt。 |
| D8 | **repeat monitor 策略注入** | core 只保留重复检测状态机；业务域提供只读判断、失败 key 和 follow-up 文案。 |
| D9 | **历史别名动作强切** | 历史别名动作不注册、不兼容，统一由 `core@knowledge` 标准动作承载。 |
| D10 | **模块提示词挂在函数定义上** | `StillDefinition.modulePrompt` 是模块提示词 SSoT；同一 `业务@模块` 下应保持一致，由 `core@knowledge` 聚合为 `modules[]`，不新增模块注册器。 |

---

## 4. 分层边界

### 4.1 Core 允许知道

- still 协议：`StillDefinition`、`IStillSession`、`DomainProvider`、`StillResult`。
- 注册器：action registry、domain registry、payload provider registry。
- 运行时：FC schema 生成、FC dispatch、session backend、session orchestrator。
- 注册事实读模型：`queryFunctions`、`guideFunction`、`queryPayloads`、`guidePayload`，只能读取 registry/provider registry。
- 通用监控算法：重复签名、连续错误、循环检测、只读上限。

### 4.2 Core 禁止知道

- `pageDesign@nodeTree@*`、`pageDesign@dataset@*`、`pageDesign@textModel@*` 等业务函数地址。
- `r-table`、`r-form`、组件替换策略、组件 catalog 细节。
- DataSet 建模规则、DataKey 规则、script.js 沙箱规则、UI 组装 SOP。
- page-design 四文件编辑流程和业务 follow-up 文案。
- 具体 `StillsCatalog` / component catalog 结构；core session 不应长期承担业务 catalog 容器。

### 4.3 Business 应承担

- 业务函数定义：函数 action、参数 schema、usageRules、failureModes、example。
- 模块提示词：通过 `StillDefinition.modulePrompt` 描述同一 `业务@模块` 的调用边界和业务纪律。
- 参数荷载来源：例如 `page-design.component` payload 的查询和 schema 指南。
- 业务 prompt：编辑时序、数据优先策略、script.js 边界、组件构造 SOP。
- 业务 repeat 策略：只读函数判断、重复失败资源 key、用户可读 follow-up。

---

## 5. 函数寻址

### 5.1 标准格式

```text
业务@模块@函数
```

地址必须正好三段。缺段、多段、空段都应 fail-fast。

### 5.2 当前核心地址

| 地址 | 语义 |
|------|------|
| `queryFunctions` | 查询当前会话可用函数目录 |
| `guideFunction` | 查询单个函数调用指南 |
| `queryPayloads` | 查询参数荷载目录 |
| `guidePayload` | 查询单个参数荷载 JSON Schema 指南 |
| `core@session@describe` | 查询会话状态 |
| `core@interaction@ask` | 向用户发起澄清问题 |

### 5.3 当前 page-design 地址

| 模块 | 示例函数 |
|------|----------|
| `pageDesign@lifecycle@bootstrap` | 绑定 live NodeTree/DataSet/text model 编辑上下文 |
| `pageDesign@nodeTree@addNode` | 写入 SparkNode |
| `pageDesign@nodeTree@listChildren` | 查询节点子级 |
| `pageDesign@dataset@createTable` | 创建 DataSet 表 |
| `pageDesign@dataset@updateTable` | 更新表语义元数据 |
| `pageDesign@textModel@writeScript` | 写入 `script.js` 文本模型 |

### 5.4 SSoT 规则

禁止新增这些中间真相层：

- `ACTION_*` 常量文件。
- `action-addresses.ts` / `meta-action-addresses.ts` 这类地址映射文件。
- 从目录名、模块名或函数名反推出 action 再当作事实。

允许的派生关系只有：

```text
函数定义行 action/modulePrompt -> registry -> Knowledge 目录/指南 -> FC function name/description
```

---

## 6. core@knowledge 模块

`knowledge` 本身就是 `core` 业务下的模块，不是新的业务域，也不是旧 capabilities / actionSpec / catalog 的兼容层。

函数事实和模块提示词事实源只有 Still registry：

```text
StillDefinition.action + StillDefinition.modulePrompt -> core@knowledge 查询投影
```

参数荷载 provider 只补充嵌套 JSON 构造知识，不允许注册、覆盖或解释函数 action。

### 6.1 四类查询

| 动作 | 返回内容 |
|------|----------|
| `queryFunctions` | 当前会话可用函数列表，包含 `modules[]` 模块提示词聚合，以及 `business`、`module`、`function`、`functionName`、描述和摘要参数 |
| `guideFunction` | 单个函数的完整参数 schema、结果 schema、usageRules、failureModes、example、`modulePrompt` |
| `queryPayloads` | 当前业务域下可构造的嵌套 payload 类型列表 |
| `guidePayload` | 某个 payload 的 JSON Schema、最小示例、约束和失败模式 |

旧动作全部删除，不提供 alias：

| 删除动作类型 | 现行动作 |
|----------|--------|
| 历史函数目录查询别名 | `queryFunctions` |
| 历史函数指南查询别名 | `guideFunction` |
| 历史 payload 目录查询别名 | `queryPayloads` |
| 历史 payload 指南查询别名 | `guidePayload` |

### 6.2 函数目录投影

函数目录来自 `StillDefinition`，core 只做结构投影，不理解业务函数本身，也不接受额外工具 provider。模块提示词同样来自 `StillDefinition.modulePrompt`，按 `business@module` 聚合，不建立独立模块注册表。

```ts
interface KnowledgeToolSummary {
  action: string
  business: string
  module: string
  function: string
  functionName: string
  type: 'request' | 'describe'
  description: string
  modulePrompt?: string
  params?: Record<string, unknown>
  example?: Record<string, unknown>
  rules?: string[]
  failureCodes?: string[]
}

interface KnowledgeModuleSummary {
  business: string
  module: string
  prompt: string
  toolCount: number
  actions: string[]
}
```

### 6.3 模块提示词投影

`modulePrompt` 解决“进入这个模块前必须遵守什么纪律”，不替代单个函数的 `description`、`usageRules` 或参数 schema。

当前约束：

- `modulePrompt` 挂在 `StillDefinition`，由业务域在构造运行时 still 时填写。
- 同一 `business@module` 下的 `modulePrompt` 应保持一致；`queryFunctions` 取聚合后的第一条非空提示作为 `modules[].prompt`。
- `guideFunction` 返回目标函数自身的 `modulePrompt`，便于模型在查看单函数指南时仍能看到模块级约束。
- `stillToToolDefinition` 会把 `modulePrompt` 注入 FC function description，格式为 `模块提示: ...`，确保不显式查询 knowledge 时模型仍能看到模块边界。
- 禁止新增 `module-registry.ts` 或类似第二事实源；模块只是 action 地址的第二段，提示词事实仍从函数定义行进入 registry。

### 6.4 参数荷载目录

payload 不是 Vue 组件专用概念，而是函数参数里的嵌套 JSON 构造知识。

第一阶段 provider：`business/page-design/payloads/component-payload-provider.ts`。

```json
{
  "payloadRef": "page-design.component",
  "key": "r-table"
}
```

返回重点是可直接用于构造 `pageDesign@nodeTree@addNode` 的 `params.node`：

```json
{
  "type": "object",
  "required": ["type", "props"],
  "properties": {
    "type": { "const": "r-table" },
    "props": {
      "type": "object",
      "required": ["dataKey"],
      "properties": {
        "dataKey": { "type": "string" },
        "highlightCurrentRow": { "type": "boolean" }
      }
    },
    "children": { "type": "array" }
  }
}
```

---

## 7. 目录结构

```text
packages/spark-ai/src/core/
  knowledge/
    types.ts
    registry.ts
    query-actions.ts
    payload-schema.ts
  stills/
    types.ts
    dispatcher.ts
    domain.ts
    meta-methods.ts
    register-core-stills.ts
    llm-params-validator.ts
    stills-prompts.ts
  session/
    repeat-detection-monitor.ts
    session-backend.ts
    session-contracts.ts
  function-call-schema.ts
  fc-dispatcher.ts

packages/spark-ai/src/stills/
  index.ts

packages/spark-ai/src/catalog/
  stills-session.ts
  catalog-projections.ts

packages/spark-ai/src/business/page-design/
  register-edit-stills.ts
  payloads/
    component-payload-provider.ts
  prompts/
    edit-runtime-prompt.ts
    edit-flow-prompts.ts
  stills/
    lifecycle/
    text-model/
    dataset/
    node-tree/
    edit/
```

说明：

- `core/knowledge` 是 registry read model，不含业务数据；payload provider API 属于 core，payload provider 实现属于业务域。
- `src/stills` 是组合门面/installer，不是 core 内核；它只转调 core 与业务域注册入口，不承载业务事实源。
- `catalog/stills-session.ts` 保留兼容入口；组件目录不再注入 core session，改由 page-design payload provider 持有。
- `business/page-design/stills/*/tool-catalog.ts` 的文件名沿用历史命名，但语义上 catalog row 定义的是“模块内函数”。
- `business/page-design/payloads` 注册参数荷载 provider，不负责替代 stills registry。

---

## 8. Prompt 拆分

### 8.1 Core prompt

`core/stills/stills-prompts.ts` 只保留 `STILLS_PROTOCOL_BASE`：

```text
L1: Function Calling 协议纪律
L2: Knowledge 能力发现纪律
```

core prompt 禁止出现 DataSet、SparkNodeTree、DataKey、script.js、组件 type、业务编辑时序。

### 8.2 Page-design prompt

`business/page-design/prompts/edit-runtime-prompt.ts` 负责：

- 四文件编辑模式。
- `core@knowledge@*` 查询纪律。
- `业务@模块@函数` 语义说明。
- `pageDesign@nodeTree@*`、`pageDesign@dataset@*`、`pageDesign@textModel@*` 调用规则。
- DataKey 与 script.js 沙箱规则。
- 数据优先 edit-flow 约束。

---

## 9. Repeat Detection

core repeat monitor 保留状态机算法，业务判断通过策略注入：

```ts
interface RepeatDetectionConfig {
  isReadOnlyAction?(action: string): boolean
  getRepeatedFailureKey?(action: string, params: unknown, result: StillResult): string | null
  buildCycleFollowUp?(context: RepeatCycleContext): string
  buildReadOnlyLimitFollowUp?(context: RepeatReadOnlyContext): string
  buildRepeatedFailureFollowUp?(context: RepeatFailureContext): string
}
```

page-design 在 `page-model-edit-session.ts` 注入自身策略：

- 只读函数判断从 `EDIT_STILLS` 派生。
- payload 查询和函数指南相关失败构造成业务可读 follow-up。
- follow-up 使用“函数目录/函数指南”术语。

---

## 10. 注册时序

```text
registerEditStills()
  -> registerDomain(editDomain)
    -> Domain registry 记录 edit state 工厂
    -> Still registry 注册 pageDesign lifecycle/text-model/dataset/node-tree/edit stills
  -> KnowledgePayloadRegistry.register(pageDesignComponentPayloadProvider)
  -> registerAll(metaStills)
    -> queryFunctions / guideFunction / queryPayloads / guidePayload
    -> core@session@describe / core@interaction@ask
```

注册表职责：

- Still registry：实际可执行函数。
- Domain registry：会话 state 工厂；`registerDomain()` 同步把 domain.stills 写入 Still registry。
- Payload provider registry：只注册参数荷载 provider。

`core@knowledge` 查询读取 Still registry 与 payload provider，但不成为新的 action 真相源。

`src/stills/index.ts` 的职责是 installer/facade：

- `registerAllStills()` 只注册 core meta stills。
- `registerEditStills()` 只转调 `business/page-design/register-edit-stills.ts`。
- 对外透传 core dispatcher/domain 类型和运行能力，方便旧调用方迁移。

禁止把 `src/stills/index.ts` 当成新的业务层；新增业务域应提供自己的注册入口，再由门面按场景组合。

---

## 11. 已完成的迁移结果

- 新增 `core/knowledge/knowledge-query-types.ts`、`payload-provider-registry.ts`、`knowledge-functions.ts`、`json-schema-inference.ts`。
- 新增 page-design payload provider，位置为 `business/page-design/payloads`。
- core prompt 收敛为 `STILLS_PROTOCOL_BASE`。
- page-design edit runtime prompt 迁入 `business/page-design/prompts`。
- `core/stills/action-names.ts` 已删除。
- 临时的 action 地址常量文件已删除。
- page-design lifecycle/text-model/dataset/node-tree action 已迁移到 `pageDesign@模块@函数`。
- `knowledge` 已收口为 `core@knowledge` 模块。
- `StillDefinition` 已新增 `modulePrompt` 字段，作为模块提示词唯一事实源。
- `queryFunctions` 已返回 `modules[]` 聚合视图，`guideFunction` 已返回单函数 `modulePrompt`。
- FC function description 已注入 `模块提示: ...`，无需新增模块注册器。
- core 模块 `knowledge/session/interaction` 与 page-design 模块 `lifecycle/nodeTree/dataset/textModel` 已补齐模块提示词。
- repeat monitor 已策略化，core 不再硬编码 page-design action。
- edit-domain 不注册 dataset export/aggregate 这类隐藏函数；协议目录仍保留参数事实。
- `IStillSession.catalog` 已移除，core session 不再持有具体组件目录。
- `core@session@describe` 已迁入 core，并只返回通用 knowledge discovery 入口。
- page-design edit 注册入口已下沉为 `business/page-design/register-edit-stills.ts`。
- page-design 运行时已停止依赖 `../../stills` 公共门面。
- page-design follow-up 已停止 import `core/knowledge/knowledge-functions` 的 concrete still 对象。

---

## 12. 验证口径

本重构以真实链路验证为主，单测为辅助。

### 12.1 必须证明

- 编辑会话中可调用 `queryFunctions` 获取函数目录。
- `queryFunctions` 返回的 `modules[]` 必须按 `business@module` 聚合模块提示词，并覆盖 core/pageDesign 当前注册模块。
- 可调用 `guideFunction` 获取 `pageDesign@nodeTree@addNode` 等函数的完整指南。
- `guideFunction` 返回的函数指南必须包含对应 `modulePrompt`。
- 可调用 `queryPayloads` 查询 `page-design.component` payload 目录。
- 可调用 `guidePayload` 获取 `r-table` 等 payload 的 JSON Schema 指南。
- FC function name 能从 `业务@模块@函数` 派生，并能反查回 canonical action。
- FC function description 必须包含 `模块提示`，保证模型在仅看 FC tool schema 时也能读取模块约束。
- 历史别名动作不再注册。

### 12.2 当前聚焦验证

```text
npx vitest run tests/catalog-query-strict.test.ts tests/tool-calling-schema-generation.test.ts tests/stills-action-spec-component-example.test.ts tests/spark-node-tree-tool-catalog.test.ts tests/dataset-tool-protocol-contract.test.ts tests/edit-domain-fine-grained.test.ts --reporter verbose
```

模块提示词专项验证：

```text
npx vitest run tests/tool-calling-schema-generation.test.ts tests/catalog-query-strict.test.ts tests/ai-chat-widget-persistence.test.ts --reporter verbose
pnpm run typecheck
```

该切片覆盖：

- Knowledge 查询强切和 payload provider。
- FC schema 与 `functionNameToAction` 映射。
- `modules[]` 模块提示词聚合、`guideFunction.modulePrompt` 和 FC description 注入。
- node-tree / dataset 模块函数目录。
- edit-domain 隐藏函数和四文件 live model 绑定。

---

## 13. 风险与约束

| 风险 | 缓解 |
|------|------|
| 旧 prompt/test 仍引用 dot action | 按真实业务入口逐个迁移，不恢复兼容 alias |
| action 常量层回流 | code review 检查：action 只能出现在函数定义行或旧动作删除断言里 |
| `core@knowledge` 重新变成旧工具体系 | 函数知识只从 Still registry 投影；payload provider 不能提供函数目录或函数指南 |
| 模块提示词再次分散 | `modulePrompt` 只允许从 `StillDefinition` 进入 registry；`modules[]` 只能由 `core@knowledge` 聚合生成，不维护独立模块表 |
| core prompt 再次吸收业务规则 | core prompt 只允许协议纪律，业务 prompt 在业务域维护 |
| 隐藏函数被暴露给对话侧 | edit-domain 注册阶段过滤，catalog/protocol 测试覆盖 |
| `src/stills` 门面继续膨胀为业务中心 | 门面只做 installer/re-export；业务注册、prompt、payload provider 留在业务域 |
| core session 重新持有具体 catalog 类型 | 测试断言 `IStillSession` 实例不含 `catalog` 字段；业务 payload provider 持有自身目录投影 |
| `core@session@describe` 暴露固定业务 payloadRef | 只能返回 provider registry 入口提示，不写死 `page-design.component` |

---

## 14. 非目标

本 DM 不要求本轮同时完成：

- 改造后端 API。
- 改造 Vue 渲染器或组件 catalog 生成器。
- 变更 DataSet / DataView 运行时语义。
- 保留旧 FC 动作 alias。
- 为旧 core 业务导出提供兼容层。

---

## 15. 最终结构

```text
                 core
            registry / dispatcher / domain / FC / session / orchestration
                   |                         |
                   |                         v
                   |              core@knowledge read model
                   |        queryFunctions / guideFunction / queryPayloads / guidePayload
                   v                         |
              registered function facts          v
                   |                registered payload providers
                   v                         |
              business/page-design --------------+
          lifecycle / nodeTree / dataset / textModel / prompts / payloads
                   ^
                   |
              src/stills installer facade
             registerAllStills / registerEditStills
```

核心原则：**core 负责机制，business 负责语义；函数定义行是 action 的唯一事实来源。**
