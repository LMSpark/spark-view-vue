# Agent Workflow 业务工厂权威说明

> 状态：2026-06-19。本文是 SPARK Agent Workflow / 业务工厂的唯一权威文件。其它同主题研究稿、计划稿、速查清单不再保留独立口径。
>
> 对齐选择：主口径对齐 Dify。原因是 Dify 的 Workflow、Chatflow、Node、Tool Node、published app / API / MCP 暴露方式最接近当前目标；扣子只作为旁证，不再形成第二套术语。
>
> 基本原则：只做适配，不造新概念。SPARK 内部字段可以存在，但必须解释成 Dify 概念的本地适配。

## 1. 对齐依据

本文采用下面这些 Dify 公开概念作为外部参照：

| Dify 概念 | 官方口径 | SPARK 适配 |
| --------- | -------- | ---------- |
| Workflow | 单次从输入到输出的可重复流程，用可视化节点编排模型、工具和逻辑 | `app.mode = "workflow"` + `design.json.workflow.graph` |
| Chatflow | 每轮对话触发的 workflow，带聊天输入、上下文和多轮交互 | `app.mode = "chatflow"`；知识体系反问能力的目标形态 |
| Node | workflow 画布上的可执行或控制单元 | `workflow.graph.nodes[*]` |
| Tool Node | 连接外部服务和 API 的节点 | ClassModel JSON 工具节点 |
| Start / User Input | workflow 的输入入口 | 工单输入、页面表单、Host Run 请求 |
| Human Input / conversation turn | 人机补充信息、确认、澄清 | 当前 `human_question`；目标为独立 Chatflow |
| Output | workflow 的输出结果 | 运行结果、交付回执、`agent_complete` 摘要 |
| Published app as Tool | 发布后的 workflow / chatflow 可被 API、工具或外部系统调用 | `definition.json` / `AgentWorkflowDefinition` 成为新的可编排能力单元 |

参考链接：

- Dify Workflow & Chatflow: https://docs.dify.ai/en/use-dify/build/workflow-chatflow
- Dify Tool Node: https://docs.dify.ai/en/use-dify/nodes/tools.md
- Dify node orchestration: https://docs.dify.ai/en/use-dify/build/orchestrate-node.md
- Dify Workflow API: https://docs.dify.ai/api-reference/workflows/run-workflow.md
- Dify Workflow as Tool: https://docs.dify.ai/en/develop-plugin/features-and-specs/advanced-development/reverse-invocation-tool.md

## 2. 一句话定义

业务工厂就是一个已发布的 Agent Workflow。

```text
ClassModel JSON = 最小能力单元，对齐 Dify Tool Node
Workflow = 单次任务编排，对 ClassModel / LLM / 条件 / 子 workflow 等节点编排
Chatflow = 多轮对话编排，用来处理反问、澄清、确认和上下文积累
definition.json = 发布后的 workflow / chatflow，可继续作为新能力单元被其它 workflow 编排
```

因此：

- 最小能力单元不是 Registration。
- 最小能力单元不是 `process-stage`。
- 最小能力单元不是 `ensureXxxBusiness()`。
- 最小能力单元是已经 JSON 化的 ClassModel。
- Chatflow 不是 workflow 的附属说明，它是独立 app mode 和独立可编排能力。
- `definition.json` 全面替代注册表达业务工厂。
- 当前 Registration / Host / binding 只能是运行时按 `definition.json` 派生出来的执行对象。

## 3. 术语总表

| 统一术语 | 禁止替代说法 | SPARK 实值 |
| -------- | ------------ | ---------- |
| Workflow | 工艺流程、注册体系、能力生产线 | `design.json.workflow.graph` |
| Chatflow | 聊天细节、反问工具、小助手 | `app.mode = "chatflow"` 的独立 definition |
| Node | 步、阶段、F0-F9 节点 | `workflow.graph.nodes[*]` |
| Tool Node | 能力成品、工具包、Registration | ClassModel JSON + `ClassModelRuntime` |
| Published App | 发布产物、能力成品 | `definition.json` / `AgentWorkflowDefinition` |
| Published App as Tool | 业务工厂嵌套、复合能力 | 已发布 workflow / chatflow definition 被其它节点引用 |
| Extension Metadata | 新概念、新协议 | `x_spark` 内部扩展字段 |
| Runtime Binding | 生产注册、Host adapter | definition 到当前 Host / Registration 的绑定 |

“业务工厂”这个词只作为产品/业务命名使用；技术含义必须等价于 Published App。Published App 可以是 Workflow，也可以是 Chatflow。

## 4. 数据流

唯一数据流如下：

```text
ClassModel 源码
  -> generated/dts-class-model/**/*.json
  -> Workflow / Chatflow Designer
  -> design.json
       app
       workflow.graph
       workflow.variables
       x_spark
  -> publish
  -> definition.json / AgentWorkflowDefinition
  -> runtime binding
  -> run / delivery
```

规则：

1. 设计器只编辑 `design.json`。
2. 发布器只从 `design.json` 生成 `definition.json`。
3. 运行时只读取 `definition.json`。
4. Host / Registration / Delivery 不能反向定义 workflow 结构。
5. `x_spark` 只能放适配元数据，不能引入一套外部不可理解的 workflow 概念。

## 5. `design.json` 结构

`design.json` 对齐 Dify app + workflow graph。`app.mode` 可以是 `workflow` 或 `chatflow`；当前业务工厂主线先落 `workflow`，知识反问能力目标态应落 `chatflow`。推荐结构：

```json
{
  "kind": "agent.workflow.design",
  "version": 1,
  "id": "pageDesign",
  "app": {
    "id": "pageDesign",
    "name": "页面设计",
    "mode": "workflow"
  },
  "workflow": {
    "id": "pageDesign",
    "version": 1,
    "variables": [],
    "graph": {
      "nodes": [],
      "edges": [],
      "viewport": { "x": 0, "y": 0, "zoom": 1 }
    }
  },
  "x_spark": {
    "process": {},
    "factory": {},
    "validation": {}
  }
}
```

字段含义：

| 字段 | Dify 对齐 | SPARK 约束 |
| ---- | --------- | ---------- |
| `app` | workflow / chatflow app 元信息 | 只放名称、模式、说明，不放运行实例 |
| `workflow.variables` | workflow 变量 | 表达输入、节点输出、中间变量 |
| `workflow.graph.nodes` | workflow nodes | 表达可执行节点或控制节点 |
| `workflow.graph.edges` | 节点连线 | 表达数据流或控制流 |
| `x_spark.process` | 内部业务阶段说明 | 只能做视图/说明，不是最小能力单元 |
| `x_spark.factory` | 内部发布元数据 | F0-F9 只在这里做分组，不能画成主 workflow 概念 |
| `x_spark.validation` | 发布前校验结果 | 只记录 blocker / warning |

## 6. 节点模型

节点必须按通用 workflow 节点理解：

| Node 类型 | 用途 | SPARK 当前或目标适配 |
| --------- | ---- | ------------------- |
| `start` / `user-input` | workflow 输入入口 | 工单输入、Host Run args |
| `tool` | 调用外部工具/API | ClassModel JSON 工具节点 |
| `llm` / `agent` | 模型推理或 agent 执行 | tool loop / prompt / guide |
| `condition` | 分支判断 | 后续按变量条件实现 |
| `code` | 局部代码转换 | 后续只允许安全、可序列化配置 |
| `workflow` | 调用已发布 workflow | 引用其它 `definition.json` |
| `chatflow` | 调用已发布 chatflow | 引用反问、澄清、确认等对话能力 definition |
| `output` / `end` | 输出结果 | summary、交付回执、run result |

`process-stage` 是当前设计器的业务步骤视图节点，只能临时承载 stage 展示。它不是 Dify 的 Tool Node，也不是最小能力单元。目标结构里，真正执行能力必须落到 `tool`、`workflow`、`chatflow`、`llm`、`condition` 等通用节点。

## 7. ClassModel Tool Node

ClassModel JSON 是 SPARK 的最小能力单元，对齐 Dify Tool Node。一个 ClassModel Tool Node 必须回答四件事：

| 配置项 | 含义 |
| ------ | ---- |
| `classModelRef` | 指向 `generated/dts-class-model` 中的 class / method / schema |
| `operation` | 要调用的 constructor、method、attribute read/write 或 `model_script` 边界 |
| `inputMapping` | workflow 变量或上游节点输出如何映射到函数参数 |
| `outputMapping` | 函数返回值如何写入 workflow 变量或下游输入 |

推荐形态：

```json
{
  "id": "node.create-table",
  "type": "tool",
  "data": {
    "provider": "class-model",
    "classModelRef": {
      "manifest": "generated/dts-class-model/manifest.json",
      "rootClassName": "ProjectModel",
      "className": "DataSetCrudTool",
      "operation": "createTable"
    },
    "inputMapping": {
      "tableName": "{{ start.tableName }}",
      "columns": "{{ node.extract-columns.output.columns }}"
    },
    "outputMapping": {
      "result": "dataset.createTableResult"
    }
  }
}
```

函数参数关联规则：

1. 参数名以 ClassModel JSON 的 `parameters[*].name` 为准。
2. 参数类型以 ClassModel JSON 的 type tree / `paramsSchema` 为准。
3. 节点输入只做变量映射，不手写函数签名。
4. 多参数函数在 UI 上按参数表单展示；超过 3 个业务参数时，代码层应优先用 options object，但 workflow 仍按 schema 映射。
5. 可选参数必须在 schema 和 UI 上标明默认值或空值策略。

构造函数规则：

| 场景 | 处理 |
| ---- | ---- |
| 业务根对象，如 `ProjectModel` | workflow 不调用 constructor，由运行时 binding 提供当前 working copy 实例 |
| 临时值对象 | 可作为 tool node 的 `operation: "constructor"`，参数仍从 ClassModel JSON 读取 |
| 需要外部资源的对象 | 不在 definition 里放实例、函数或连接；只放 `bindingRef`，由运行时注入 |
| 构造后继续调用方法 | 构造节点输出对象引用，下游 tool node 通过变量引用 |

关键边界：`definition.json` 里不能出现 class、函数、实例、闭包、editor、DeliveryPort。

## 8. Chatflow as Tool

Chatflow 必须从 Workflow 中分离出来，作为独立的对话能力单元。知识体系里的 `human_question` 是当前运行时反问工具，结构目标不是永远停留在一个内置 tool，而是沉淀为可发布、可复用、可编排的 Chatflow。

对齐关系：

| 现象 | 当前实现 | 目标形态 |
| ---- | -------- | -------- |
| 知识缺口反问 | `human_question({ context, reason, missingFacts, candidateOptions })` | `app.mode = "chatflow"` 的 clarification definition |
| 用户补充事实 | 聊天消息返回到当前 run | Chatflow 输出结构化变量，回写上游 workflow |
| 多轮澄清 | tool loop 内部继续问 | Chatflow 持有自己的 turn、memory、validation |
| 可复用反问模板 | 运行时 prompt 片段 | Published Chatflow as Tool，被多个 workflow 调用 |

推荐节点形态：

```json
{
  "id": "node.clarify-requirement",
  "type": "chatflow",
  "data": {
    "chatflowRef": {
      "workflowId": "spark.clarify-requirement",
      "version": 1
    },
    "inputMapping": {
      "context": "{{ start.requirement }}",
      "missingFacts": "{{ node.inspect-gaps.output.missingFacts }}",
      "candidateOptions": "{{ node.inspect-gaps.output.options }}"
    },
    "outputMapping": {
      "answers": "requirement.clarification.answers",
      "confirmedFacts": "requirement.clarification.confirmedFacts"
    }
  }
}
```

边界：

- Chatflow 负责问、答、确认、补齐上下文。
- Workflow 负责确定性编排和任务推进。
- ClassModel Tool Node 负责调用领域能力。
- `human_question` 只能视为当前兼容入口；新设计应沉淀为 Chatflow definition。

后续方向是自动化、工业化：从 schema 缺口、知识检索失败、参数不完整、验收 blocker 自动生成 Chatflow 反问节点；把高频反问沉淀成标准 Chatflow；再把这些 Chatflow 作为能力库节点参与更大的业务 workflow 编排。

## 9. Published App as Tool

发布后的 `definition.json` 是新的能力单元。它可以是 Workflow，也可以是 Chatflow；两者都可以继续参与其它 workflow 编排。

```text
workflow A
  node: class-model tool
  node: llm
  node: chatflow C       // C 是已发布反问 / 澄清 definition
  node: workflow B       // B 是已发布业务 definition
  node: output
```

引用规则：

| 配置项 | 含义 |
| ------ | ---- |
| `workflowRef` / `chatflowRef` | 被调用的 `definition.json` / workflowId / version |
| `inputMapping` | 当前 workflow 变量 -> 被调用 app 输入 |
| `outputMapping` | 被调用 app 输出 -> 当前 workflow 变量 |
| `bindingPolicy` | 运行时如何找到对应 engine / Host / tenant / project |

这样才能形成可复用、可嵌套的业务能力，而不是每个业务都写一套 `ensureXxxBusiness()`。

## 10. `definition.json` 结构

当前代码契约见 `packages/spark-ai/src/agent/workflow/agent-workflow-definition.ts`。已经落地的结构是：

```json
{
  "kind": "agent.workflow",
  "version": 1,
  "workflowId": "pageDesign",
  "source": {
    "designKind": "agent.workflow.design",
    "designId": "pageDesign",
    "designVersion": 1
  },
  "process": {},
  "factory": {},
  "x_spark": {
    "schema": "spark.agent.workflow.definition.v1",
    "publishedAt": "2026-06-19T00:00:00.000Z",
    "validation": {}
  }
}
```

解释：

| 字段 | 对齐含义 |
| ---- | -------- |
| `kind/version/workflowId/source` | published app 基本身份 |
| `process` | 当前业务阶段视图，服务设计器展示和验收说明 |
| `factory` | SPARK 内部发布元数据分组 |
| `x_spark` | schema、发布时间、校验结果 |

当前代码中的 `factory.identity/materials/knowledge/contract/runtime/governance/acceptance/activation/workOrder/delivery` 是内部 metadata section，不是 Dify 概念，不得画成主 workflow 节点，也不得在用户说明里包装成新体系。

## 11. 当前代码真值

| 层 | 文件 | 事实 |
| -- | ---- | ---- |
| 设计器页面 | `src/views/app/WorkflowDesigns.vue` | 编辑 workflow graph，当前支持 `process-stage` 视图节点和 definition 发布 |
| 前端服务 | `src/services/workflow-designs.ts` | 读写 `design.json`，从 `x_spark` 聚合 `AgentWorkflowDefinition` |
| 后端文件服务 | `spark-ai-server/src/main/java/com/spark/ai/service/WorkflowDesignService.java` | 创建、读取、覆盖、删除 `design.json`，读写 `definition.json` |
| definition 类型 | `packages/spark-ai/src/agent/workflow/agent-workflow-definition.ts` | 定义当前 `AgentWorkflowDefinition` JSON 契约 |
| definition 校验 | `packages/spark-ai/src/agent/workflow/agent-workflow-validation.ts` | 校验 kind/version/source/factory/x_spark |
| 运行时绑定 | `packages/spark-ai/src/agent/workflow/agent-workflow-dry-run.ts` | 当前只做 activation / dryRun 方向验证 |
| 当前 Host 对象 | `packages/spark-ai/src/agent/business/registration-types.ts` | Registration 是运行时对象，不是 workflow 定义 |
| ClassModel runtime | `packages/spark-ai/src/class-model/runtime/class-model-runtime.ts` | 执行 7 个 ClassModel 工具 |
| 当前反问入口 | `packages/spark-ai/src/class-model/tools/class-model-tool-specs.ts` | `human_question` 还是内置工具；目标态应上移为 Chatflow definition |

## 12. 运行时大方向判读

本轮只定结构形态，不做细节运行时。可走通的最低判断是：

```text
definition.json 存在
  -> validateAgentWorkflowDefinition()
  -> resolve runtime binding
  -> bind ClassModel runtime / Host object
  -> dryRun / run
```

当前只验收大方向：

- definition 是合法 JSON。
- workflowId 与 source.designId 一致。
- factory metadata section 齐全。
- 所有节点引用的 ClassModel / workflow / chatflow / binding 都能被解析。
- 不把运行时对象写回 design 或 definition。

不在本轮验收：

- LLM 是否产出最优答案。
- 每个 tool call 的详细重试策略。
- Delivery 是否真的保存。
- AG-UI timeline 细节。
- UI 表单全部字段完备度。

## 13. 新业务接入方式

接入新业务时，不再从 `ensureXxxBusiness()` 开始。按 Dify 工作流方式做：

1. 明确要发布的 workflow app。
2. 选择 ClassModel JSON 作为 Tool Node。
3. 配置 tool node 的参数映射。
4. 需要反问、澄清、确认时，引用或发布 Chatflow。
5. 需要复用已有能力时，引用已发布 workflow / chatflow。
6. 保存 `design.json`。
7. 发布 `definition.json`。
8. 运行时按 definition 做 binding。

Checklist：

| 检查项 | 必须回答 |
| ------ | -------- |
| Workflow app | 这个业务能力的 workflowId 是什么 |
| Input | 工单输入字段是什么，如何进入 workflow variables |
| Tool Node | 需要哪些 ClassModel JSON 方法 |
| Chatflow | 哪些反问、澄清、确认需要独立沉淀 |
| Parameter mapping | 每个函数参数从哪个变量来 |
| Constructor / instance | 是运行时注入 working copy，还是节点构造临时对象 |
| Output | 结果写入哪个变量，如何进入 summary / delivery |
| Published app reuse | 是否引用其它 workflow / chatflow `definition.json` |
| Runtime binding | 哪些外部对象只在运行时注入 |

## 14. 反概念清单

这些说法以后不要再用作定义：

| 错误说法 | 为什么错 | 正确说法 |
| -------- | -------- | -------- |
| 能力成品 | 空泛，看不出是 JSON、运行对象还是交付物 | Published App / `definition.json` |
| 业务工厂注册体系 | 把 registration 当定义源 | Agent Workflow 业务工厂 |
| Registration 表达业务工厂 | 运行对象反客为主 | `definition.json` 表达业务工厂 |
| Host adapter / legacy adapter | 混淆运行层和定义层 | Runtime binding |
| F0-F9 工作流 | 内部 section 被包装成外部概念 | `x_spark.factory` metadata sections |
| process-stage 是最小单元 | 把视图节点当能力节点 | ClassModel JSON Tool Node |
| 反问只是 tool loop 细节 | 把 Chatflow 能力埋掉，不能复用 | 独立 Chatflow definition |
| 业务能力定义 | 不清楚是设计稿还是发布态 | `design.json` 或 `definition.json` |
| 生产注册 | 把发布和注册混成一件事 | Publish definition，再 runtime binding |

## 15. 10 轮自检标准

每次改本文或相关设计器代码，按下面 10 轮过一遍：

1. 术语检查：是否主口径只对齐 Dify。
2. 最小单元检查：是否明确 ClassModel JSON = Tool Node。
3. 编排检查：是否把 workflow 说成节点编排，而不是注册流程。
4. 发布检查：是否明确 `definition.json` = Published App。
5. 复用检查：是否说明已发布 workflow / chatflow 可继续作为节点。
6. 参数检查：是否说明函数参数从 ClassModel JSON 和变量映射来。
7. 构造检查：是否区分 constructor 与运行时注入实例。
8. Chatflow 检查：是否把反问、澄清、确认沉淀为独立 Chatflow，而不是 tool loop 细节。
9. `process-stage` 检查：是否只作为当前 UI 视图节点。
10. `x_spark` / 反概念检查：是否只作为内部扩展 metadata，并删掉“能力成品、发布产物、注册体系、生产注册”等空泛或误导词。

## 16. 当前保留文件

同主题只保留本文。其它文档只能链接本文，不能再复制一套 Agent Workflow / 业务工厂概念。

允许保留的相关入口：

| 文件 | 角色 |
| ---- | ---- |
| `packages/spark-ai/docs/business-factory-workflow-zh-cn.md` | 唯一权威文件 |
| `packages/spark-ai/docs/README.md` | 文档索引，只能链接本文 |
| `knowledge/README.md` | 知识库索引，只能链接本文 |
| `packages/spark-ai/docs/spark-ai-platform.md` | 平台总览，不再独立定义业务工厂 |
