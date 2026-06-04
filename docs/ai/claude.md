下面这份方案，我按你今天讨论出来的最终方向收束：**不重新造 Agent OS，而是把你已有的 TS VCM meta 升级成“低代码 VCM Agent Runtime”**。核心依据是：你已经有 `queryModules / queryFunctions / guideFunction / describeKind / findInstance / get / set / invoke` 这一套自发现、自调用、自修复协议；外部方案里也反复强调“渐进揭示 + hint 导航”“Capability-First + execute 收口”“不要手写第二份描述”，这些都和你现有路线高度一致。  

---

# 低代码 VCM Agent Runtime 完整方案

## 一、核心结论

你现在真正要做的不是重新设计：

```text
Model → Contract → Capability → Agent
```

而是基于你已经生成的 **TS VCM meta**，做一个更短、更稳、更贴近工程落地的链路：

```text
VCM Meta
  ↓
Capability Index
  ↓
Command
  ↓
VCM Runtime
  ↓
Result / Repair / Retry
```

也就是说：

```text
VCM Meta = 系统有什么
Capability Index = 系统能做什么
Command = 本次要做什么
VCM Runtime = 真正怎么做
```

你的协议本质已经具备 Agent OS 的四个核心能力：

```text
可发现：queryModules / describeKind
可理解：queryFunctions / guideFunction
可定位：findInstance / listChildren
可执行：get / set / invokeAction
可修复：ok:false + code/msg/fix/checks
```

所以第一阶段不要搞复杂 Agent Tree，不要搞厚重 Contract Plane，也不要让 LLM 直接操作全量 JSON 树。

你的第一目标应该是：

```text
用户自然语言
  ↓
检索 VCM Capability
  ↓
生成标准 Command
  ↓
调用 VCM Runtime
  ↓
失败按 fix/checks 自动修复
```

---

# 二、你的现有协议重新命名

你开头给我的协议可以整理成五层。

## 1. Kind Layer：类型树

例如：

```text
pageDesign
 ├─ lifecycle
 ├─ dataset
 ├─ node-tree
 ├─ text-model
 └─ payload-catalog
```

对应能力：

```ts
queryModules()
describeKind(kindID)
listChildren(path)
```

它回答：

```text
系统里有哪些东西？
这些东西是什么结构？
它们有哪些子节点？
```

这就是你的 **VCM Kind Tree**。

---

## 2. Instance Layer：实例树

例如：

```text
/pageDesign[leave-demo]
/pageDesign[leave-demo]/dataset[leave-demo]
/pageDesign[leave-demo]/node-tree[leave-demo]
/pageDesign[leave-demo]/text-model[leave-demo]
```

对应能力：

```ts
findInstance(parentPath, kindID, query)
listChildren(instancePath)
get(instancePath)
set(instancePath, payload)
```

它回答：

```text
我要操作哪一个实例？
这个实例在哪？
当前值是什么？
怎么写入？
```

这解决了你最开始卡住的 **子模型、子子模型定位问题**。

重点是：

```text
子模型不是字段
子模型是带 parentPath 的实例节点
```

所以不要让 AI 直接改：

```json
{
  "pageDesign": {
    "dataset": {
      ...
    }
  }
}
```

而是让 AI 生成：

```json
{
  "path": "/pageDesign[leave-demo]/dataset[leave-demo]",
  "action": "set",
  "payload": {}
}
```

---

## 3. Function Layer：函数注册表

例如：

```ts
queryFunctions(kindID)
guideFunction(functionID)
invokeAction(instancePath, actionCode, payload)
```

它回答：

```text
这个节点能干什么？
每个动作参数是什么？
执行前需要注意什么？
失败后怎么修？
```

这就是你现在 TS VCM meta 最有价值的部分。

---

## 4. Guide Layer：调用指南层

你原来已经有：

```text
guideFunction
guidePayload
queryPayloads
ok:false 按 code/msg/fix/checks 重试
```

这一层非常关键。

普通 Function Calling 只有：

```text
name
description
parameters
```

但你的 VCM 应该多一层：

```text
怎么调用？
常见错误是什么？
失败后怎么修？
成功标准是什么？
```

所以每个函数最好有：

```ts
interface VcmFunctionGuide {
  functionCode: string
  purpose: string
  whenToUse: string[]
  whenNotToUse?: string[]
  inputSchema: JsonSchema
  outputSchema?: JsonSchema
  preconditions?: string[]
  checks?: string[]
  fixRules?: VcmFixRule[]
  examples?: VcmCallExample[]
}
```

这会让 LLM 不只是“会调用”，而是“能纠错”。

---

## 5. Runtime Layer：执行层

最终所有调用都应该收口成一个统一命令：

```ts
interface VcmCommand {
  commandId: string
  path: string
  action: string
  payload?: any
  mode?: 'get' | 'set' | 'invoke'
  expectedVersion?: number
  source: 'llm' | 'user' | 'system'
}
```

然后统一执行：

```ts
executeVcmCommand(command)
```

所有权限、校验、日志、回滚、重试都在这里做。

---

# 三、总体架构

建议最终架构如下：

```text
┌────────────────────────────────────────────┐
│ 用户自然语言                                │
│ “帮我创建 leave-demo 页面，并配置数据集”      │
└─────────────────────┬──────────────────────┘
                      ↓
┌────────────────────────────────────────────┐
│ Intent Parser / LLM                         │
│ 理解用户想做什么                             │
└─────────────────────┬──────────────────────┘
                      ↓
┌────────────────────────────────────────────┐
│ Capability Index                            │
│ 从 VCM meta 编译出来                         │
│ 负责召回：pageDesign.create / dataset.set    │
└─────────────────────┬──────────────────────┘
                      ↓
┌────────────────────────────────────────────┐
│ Guide Layer                                 │
│ guideFunction / guidePayload / checks        │
│ 告诉 LLM 参数怎么填、失败怎么修               │
└─────────────────────┬──────────────────────┘
                      ↓
┌────────────────────────────────────────────┐
│ Command Builder                             │
│ 生成 VcmCommand                              │
│ path + action + payload                      │
└─────────────────────┬──────────────────────┘
                      ↓
┌────────────────────────────────────────────┐
│ VCM Runtime Executor                         │
│ findInstance / get / set / invokeAction       │
│ 权限、校验、审计、重试、回滚                  │
└─────────────────────┬──────────────────────┘
                      ↓
┌────────────────────────────────────────────┐
│ Result / Repair                             │
│ ok:true 返回结果                              │
│ ok:false 按 fix/checks 自动修复               │
└────────────────────────────────────────────┘
```

这套比纯 Agent Tree 更落地。

因为它不是让 LLM 自由规划，而是让 LLM 在你的 VCM 协议里受控行动。

---

# 四、核心抽象

## 1. VCM Meta

这是你现在已经生成的基础数据。

建议结构：

```ts
interface VcmKindMeta {
  kindID: string
  title: string
  description?: string

  parentKindID?: string
  children?: VcmChildMeta[]

  attrs?: VcmAttrMeta[]
  actions?: VcmActionMeta[]

  pathPattern?: string
  instanceKeyFields?: string[]

  guides?: {
    describe?: string
    create?: string
    update?: string
    delete?: string
    query?: string
  }
}
```

示例：

```ts
const pageDesignKind: VcmKindMeta = {
  kindID: 'pageDesign',
  title: '页面设计',
  description: '负责页面生命周期、数据集、节点树、文本模型等设计内容',
  children: [
    { kindID: 'lifecycle', title: '生命周期' },
    { kindID: 'dataset', title: '页面数据集' },
    { kindID: 'node-tree', title: '节点树' },
    { kindID: 'text-model', title: '脚本与样式' },
    { kindID: 'payload-catalog', title: '组件载荷目录' }
  ],
  pathPattern: '/pageDesign[{pageId}]'
}
```

---

## 2. Capability Meta

Capability 不要手写。

它应该由 VCM meta 自动编译出来。

```ts
interface VcmCapability {
  id: string
  title: string
  description: string

  kindID: string
  action: string

  intentExamples: string[]

  pathPattern: string

  inputSchema: JsonSchema

  execute: {
    type: 'vcm'
    mode: 'get' | 'set' | 'invoke'
    actionCode?: string
  }

  policy?: {
    permissionCode?: string
    confirmRequired?: boolean
    riskLevel?: 'low' | 'medium' | 'high'
  }

  repair?: {
    retryable: boolean
    guideFunction?: string
    fixRules?: VcmFixRule[]
  }
}
```

例如：

```ts
const createPageDesignCapability: VcmCapability = {
  id: 'pageDesign.lifecycle.describeDesignFlow',
  title: '描述页面设计流程',
  description: '根据用户意图生成页面设计流程说明',
  kindID: 'lifecycle',
  action: 'describeDesignFlow',
  intentExamples: [
    '帮我设计一个页面',
    '创建 leave-demo 页面',
    '根据需求生成页面设计流程'
  ],
  pathPattern: '/pageDesign[{pageId}]/lifecycle[{pageId}]',
  inputSchema: {
    type: 'object',
    required: ['intent'],
    properties: {
      intent: {
        type: 'string',
        description: '用户原始需求'
      }
    }
  },
  execute: {
    type: 'vcm',
    mode: 'invoke',
    actionCode: 'describeDesignFlow'
  },
  repair: {
    retryable: true,
    guideFunction: 'guideFunction'
  }
}
```

---

## 3. Command

Command 是运行时真正执行的对象。

```ts
interface VcmCommand {
  commandId: string
  capabilityId: string

  path: string
  mode: 'get' | 'set' | 'invoke'
  action?: string

  payload?: any

  expectedVersion?: number

  context: {
    businessInstanceId?: string
    pageId?: string
    userIntent?: string
    traceId: string
  }
}
```

示例：

```json
{
  "commandId": "cmd_001",
  "capabilityId": "pageDesign.lifecycle.describeDesignFlow",
  "path": "/pageDesign[leave-demo]/lifecycle[leave-demo]",
  "mode": "invoke",
  "action": "describeDesignFlow",
  "payload": {
    "intent": "创建一个请假申请页面"
  },
  "context": {
    "businessInstanceId": "leave-demo",
    "pageId": "leave-demo",
    "userIntent": "创建一个请假申请页面",
    "traceId": "trace_001"
  }
}
```

---

## 4. Result

所有 VCM Runtime 返回都必须标准化。

```ts
interface VcmResult<T = any> {
  ok: boolean
  data?: T

  code?: string
  msg?: string

  fix?: {
    reason: string
    suggestion: string
    nextAction?: string
    patchPayload?: any
  }

  checks?: VcmCheck[]

  trace?: {
    commandId: string
    path: string
    action?: string
    durationMs?: number
  }
}
```

失败示例：

```json
{
  "ok": false,
  "code": "MISSING_REQUIRED_FIELD",
  "msg": "dataset 缺少 fields 配置",
  "fix": {
    "reason": "页面数据集必须声明字段列表",
    "suggestion": "请补充 fields 数组",
    "patchPayload": {
      "fields": []
    }
  },
  "checks": [
    {
      "name": "dataset.fields.required",
      "passed": false,
      "message": "fields 不能为空"
    }
  ]
}
```

然后 LLM 根据 `fix/checks` 重试。

这点很重要，因为它让你的系统不是一次性 Function Calling，而是：

```text
调用
↓
校验失败
↓
拿到 fix
↓
修复 payload
↓
重试
```

这就是你说的“错了还反指南”。

---

# 五、运行流程

以你之前的 pageDesign 协议为例。

用户说：

```text
帮我创建 leave-demo 请假申请页面
```

## Step 1：定位根实例

```ts
findInstance("/", "pageDesign", { id: "leave-demo" })
```

如果不存在，则创建或初始化：

```ts
invokeAction("/", "createInstance", {
  kindID: "pageDesign",
  id: "leave-demo"
})
```

最终得到：

```text
/pageDesign[leave-demo]
```

---

## Step 2：进入 lifecycle

```text
/pageDesign[leave-demo]/lifecycle[leave-demo]
```

调用：

```ts
invokeAction(
  "/pageDesign[leave-demo]/lifecycle[leave-demo]",
  "describeProgress",
  {}
)
```

再调用：

```ts
invokeAction(
  "/pageDesign[leave-demo]/lifecycle[leave-demo]",
  "describeDesignFlow",
  {
    intent: "帮我创建 leave-demo 请假申请页面"
  }
)
```

---

## Step 3：查询所需能力

根据设计流程，LLM 可能需要：

```text
dataset
node-tree
payload-catalog
text-model
```

于是调用：

```ts
queryModules("pageDesign")
queryFunctions("dataset")
queryFunctions("node-tree")
guideFunction("dataset.set")
```

---

## Step 4：写入 dataset

```ts
set(
  "/pageDesign[leave-demo]/dataset[leave-demo]",
  {
    mainTable: "leave_request",
    fields: [
      { name: "applicant", title: "申请人", type: "string" },
      { name: "startDate", title: "开始日期", type: "date" },
      { name: "endDate", title: "结束日期", type: "date" },
      { name: "reason", title: "请假原因", type: "text" }
    ]
  }
)
```

---

## Step 5：写入 node-tree

```ts
set(
  "/pageDesign[leave-demo]/node-tree[leave-demo]",
  {
    root: {
      type: "form",
      children: [
        { type: "input", field: "applicant" },
        { type: "dateRange", fields: ["startDate", "endDate"] },
        { type: "textarea", field: "reason" },
        { type: "button", action: "submit" }
      ]
    }
  }
)
```

---

## Step 6：写入 text-model

```ts
set(
  "/pageDesign[leave-demo]/text-model[leave-demo]",
  {
    script: "",
    style: ""
  }
)
```

---

## Step 7：失败修复

如果 node-tree 返回：

```json
{
  "ok": false,
  "code": "INVALID_COMPONENT_PROP",
  "msg": "dateRange 组件不支持 fields 属性",
  "fix": {
    "suggestion": "请使用 startField 和 endField"
  }
}
```

LLM 不应该重新猜，而应该根据 fix 修：

```ts
set(
  "/pageDesign[leave-demo]/node-tree[leave-demo]",
  {
    root: {
      type: "form",
      children: [
        { type: "input", field: "applicant" },
        {
          type: "dateRange",
          startField: "startDate",
          endField: "endDate"
        },
        { type: "textarea", field: "reason" },
        { type: "button", action: "submit" }
      ]
    }
  }
)
```

---

# 六、子模型 / 子子模型的最终解决方案

你最开始卡住的是子模型和子子模型。

最终方案是：

```text
子模型不作为字段处理
子模型作为实例节点处理
```

每一级都必须有：

```text
kindID
instanceId / businessKey
parentPath
instancePath
actions
attrs
children
```

例如：

```text
/pageDesign[leave-demo]
  ├─ /lifecycle[leave-demo]
  ├─ /dataset[leave-demo]
  ├─ /node-tree[leave-demo]
  ├─ /text-model[leave-demo]
  └─ /payload-catalog[leave-demo]
```

如果以后有更深层：

```text
/pageDesign[leave-demo]/node-tree[leave-demo]/component[root]/component[field_applicant]
```

也一样处理：

```json
{
  "path": "/pageDesign[leave-demo]/node-tree[leave-demo]/component[field_applicant]",
  "action": "setProps",
  "payload": {
    "label": "申请人",
    "required": true
  }
}
```

不要让 LLM 输出整棵树覆盖。

只让它输出：

```text
路径 + 动作 + 载荷
```

也就是：

```ts
type Operation = {
  path: string
  action: string
  payload: any
}
```

---

# 七、VCM Path 标准

建议你把路径标准化。

## 1. 基础格式

```text
/kind[id]/childKind[id]/grandChildKind[id]
```

例如：

```text
/pageDesign[leave-demo]/dataset[leave-demo]
```

## 2. 支持语义选择器

```text
/order[@orderNo=1001]/package[2]/ticket[@title=退款问题]
```

## 3. 支持临时 ID

用于创建过程：

```text
/pageDesign[leave-demo]/node-tree[leave-demo]/component[$new]
```

## 4. 支持路径解析

提供：

```ts
resolvePath(path: string): ResolvedInstance
```

返回：

```ts
interface ResolvedInstance {
  ok: boolean
  path: string
  kindID: string
  instanceId: string
  parentPath?: string
  candidates?: any[]
}
```

如果匹配多个：

```json
{
  "ok": false,
  "code": "AMBIGUOUS_INSTANCE",
  "msg": "找到多个同名组件",
  "candidates": [
    { "path": "...", "title": "申请人输入框" },
    { "path": "...", "title": "审批人输入框" }
  ]
}
```

这时必须让用户或 LLM 消歧，不能乱改。Resolver 必须负责把语义路径解析成真实实例，并且多义时返回候选；这也是外部方案里反复强调的安全边界。

---

# 八、Capability Index 生成规则

你不需要手写 Capability。

由 VCM meta 自动编译。

## 规则 1：每个 action 生成一个 capability

```text
kindID + actionCode = capabilityId
```

例如：

```text
pageDesign.lifecycle.describeDesignFlow
pageDesign.dataset.set
pageDesign.node-tree.set
pageDesign.payload-catalog.queryPayloads
```

---

## 规则 2：每个 capability 继承函数 schema

```ts
capability.inputSchema = functionMeta.paramsSchema
```

---

## 规则 3：每个 capability 自动生成 intent

来源优先级：

```text
1. action.description
2. action.title
3. kind.title + action.title
4. guideFunction 里的 examples
5. 离线 LLM 补充 examples
```

例如：

```ts
{
  id: "pageDesign.dataset.set",
  title: "设置页面数据集",
  intentExamples: [
    "给页面配置数据源",
    "设置请假页面的数据模型",
    "绑定页面字段",
    "生成页面 dataset"
  ]
}
```

---

## 规则 4：Capability 不直接执行，必须生成 Command

Capability 是索引和契约。

真正执行的是：

```ts
executeCommand(command)
```

这样可以收口：

```text
权限
校验
审计
重试
版本
回滚
```

---

# 九、与 Function Calling 的关系

你现在应该把 Function Calling 作为 **能力暴露格式**，而不是最终执行接口。

关系是：

```text
VCM Meta
  ↓
Capability
  ↓
Function Calling Schema
  ↓
LLM 填参
  ↓
Command
  ↓
VCM Runtime
```

也就是说：

```text
Function Calling = LLM 调用入口
VCM Runtime = 真正执行入口
```

不要让 LLM 直接拥有一万个工具。

应该：

```text
先 queryCapabilities(intent)
返回 Top-K

再 queryFunction(capabilityId)
返回精确 schema

再 execute(command)
```

这和外部方案里“不要一次把所有模型/工具塞给 LLM，按需召回 Top-K”的建议一致。

---

# 十、Agent Tree 的位置

你现在第一阶段不要做真正的 Agent Tree。

先做：

```text
Capability Runtime
```

等能力多了以后，再自然聚合成 Agent：

```text
PageDesignAgent
  ├─ lifecycle.*
  ├─ dataset.*
  ├─ node-tree.*
  ├─ text-model.*
  └─ payload-catalog.*
```

这时 Agent 只是：

```text
一组 capability + 一段领域提示词 + 一个执行上下文
```

不要一开始就搞多 Agent 协作。

因为外部方案也明确提醒：多步事务、多 Agent 协作是复杂度爆炸点，第一、二阶段最有价值，后面要被真实业务拉动。

---

# 十一、最小可落地版本

建议你先实现 3 个文件。

## 1. `meta-to-capability.ts`

负责把 VCM meta 编译成 capability。

```ts
export function buildCapabilities(meta: VcmMeta): VcmCapability[] {
  const capabilities: VcmCapability[] = []

  for (const kind of meta.kinds) {
    for (const action of kind.actions ?? []) {
      capabilities.push({
        id: `${kind.kindID}.${action.code}`,
        title: action.title ?? action.code,
        description: action.description ?? `${kind.title} - ${action.title}`,
        kindID: kind.kindID,
        action: action.code,
        intentExamples: buildIntentExamples(kind, action),
        pathPattern: action.pathPattern ?? kind.pathPattern,
        inputSchema: action.inputSchema,
        execute: {
          type: 'vcm',
          mode: action.mode ?? 'invoke',
          actionCode: action.code
        },
        policy: {
          permissionCode: action.permissionCode,
          confirmRequired: action.confirmRequired ?? false,
          riskLevel: inferRiskLevel(action)
        },
        repair: {
          retryable: true,
          guideFunction: action.guideFunction
        }
      })
    }
  }

  return capabilities
}
```

---

## 2. `capability-search.ts`

先不用向量库，第一版用关键词 + title + examples 匹配。

```ts
export function searchCapabilities(
  capabilities: VcmCapability[],
  intent: string,
  limit = 5
): VcmCapability[] {
  return capabilities
    .map(cap => ({
      cap,
      score: scoreCapability(cap, intent)
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.cap)
}
```

后续再换成 embedding。

---

## 3. `execute-command.ts`

```ts
export async function executeCommand(
  command: VcmCommand,
  runtime: VcmRuntime
): Promise<VcmResult> {
  const resolved = await runtime.resolvePath(command.path)

  if (!resolved.ok) {
    return {
      ok: false,
      code: resolved.code ?? 'PATH_RESOLVE_FAILED',
      msg: resolved.msg ?? '实例路径解析失败',
      fix: resolved.fix
    }
  }

  if (command.mode === 'get') {
    return runtime.get(command.path)
  }

  if (command.mode === 'set') {
    return runtime.set(command.path, command.payload)
  }

  if (command.mode === 'invoke') {
    return runtime.invokeAction(
      command.path,
      command.action!,
      command.payload
    )
  }

  return {
    ok: false,
    code: 'UNKNOWN_COMMAND_MODE',
    msg: `未知命令模式：${command.mode}`
  }
}
```

---

# 十二、完整执行闭环

```ts
async function runVcmAgent(userIntent: string, context: VcmContext) {
  const caps = searchCapabilities(context.capabilities, userIntent)

  const selected = await llmSelectCapability(userIntent, caps)

  const guide = await context.runtime.guideFunction(selected.id)

  const payload = await llmBuildPayload({
    userIntent,
    capability: selected,
    guide
  })

  const path = renderPath(selected.pathPattern, context)

  const command: VcmCommand = {
    commandId: createId(),
    capabilityId: selected.id,
    path,
    mode: selected.execute.mode,
    action: selected.execute.actionCode,
    payload,
    context: {
      businessInstanceId: context.businessInstanceId,
      pageId: context.pageId,
      userIntent,
      traceId: context.traceId
    }
  }

  let result = await executeCommand(command, context.runtime)

  if (!result.ok && result.fix) {
    const repairedPayload = await llmRepairPayload({
      originalPayload: payload,
      error: result,
      guide
    })

    result = await executeCommand(
      {
        ...command,
        commandId: createId(),
        payload: repairedPayload
      },
      context.runtime
    )
  }

  return result
}
```

这就是你第一版 Agent Runtime。

不是 PPT，而是能直接编码。

---

# 十三、阶段路线

## 第一阶段：VCM Meta → Capability

目标：

```text
现有 meta 能编译成 capability
```

产出：

```text
meta-to-capability.ts
capability-search.ts
Capability Registry
```

先支持：

```text
pageDesign.lifecycle.*
pageDesign.dataset.*
pageDesign.node-tree.*
```

---

## 第二阶段：Capability → Command → Runtime

目标：

```text
自然语言能触发单步 VCM 调用
```

产出：

```text
execute-command.ts
标准 VcmCommand
标准 VcmResult
ok:false 修复机制
```

跑通案例：

```text
帮我创建 leave-demo 页面
帮我给 leave-demo 配置 dataset
帮我给页面添加一个表单节点
```

---

## 第三阶段：多步任务

目标：

```text
一句话生成多个 command
```

例如：

```text
创建请假页面，包含数据集、表单、提交按钮
```

生成：

```text
1. lifecycle.describeDesignFlow
2. dataset.set
3. payload-catalog.queryPayloads
4. node-tree.set
5. text-model.set
```

注意：这个阶段不要搞复杂多 Agent。

只做：

```text
Command Plan
```

例如：

```ts
interface VcmPlan {
  planId: string
  steps: VcmCommand[]
  rollback?: VcmCommand[]
}
```

---

## 第四阶段：领域 Agent

目标：

```text
PageDesignAgent
FormDesignAgent
WorkflowAgent
PermissionAgent
```

但本质仍然是 capability 分组。

```ts
interface VcmAgent {
  id: string
  title: string
  capabilityScope: string[]
  systemPrompt: string
}
```

Agent 不直接干活。

Agent 只负责：

```text
选择 capability
生成 command
调用 runtime
处理失败
```

---

# 十四、风险控制

## 1. 不要让 LLM 直接写数据库

必须经过：

```text
Command → Runtime → Validator
```

---

## 2. 不要让 LLM 直接维护 instanceId

LLM 只写：

```text
path / selector / businessKey
```

系统解析成真实实例。

---

## 3. 不要把所有 function 一次性塞给 LLM

必须：

```text
queryCapabilities Top-K
再 queryFunction 精确 schema
```

---

## 4. 不要手写第二份 Contract

你的唯一来源应该是：

```text
TS VCM meta
```

如果以后 Java 也接进来，则是：

```text
Java Annotation / TS VCM Meta
  ↓
统一 VCM Meta
  ↓
Capability
```

---

## 5. 不要一开始做复杂 Agent Tree

第一阶段的目标是：

```text
自然语言 → 单步能力 → 执行成功
```

这个跑通以后再说多步。

---

# 十五、最终形态

你这套最终不是普通低代码，也不是普通 Agent。

它应该叫：

```text
VCM Agent Runtime
```

完整结构：

```text
┌────────────────────────────────────┐
│ User Intent                         │
└──────────────────┬─────────────────┘
                   ↓
┌────────────────────────────────────┐
│ Capability Index                    │
│ 由 VCM Meta 自动生成                 │
└──────────────────┬─────────────────┘
                   ↓
┌────────────────────────────────────┐
│ Guide Layer                         │
│ guideFunction / guidePayload / checks│
└──────────────────┬─────────────────┘
                   ↓
┌────────────────────────────────────┐
│ Command Builder                     │
│ path + action + payload              │
└──────────────────┬─────────────────┘
                   ↓
┌────────────────────────────────────┐
│ VCM Runtime                         │
│ findInstance/get/set/invoke          │
└──────────────────┬─────────────────┘
                   ↓
┌────────────────────────────────────┐
│ Result / Fix / Retry                 │
│ ok:false → fix/checks → retry        │
└────────────────────────────────────┘
```

一句话总结：

```text
你的 TS VCM meta 已经是 Agent Runtime 的底座。

现在要做的不是重新设计 Agent OS，
而是把 meta 编译成 capability，
把 capability 编译成 command，
再用 VCM Runtime 受控执行。
```

这个方案最有价值的地方在于：

```text
不推翻现有架构
不额外手写 DSL
不让 LLM 失控
不一开始追求多 Agent
```

先把：

```text
VCM Meta → Capability → Command → Runtime
```

这个闭环打通。

这就是你现在最短、最稳、最能证明 AI 能力的路线。
