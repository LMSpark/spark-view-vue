# Module Semantic Protocol — 原理与最小实现

模块语义协议 (`@spark-view/spark-ai/module-semantic`) 是一套**领域无关**的协议层,让 LLM 能在任意业务模块拓扑上做属性读写和动作执行。

协议本身**不持有任何业务数据、不做任何编排**。学校/年级/班级/学生 是一种拓扑,学校/教师/学科 是另一种 — 协议对二者一视同仁。

---

## 1. 设计哲学

### 1.1 协议只做三件事

```
1. 声明  ← 业务方注册 ModuleKind(模块类型形状)
2. 派生  ← 协议自动派生 6 个 LLM 工具规约
3. 路由  ← LLM 调工具时,把"路径 + 名字 + 参数"翻译成 Capability 调用
```

### 1.2 协议不做的事

| 不做 | 由谁负责 |
|---|---|
| 工作流编排、焦点维护、上下文/草稿 | LLM 自己 |
| 事前校验拦截、自动重试、自动回滚 | LLM 看 `OperationResult.checks` 决定 |
| 反向查询、级联导航 | LLM 通过多轮 `listChildren` 探索 |
| 权限判断、幂等保证 | Capability handler 自己 |
| 业务数据存储 | Capability 实现自管 |

### 1.3 错误反馈,不抛异常

所有 Capability 方法返回 `OperationResult`:

```ts
{
  ok: false,
  checks: [
    { level: 'error', code: 'NOT_FOUND', message: '该班级不存在', hint: '可调用 listChildren 查看可用班级' }
  ]
}
```

LLM 看到信息后**自行决定**:重试 / 换路径 / 询问用户 / 放弃。协议是诚实搬运工,不替 LLM 决策。

---

## 2. 三层模型

### 2.1 ModuleKind(设计期,纯元数据)

声明一种业务模块的形状。**进程内每种 kind 一份,启动后冻结**。

```ts
import { ModuleKindBase } from '@spark-view/spark-ai/module-semantic'

export class SchoolModuleKind extends ModuleKindBase {
  constructor() {
    super({
      kind: 'school',
      name: '学校',
      description: '一所学校',
      attributes: [
        { name: 'name', description: '校名', schema: { type: 'string' }, readable: true, writable: true },
        { name: 'address', description: '地址', schema: { type: 'string' }, readable: true, writable: true },
      ],
      actions: [
        {
          name: 'archive',
          description: '归档学校(不再接收新生)',
          paramsSchema: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] },
          usageRules: [
            '归档前先用 listChildren 确认下属年级/教师是否全部清空',
            '归档动作不可逆,确认后才调用',
          ],
          failureModes: [
            { code: 'SCHOOL_HAS_CHILDREN', when: '学校下仍存在年级/教师', fix: '先 archive 子节点' },
          ],
        },
      ],
      children: ['grade', 'teacher'],
    })
  }
}
```

### 2.2 ModulePath(运行期,值对象)

LLM 每次调工具都显式传**完整路径**。协议**不维护路径状态**。

```
语法:/<kind>[<id>]/<kind>[<id>]/...
例子:/school[jianguo]/grade[g3]/student[zs]
根路径:/
```

只允许精确 id。查询(根据 label/属性找 id)必须先调 `findInstance` 工具。

含环路径合法 — `/teacher[t1]/class[c2]/teacher[t1]` 协议照常路由,死循环由 handler 通过 `checks` 反馈。

### 2.3 Capability(业务能力契约)

每种 ModuleKind 对应**一个 Capability 实现**(kind 级单例),通过 `PathContext.segment.id` 区分实例。

```ts
import { ModuleCapability, type ModulePathContext, ok, fail, errorCheck } from '@spark-view/spark-ai/module-semantic'

export class SchoolCapability extends ModuleCapability {
  public readonly kind = 'school'

  private readonly schools = new Map<string, { name: string; address: string }>([
    ['jianguo', { name: '建国学校', address: '北京' }],
  ])

  async getAttribute(ctx: ModulePathContext, attrName: string) {
    const school = this.schools.get(ctx.segment.id)
    if (school === undefined) {
      return fail([errorCheck('SCHOOL_NOT_FOUND', `学校 ${ctx.segment.id} 不存在`)])
    }
    if (attrName === 'name') return ok(school.name)
    if (attrName === 'address') return ok(school.address)
    return fail([errorCheck('UNKNOWN_ATTR', `未知属性 ${attrName}`)])
  }

  async setAttribute(ctx: ModulePathContext, attrName: string, value: unknown) {
    const school = this.schools.get(ctx.segment.id)
    if (school === undefined) {
      return fail([errorCheck('SCHOOL_NOT_FOUND', `学校 ${ctx.segment.id} 不存在`)])
    }
    if (typeof value !== 'string') {
      return fail([errorCheck('INVALID_VALUE', '值必须是字符串')])
    }
    if (attrName === 'name') { school.name = value; return ok() }
    if (attrName === 'address') { school.address = value; return ok() }
    return fail([errorCheck('UNKNOWN_ATTR', `未知属性 ${attrName}`)])
  }

  async invokeAction(ctx, actionName, args) {
    if (actionName === 'archive') {
      this.schools.delete(ctx.segment.id)
      return ok({ archived: true, reason: args['reason'] })
    }
    return fail([errorCheck('UNKNOWN_ACTION', `未知动作 ${actionName}`)])
  }

  async listChildren(ctx, childKind) {
    // 返回学校下的年级 / 教师列表
    if (childKind === 'grade' || childKind === undefined) {
      return ok([{ id: 'g1', label: '一年级' }, { id: 'g3', label: '三年级' }])
    }
    return ok([])
  }

  async findInstance(ctx, childKind, query) {
    // 根级 ctx.segment.id === '' 时,query 用来匹配学校
    // 非根 ctx.segment.id !== '' 时,在该学校下找子实例
    if (ctx.segment.id === '' && childKind === 'school') {
      const name = query['name']
      if (typeof name === 'string') {
        const matched = [...this.schools.entries()]
          .filter(([, s]) => s.name.includes(name))
          .map(([id, s]) => ({ id, label: s.name }))
        return ok(matched)
      }
    }
    return ok([])
  }

  async resolveChild(ctx, childKind, childId) {
    // 验证某学校下是否有指定年级 / 教师
    if (childKind === 'grade') {
      return ok(['g1', 'g3'].includes(childId))
    }
    return ok(false)
  }
}
```

---

## 3. 协议派生的 6 个 LLM 工具

业务方**只声明 ModuleKind + 实现 Capability**,协议从注册表自动派生:

| 工具名 | 参数 | 路由到 |
|---|---|---|
| `getAttribute` | path, attrName | `Capability.getAttribute(ctx, attrName)` |
| `setAttribute` | path, attrName, value | `Capability.setAttribute(ctx, attrName, value)` |
| `invokeAction` | path, actionName, args | `Capability.invokeAction(ctx, actionName, args)` |
| `listChildren` | path, childKind? | 根→所有 kind / 非根→`Capability.listChildren` |
| `findInstance` | path, childKind, query | `Capability.findInstance(ctx, childKind, query)` |
| `describeKind` | kind | 返回 ModuleKind 元数据,不走 Capability |

工具数量**与业务 kind 数无关** — 注册 100 个 kind 也只有 6 个工具,LLM 通过 `describeKind` 二次探索每个 kind 的属性/动作。

---

## 4. 最小可运行实现

### 4.1 注册 + 启动

```ts
import { ModuleSemanticRuntime, ModulePath } from '@spark-view/spark-ai/module-semantic'

const runtime = new ModuleSemanticRuntime()

// 1. 注册 ModuleKind
runtime.registerKind(new SchoolModuleKind())
runtime.registerKind(new GradeModuleKind())

// 2. 注册 Capability
runtime.registerCapability(new SchoolCapability())
runtime.registerCapability(new GradeCapability())

// 3. 把工具规约喂给 LLM
const tools = runtime.getLlmTools()
// tools 是 6 条 ModuleSemanticToolSpec,description 里嵌入了所有 kind 摘要
```

### 4.2 LLM 调工具(典型链路)

```ts
// 第 1 轮 - LLM 发现:listChildren("/") 看注册了哪些 kind
await runtime.executeTool('listChildren', { path: '/' })
// → ok: true, data: [{ id: 'school', label: '学校' }, ...]

// 第 2 轮 - LLM 描述:describeKind('school') 了解学校能做什么
await runtime.executeTool('describeKind', { kind: 'school' })
// → ok: true, data: { attributes: [...], actions: [...], children: ['grade', 'teacher'] }

// 第 3 轮 - LLM 查找:按名字找学校
await runtime.executeTool('findInstance', { path: '/', childKind: 'school', query: { name: '建国' } })
// → ok: true, data: [{ id: 'jianguo', label: '建国学校' }]

// 第 4 轮 - LLM 拼路径,改属性
await runtime.executeTool('setAttribute', {
  path: '/school[jianguo]',
  attrName: 'name',
  value: '建国实验学校',
})
// → ok: true

// 第 5 轮 - LLM 调动作
await runtime.executeTool('invokeAction', {
  path: '/school[jianguo]',
  actionName: 'archive',
  args: { reason: '合并到新校区' },
})
// → ok: true, data: { archived: true, reason: '合并到新校区' }
```

### 4.3 直接调用(测试 / 程序化)

```ts
const path = ModulePath.parse('/school[jianguo]/grade[g3]')
const result = await runtime.getAttribute(path, 'name')
```

---

## 5. 路径遍历(协议如何路由)

```
LLM 调 setAttribute('/school[jianguo]/grade[g3]', 'name', '三年级A')
     ↓
ModuleSemanticRuntime.executeTool
     ↓
路由到 AttributeAccessor.set
     ↓
ModuleNavigator.navigate(path) 逐段验证:
  1. school 已注册? grade 已注册? Capability 都齐? → 是
  2. SchoolCap.resolveChild(schoolCtx, 'grade', 'g3') → ok(true)
     (问 SchoolCap:"建国学校下有 g3 年级吗?")
     ↓
末段 = grade[g3],末段 Capability = GradeCap
     ↓
查 ModuleKind.attributes 找 'name' 声明 → writable=true
     ↓
GradeCap.setAttribute(gradeCtx, 'name', '三年级A')
     ↓
返回 OperationResult,协议透传给 LLM
```

任一段失败立即停止并产生错误码:

- `PATH_EMPTY` — 根路径不能用于属性/动作
- `KIND_NOT_REGISTERED` — 路径上某 kind 未注册
- `CAPABILITY_NOT_REGISTERED` — kind 已注册但 Capability 没绑
- `PATH_INVALID` — 父 Capability 说子实例不存在
- `RESOLVE_ERROR` — resolveChild 自身返回 ok=false
- `ATTRIBUTE_NOT_DECLARED` / `ATTRIBUTE_NOT_READABLE` / `ATTRIBUTE_NOT_WRITABLE`
- `ACTION_NOT_DECLARED` / `INVALID_ARGS`
- `CHILD_KIND_NOT_DECLARED` — findInstance 时,目标 kind 不在父段 children 中

---

## 6. 含环图怎么处理

ModuleInstance 用 `(kind, instanceId)` 全局指代同一对象 — 同一所学校从 `/school[jianguo]/teacher[t1]/school[jianguo]` 到达,与从 `/school[jianguo]` 直接到达,**指向同一份业务对象**(由 Capability 内部解释)。

路径只是"如何到达"的指令,不是 instance 属性。协议照常路由,**不在协议层做死循环检测** — handler 自己根据 `ctx.segments` 判断"自己是不是已经在路径上出现过",通过 `checks: [{ code: 'CYCLE_DETECTED', ... }]` 反馈给 LLM。

---

## 7. 关键约束(给协议消费者)

1. **Capability 是 kind 级单例**,通过 `ctx.segment.id` 区分具体实例,业务方在自己内部决定存储/缓存策略。
2. **Capability.resolveChild 是路径验证的唯一窗口**:协议遍历到某段时,询问父 Capability"我下面有这个子吗",父 Capability 必须诚实回答 ok(true|false)。
3. **属性值校验由 Capability 自己做**:协议只校验"是否声明 + 是否 readable/writable"。动作参数走 paramsSchema 做 AJV 协议级预校验。
4. **任何业务错误用 OperationResult.checks 反馈**:协议不会自动重试、自动跳路径、自动询问用户 — LLM 全权决策。
5. **业务方不直接生成 LLM 工具**:工具集由协议从所有注册的 ModuleKind 派生。新增模块时,只需注册 ModuleKind + Capability,LLM 立即可见。

---

## 8. 不做向后兼容

- **协议层 6 个工具固定**,业务方不能新增协议级工具。需要更高抽象的工具,用 invokeAction 暴露。
- **路径只支持精确 id**,查询走 findInstance,不接受路径段里的查询语法。
- **不支持事务、批量、流式**,这些是更高层的事,由 LLM 编排多次调用实现。

---

## 9. 文件地图

```
src/module-semantic/
├── protocol/                     # 对外契约
│   ├── operation-result.ts       # OperationResult / CheckEntry
│   ├── module-kind.ts            # ModuleKind / AttributeSchema / ActionSchema
│   ├── module-path.ts            # ModulePath 值对象
│   ├── capability.ts             # ModuleCapability 抽象基类
│   └── index.ts                  # 协议层公共导出
├── internal/                     # 内部实现
│   ├── module-kind-registry.ts
│   ├── capability-registry.ts
│   ├── module-navigator.ts       # 路径逐段验证
│   ├── attribute-accessor.ts     # get/set 属性
│   ├── action-invoker.ts         # 动作调用 + AJV 校验
│   ├── navigator.ts              # listChildren / findInstance / describeKind
│   └── protocol-tool-generator.ts # 派生 6 个 LLM 工具规约
├── runtime/
│   └── module-semantic-runtime.ts # 组合根
├── host/                         # host 适配层(对接旧 AiHostBusinessRuntime)
│   ├── module-semantic-business-runtime.ts # 协议→host 路由 + session 维护
│   ├── module-semantic-session-store.ts    # session/history/lifecycle 表
│   ├── module-semantic-tool-codec.ts       # 6 工具规约→AiHostTransportToolSpec
│   └── index.ts
└── index.ts                      # 公共 subpath 入口
```

---

## 10. host 适配层使用方法

协议本身是无状态的(参见 §2.2 / §7)。要把它挂到现有 SSE / 工具循环 host 上,通过 host 适配层(`@spark-view/spark-ai/module-semantic` 重导出的 `ModuleSemanticBusinessRuntime` 等)实现:

```ts
import {
  ModuleSemanticRuntime,
  ModuleSemanticBusinessRuntime,
} from '@spark-view/spark-ai/module-semantic'

// 1. 装配协议运行时
const runtime = new ModuleSemanticRuntime()
runtime.registerKind(new NodeTreeModuleKind())
runtime.registerCapability(new NodeTreeCapability({
  service: pageDesignService,
  contextFactory: (ctx) => ({ pageId: ctx.segment.id, requestId: ctx.requestId }),
}))

// 2. 包装成 AiHostBusinessRuntime 契约的实例
const business = new ModuleSemanticBusinessRuntime({
  moduleId: 'page-design-node-tree',
  name: 'Page design node tree',
  description: '页面节点树读写(节点协议参考实现)',
  runtime,
})

// 3. 注入到 AiHostBusinessRegistry,旧 host 即可调度
// host.registry.register(business)
```

适配层做四件事:

| 适配项 | 实现 |
|---|---|
| `startSession` | 调 `runtime.getLlmTools()` 投影 6 工具规约并落到 session store |
| `executeFunctionCall` | host 的 `action` 字符串(协议工具名)+ `args` → `runtime.executeTool` |
| 协议无状态 | `ModuleSemanticSessionStore` 在适配层维护 message / functionCall history |
| 失败映射 | `OperationResult.checks[0]` → `{ ok:false, code, msg, fix }`(走 host 旧 failure 形态) |

LLM 调用形态(与协议视图一致,且与旧 host 复用同一 SSE / tool-loop 链路):

```jsonc
// LLM 选 invokeAction:
{
  "name": "invokeAction",
  "args": {
    "path": "/node-tree[demo-page]",
    "actionName": "getNode",
    "args": { "componentId": "page__0" }
  }
}
```

参考实现:`packages/spark-page-config/src/assistant/registrations/page-design/module-semantic/` —— `NodeTreeModuleKind` 19 个动作的最小声明 + `NodeTreeCapability` 一行委托 `service.useNodeTreeMethod`。

