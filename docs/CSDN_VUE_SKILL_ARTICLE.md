# 把 .vue 组件变成 AI 可调用的"技能"：前端能力可调用化的工程实践

> **摘要**：当 AI Agent 成为软件系统的新型"用户"，传统 .vue 组件的封装范式正面临根本性挑战——组件的能力"藏"在 DOM 结构里，AI 无从调用。"前端能力可调用化（Front-end Capability as Skill）"是一种新范式：将 .vue 组件抽象为具名、类型化、可被 AI 发现与调用的 Skill，让前端能力以标准化接口的形式参与 AI 驱动的智能应用。本文结合 SPARK 框架的能力系统（Capability System）与组件注册表（Registry），深入讲解这一范式的原理、实现路径与工程实践，并横向对比 MCP、OpenAI Function Calling 等主流 AI 工具协议，帮你看懂前端开发下一个十年的核心演化方向。

**关键字**：前端能力可调用化、Vue组件Skill化、AI Agent集成、SPARK能力系统、组件注册表、智能前端

---

## 一、时代的提问：AI 来了，你的组件它"看得懂"吗？

2025 年以来，AI Agent 正从"对话助手"进化为"任务执行者"——它不只是回答问题，而是**主动调用工具、操控界面、完成端到端任务**。

但绝大多数前端组件，都是为"人"设计的：

```
人 → 看到界面 → 点击按钮 → 触发事件 → 更新数据
AI → 看到什么？→ 如何调用？→ 不知道
```

一个 Vue 组件有多少"能力"？它能做什么？需要什么输入？会产生什么输出？

对人来说，看一眼 UI 就知道了。  
对 AI 来说——**这些信息根本不存在于任何可机器读取的结构中**。

这就是问题的根源，也是"前端能力可调用化"要解决的核心命题：

> 🎯 **让 .vue 组件的"能力"，以 AI 可理解、可发现、可调用的形式暴露出来。**

---

## 二、从"组件"到"技能"：认知范式的升级

### 2.1 什么是 Skill（技能）？

在 AI 领域，Skill（技能/工具）的定义已相当成熟：

| AI 框架 | 术语 | 核心要素 |
|---------|------|---------|
| OpenAI Function Calling | Function / Tool | 函数名、参数 Schema（JSON Schema）、描述 |
| Microsoft Copilot | Skill | 函数签名、触发意图、输入输出类型 |
| Semantic Kernel | Plugin / Skill | 函数集合、KernelFunction 装饰器 |
| LangChain | Tool | name、description、args_schema |
| MCP (Model Context Protocol) | Tool | name、description、inputSchema |

**共同本质**：

```
Skill = 名称（可被发现）
      + 输入描述（AI 知道该传什么）
      + 输出描述（AI 知道会得到什么）
      + 执行逻辑（实际做事情）
```

### 2.2 .vue 组件距离 Skill 有多远？

一个典型的 .vue 组件拥有：

```
组件                     Skill 需要什么       差距
─────────────────────────────────────────────────────────────
type="spark-ej2-grid"  ← 名称               ✅ 有名称
props: { config }       ← 输入              ⚠️ 类型在 TS 里，运行时不可查
provide(DATA_SOURCE)    ← 输出能力           ❌ 隐式，AI 不可见
emit('row-click', row)  ← 事件输出           ❌ 无结构化描述
```

**差距本质**：组件的"接口"散落在 TypeScript 类型、Props 定义、事件文档里——**人可读，机器不可查，AI 不可调用**。

### 2.3 Skill 化的三个核心动作

把 .vue 组件变成 Skill，本质上是做三件事：

```
             ┌──────────────────────────────────────────────┐
             │         .vue 组件 → Skill 化三步走           │
             │                                              │
  .vue 组件  │  ① 命名化  →  kebab-case + Registry 注册     │
             │                                              │
             │  ② 接口化  →  ComponentConfig 类型 +          │
             │               能力键声明（provide/consume）   │
             │                                              │
             │  ③ 可发现  →  meta 元数据 + AI 可读描述       │
             │                                              │
             └──────────────────────────────────────────────┘
                                  ↓
                      前端 Skill（AI 可调用）
```

---

## 三、SPARK 能力系统：Skill 的运行时基础设施

SPARK 框架的能力系统（`packages/spark-utils/src/capability/index.ts`）不是偶然为之，它从架构上就为 Skill 化奠定了基础。

### 3.1 能力键（Capability Key）= Skill 接口的类型标签

```typescript
// 定义一个类型安全的能力键——这就是 Skill 的"接口声明"
import { defineCapability } from '@spark-view/spark-utils'

// 声明 Skill 的输出类型
export const DATA_SOURCE = defineCapability<IDataSource>('spark:capability:data-source')

// 声明时机：组件注册时
// 语义：凡是 provide(DATA_SOURCE, xxx) 的组件，
//        就具备"提供数据视图"这个能力（Skill）
```

每一个能力键，对应一种**可调用的前端能力**：

| 能力键 | 对应的 Skill 语义 | 典型 Provider |
|--------|-----------------|--------------|
| `PAGE_DATASET` | "提供页面级数据空间" | `PageRenderer` |
| `DATA_SOURCE` | "提供数据视图（可读写行数据）" | `r-table / r-form` |
| `APP_SERVICES` | "提供路由/日志/租户服务" | `SparkPlugin` |
| `PAGE_SERVICE` | "提供 UI 消息/确认框/导航" | `RendererContainer` |
| `FIELD_CONTEXT` | "声明当前渲染上下文" | 各容器组件 |
| `LOGGER` | "提供自定义日志实现" | 任意组件 |

### 3.2 provide / consume = Skill 的发布与调用

```typescript
// ✅ 组件"发布"自己的能力（把自己变成 Skill Provider）
const { provide } = useSparkComponent(props.config)
provide(DATA_SOURCE, dataView)   // 声明：我具备"数据视图"能力

// ✅ 子组件"调用"祖先的能力（消费 Skill）
const { consume } = useSparkComponent(props.config)
const source = consume(DATA_SOURCE)  // 调用：获取最近祖先的"数据视图"能力
```

这与 OpenAI Function Calling 的调用模型高度同构：

```
OpenAI Function Calling          SPARK 能力系统
───────────────────────────────────────────────────────────
function_name: "get_data"        能力键: DATA_SOURCE
parameters: { query: string }   consume(DATA_SOURCE) 返回 IDataSource
return: DataResult               source.rows / source.currentRow
```

> 💡 **关键洞见**：`provide/consume` 不只是依赖注入——它是**组件能力的发布/订阅协议**，是 .vue 组件面向 AI 调用的铰链点。

### 3.3 parent 链查找 = Skill 的作用域感知

SPARK 的 `lookup()` 沿 `parent` 链向上遍历，就近匹配能力：

```
根上下文（APP_SERVICES）
  └── PageRenderer（PAGE_DATASET）
        └── r-table（DATA_SOURCE）
              └── r-text-col → consume(DATA_SOURCE) → 取最近的 r-table 的数据
              └── r-number-col → consume(DATA_SOURCE) → 同上
```

这实现了 Skill 的**作用域隔离**——多个 `r-table` 嵌套时，每个的子组件只能访问它自己的数据视图，不会跨树污染。

这与 Copilot Skill 的"上下文隔离"、MCP 的"会话隔离"设计思想如出一辙。

---

## 四、组件注册表：Skill 的发现协议

### 4.1 Registry = Skill Catalog（技能目录）

SPARK 的 `ComponentRegistry`（`packages/spark-component/src/registry/ComponentRegistry.ts`）就是前端 Skill 目录：

```typescript
import { Spark } from '@spark-view/spark-component'

// 注册 Skill（发布到目录）
Spark.register('spark-ej2-grid', SparkEJ2Grid)
Spark.register('r-table', RendererTable)
Spark.register('r-form',  RendererForm)

// 带元数据注册（Skill 的描述信息）
Spark.register('spark-ej2-grid', SparkEJ2Grid, {
  dataKey: 'self-resolve',       // 声明 dataKey 解析行为
  description: '高性能数据表格，支持排序/过滤/分页',
  capabilities: {
    provides: ['spark:capability:data-source', 'spark:capability:selection'],
    consumes: ['spark:capability:page-dataset'],
  }
})

// 批量注册（生产推荐，懒加载）
const reg = Spark.createRegister(import.meta.glob('./components/*.vue'))
reg.registerAll({
  'user-grid':  './UserGrid.vue',
  'user-form':  './UserForm.vue',
  'dept-tree':  './DeptTree.vue',
})
```

**Registry 本质上就是一个 Skill Catalog**——AI 可以查询这个目录，发现有哪些可用的前端技能。

### 4.2 isComponentRegistered = Skill 的存在性检测

```typescript
const { isComponentRegistered, getComponent } = useSparkComponent(props.config)

// AI 在执行任务前，先检测所需技能是否可用
if (isComponentRegistered('spark-ej2-grid')) {
  // 组件已注册，可以安全使用
  const GridComponent = getComponent('spark-ej2-grid')
} else {
  // 技能不存在，走降级路径
  logger.warn('spark-ej2-grid 未注册，使用原生 el-table 替代')
}
```

### 4.3 编译时注册 vs 运行时注册：Skill 的加载策略

| 策略 | 实现方式 | Skill 类比 | 适用场景 |
|------|---------|-----------|---------|
| 编译时注册（Smart 模式） | Vite 插件生成 `virtual:spark-components` | 静态 Skill 目录，编译时固化 | 生产环境，首屏性能优先 |
| 运行时懒加载 | `defineAsyncComponent` + 动态 import | 按需加载 Skill，调用时才下载 | 开发环境，大型项目 |
| 热插拔注册 | `Spark.register()` 运行时调用 | 动态 Skill 插件，像 npm 包一样扩展 | 微前端/插件平台 |

```
编译时（生产）           运行时（开发/微前端）
──────────────────       ──────────────────────────
Vite 构建时扫描          运行时动态扫描
   ↓                        ↓
virtual:spark-components  Spark.register('type', loader)
   ↓                        ↓
Tree Shaking 优化          按需 import()
   ↓                        ↓
首屏快 32%               灵活无限扩展
```

---

## 五、ComponentConfig：Skill 的调用契约

### 5.1 从 Props 到 Config：统一调用接口

所有 SPARK 组件都通过 `ComponentConfig` 接收配置，这是 Skill 调用的**统一入口**：

```typescript
// packages/spark-component/src/core/types.ts
export interface ComponentConfig {
  type: string                           // Skill 名称（注册表 key）
  id?: string                            // 实例 ID
  visible?: boolean                      // 能力：可见性控制
  disabled?: boolean                     // 能力：禁用状态控制
  children?: ComponentConfig[]           // 能力：嵌套子 Skill
  dataKey?: string                       // 能力：数据绑定
  props?: Record<string, unknown>        // Skill 的具体参数
  on?: Record<string, unknown>           // Skill 的事件钩子
  meta?: Record<string, unknown>         // Skill 的元数据
}
```

**与 AI 工具协议的映射**：

```
ComponentConfig                   OpenAI Tool Call
────────────────────────────────────────────────────
type: "spark-ej2-grid"         ←→  function: "spark_ej2_grid"
props: { border: true }        ←→  arguments: { border: true }
dataKey: "Orders@rows"         ←→  arguments: { dataKey: "Orders@rows" }
children: [{ type: "col" }]    ←→  (嵌套 tool call，MCP 支持)
```

### 5.2 扩展 ComponentConfig：声明 Skill 的专属参数

```typescript
// 定义一个表格 Skill 的调用契约
interface SparkEJ2GridConfig extends ComponentConfig {
  type: 'spark-ej2-grid'
  // Skill 专属参数
  dataKey: string               // 必须：数据绑定键
  allowPaging?: boolean         // 可选：是否分页
  pageSize?: number             // 可选：每页行数
  allowSorting?: boolean        // 可选：是否排序
  allowFiltering?: boolean      // 可选：是否过滤
  // 子 Skill（列定义）
  children?: SparkEJ2ColumnConfig[]
}

interface SparkEJ2ColumnConfig extends ComponentConfig {
  type: 'spark-ej2-column'
  name: string                  // 绑定的数据字段
  props: {
    headerText: string          // 列标题
    width?: string              // 列宽
    textAlign?: 'Left' | 'Center' | 'Right'
  }
}

// AI 生成的 rule.json 就是对这套契约的"调用"
const ruleJson = [
  {
    "type": "spark-ej2-grid",
    "dataKey": "Orders@rows",
    "props": { "allowPaging": true, "pageSize": 20 },
    "children": [
      { "type": "spark-ej2-column", "name": "orderId",
        "props": { "headerText": "订单号", "width": "160" } }
    ]
  }
]
```

---

## 六、AI 调用 Skill 的完整链路

### 6.1 rule.json：AI 生成的 Skill 调用脚本

在 SPARK 框架中，`rule.json` 就是 AI 对前端 Skill 的**调用序列**：

```
AI 理解需求
    │
    ▼
AI 查询 Registry（Skill 目录）
    │
    ▼
AI 选择合适的 Skill 组合
    │
    ▼
AI 生成 rule.json（Skill 调用参数）
    │
    ▼
SPARK bindRules 解析 rule.json
    │
    ▼
getComponent(type) 从 Registry 解析组件
    │
    ▼
SparkComponentRenderer 递归渲染
    │
    ▼
useSparkComponent → ComponentContext 树构建
    │
    ▼
provide/consume 能力链接通
    │
    ▼
UI 渲染完成（Skill 执行完毕）
```

### 6.2 能力链的建立过程（Skill 的运行时组装）

```typescript
// 这是 SPARK 最核心的运行时流程（简化）

// Step 1：AI 生成的 rule.json 被解析为 ComponentConfig 树
const config = {
  type: 'r-table',
  dataKey: 'Orders@rows',
  children: [
    { type: 'el-table-column', props: { prop: 'orderId', label: '订单号' } }
  ]
}

// Step 2：SparkComponentRenderer 取出组件实例
const TableComponent = registry.get('r-table')

// Step 3：r-table 内部 useSparkComponent 建立上下文
// → consume(PAGE_DATASET)  拿到 DataSet
// → resolveDataKeyBinding('Orders@rows', ds) → DataView
// → provide(DATA_SOURCE, dataView)  发布自己的数据能力

// Step 4：子组件 el-table-column 通过 DATA_SOURCE 获取数据
// → consume(DATA_SOURCE) → dataView.rows → 渲染列数据

// 整个过程：AI 写配置，框架拼接能力链——人无需干预
```

### 6.3 AI 发现前端 Skill 的三种方式

```
方式一：virtual:spark-skill-catalog（✅ 当前已实现，推荐）
┌─────────────────────────────────────────────────────┐
│  .vue 文件加 @skill JSDoc 注解                       │
│       ↓                                             │
│  vite-plugin-spark-components scan() 自动提取        │
│       ↓                                             │
│  virtual:spark-skill-catalog 虚拟模块                │
│  export const skillCatalog: SkillMeta[]             │
│  export function buildSkillPrompt(                  │
│    header?, mode?, types?                           │
│  ): string                                          │
│       ↓                                             │
│  三档精度输出（index / compact / full）              │
│  + 按 type 过滤，token 完全可控                      │
└─────────────────────────────────────────────────────┘

方式二：运行时 Registry 查询
┌─────────────────────────────────────────────────────┐
│  AI 调用 GET /api/spark/skills                      │
│  → 后端从 ComponentRegistry 导出所有已注册类型        │
│  → 返回 { type, meta, description }[] 列表          │
│  → AI 据此选择合适的 Skill 填入 rule.json            │
└─────────────────────────────────────────────────────┘

方式三：提示词静态内嵌（快速启动）
┌─────────────────────────────────────────────────────┐
│  SPARK_COMPONENT_PROMPT.md 手写 Skill 目录           │
│  → 作为系统提示词发给 LLM                            │
│  → AI 根据自然语言需求，从已知 Skill 中选择并组合     │
│  → 生成符合约束的 rule.json                          │
└─────────────────────────────────────────────────────┘
```

---

## 七、使用场景全景图

### 🏗️ 场景 1：AI 驱动的页面自动生成

**传统场景（组件化）**：

```
产品需求 → UI 设计稿 → 工程师手写 .vue → Review → 上线
             （2~5 天）
```

**Skill 化场景（AI 调用）**：

```
产品需求（自然语言）
    │
    ▼
AI 查 Skill 目录：有 r-table、r-form、dept-tree 等
    │
    ▼
AI 组合 Skill 生成 rule.json + pagedata.json
    │
    ▼
SPARK 渲染：Skill 链自动组装
    │
    ▼
Logger 日志上报 → AI 自动迭代修正
    │
    ▼
可交付页面（< 30 分钟）
```

**实际 rule.json 示例（AI 的 Skill 调用脚本）**：

```json
[
  {
    "type": "el-container",
    "children": [
      {
        "type": "el-aside",
        "props": { "width": "260px" },
        "children": [
          {
            "type": "r-tree",
            "dataKey": "Departments@rows",
            "props": { "nodeKey": "id", "defaultExpandAll": true }
          }
        ]
      },
      {
        "type": "el-main",
        "children": [
          {
            "type": "r-table",
            "dataKey": "Employees@rows",
            "props": { "border": true, "stripe": true, "highlightCurrentRow": true },
            "children": [
              { "type": "el-table-column", "props": { "prop": "name",   "label": "姓名" } },
              { "type": "el-table-column", "props": { "prop": "dept",   "label": "部门" } },
              { "type": "el-table-column", "props": { "prop": "salary", "label": "薪资" } }
            ]
          }
        ]
      }
    ]
  }
]
```

> 这不是人写的 Vue 模板——这是 AI 对前端 Skill 的一次**声明式调用**。

---

### 🔌 场景 2：微前端的 Skill 热插拔

在微前端架构中，Skill 化的组件可以像 npm 包一样被动态加载和卸载：

```typescript
// 主应用：定义 Skill 热插拔接口
interface SkillPlugin {
  name: string
  skills: Record<string, () => Promise<{ default: unknown }>>
}

// 微应用 A 注册自己的 Skill
const pluginA: SkillPlugin = {
  name: 'hr-module',
  skills: {
    'hr-org-chart':    () => import('./OrgChart.vue'),
    'hr-salary-table': () => import('./SalaryTable.vue'),
  }
}

// 运行时安装（热插拔）
function installSkillPlugin(plugin: SkillPlugin) {
  for (const [type, loader] of Object.entries(plugin.skills)) {
    Spark.register(type, loader)  // 动态注入到全局 Skill 目录
  }
}

installSkillPlugin(pluginA)

// AI 立即可用新 Skill，无需重启
// rule.json 中写 { "type": "hr-org-chart" } 即可渲染
```

---

### 🤖 场景 3：AI Agent 主动调用前端 Skill

这是"前端能力可调用化"的终极形态——AI Agent 不是"生成静态配置"，而是**实时、动态地组合和调用前端 Skill**：

```typescript
// AI Agent 的前端 Skill 调用适配器（概念示意）
class SparkSkillAdapter {
  private registry = Spark.getRegistry()

  // 暴露给 AI 的"查询可用技能"接口
  listSkills(): SkillDescriptor[] {
    return [...this.registry.getAll().values()].map(def => ({
      name: def.type,
      description: def.meta?.description as string,
      inputSchema: def.meta?.inputSchema,
      capabilities: def.meta?.capabilities,
    }))
  }

  // 暴露给 AI 的"执行技能"接口
  async invokeSkill(type: string, config: ComponentConfig): Promise<void> {
    if (!this.registry.has(type)) {
      throw new Error(`Skill not found: ${type}`)
    }
    // 将 config 写入 rule.json → SPARK 渲染
    await writePageFiles(currentPageId, {
      'rule.json': JSON.stringify([config], null, 2)
    })
  }
}

// AI Agent 的一次 Skill 调用（伪代码）
const adapter = new SparkSkillAdapter()
const skills = adapter.listSkills()
// 选择 r-table Skill，填入调用参数
await adapter.invokeSkill('r-table', {
  type: 'r-table',
  dataKey: 'Orders@rows',
  props: { border: true }
})
```

---

### 🛡️ 场景 4：权限感知的 Skill 降级

Skill 化的组件可以内置**权限感知能力**，AI 调用时无需额外处理权限逻辑：

```typescript
// 一个权限感知的 Skill 实现
export default defineComponent({
  setup(props) {
    const { consume, logger } = useSparkComponent(props.config)
    const services = consume(APP_SERVICES)

    // Skill 内部自主处理权限
    const hasPermission = computed(() => {
      const perm = services?.auth?.checkPermission(props.config.type)
      if (!perm) logger.warn(`Skill ${props.config.type} 权限不足，自动降级`)
      return perm
    })

    return { hasPermission }
  }
})
```

AI 生成 `rule.json` 时不需要知道权限规则——Skill 自己处理，对 AI 透明。

---

### 🧪 场景 5：Storybook + Skill 驱动的组件演示

Skill 化的组件元数据可以驱动自动化的 Storybook：

```typescript
// SparkPageRenderer.stories.ts（项目中实际存在）
// 通过 ComponentConfig 直接驱动 Story，无需手写 args
export default {
  title: 'SPARK/Skills/r-table',
  component: SparkComponentRenderer,
}

// 每个 Story = 一种 Skill 调用场景
export const BasicTable = {
  args: {
    config: {
      type: 'r-table',
      dataKey: 'Orders@rows',
      props: { border: true }
    }
  }
}

export const WithAggregates = {
  args: {
    config: {
      type: 'r-table',
      dataKey: 'Orders@summaryRow',  // 聚合行 Skill
      props: { stripe: true }
    }
  }
}
```

---

## 八、工程实践：一步步把 .vue 组件封装为标准 Skill

### Step 1：命名规范化（Skill 的唯一标识）

```
❌ 传统命名            ✅ Skill 命名
───────────────────────────────────────────────
OrderTable.vue       spark-order-table
UserFormPanel.vue    spark-user-form
DeptTreeView.vue     dept-tree

命名规则：
- 全小写 kebab-case
- 业务模块前缀（dept-, hr-, finance-）
- 能力描述后缀（-table, -form, -tree, -chart）
- 避免 UI 框架名（不叫 el-xxx，叫 spark-xxx）
```

### Step 2：接口声明（Skill 的调用契约）

```typescript
// ✅ 正确：为 Skill 定义明确的配置接口
interface DeptTreeConfig extends ComponentConfig {
  type: 'dept-tree'
  dataKey: string              // 必须：树数据绑定
  props?: {
    nodeKey?: string           // 节点唯一标识字段（默认 'id'）
    defaultExpandAll?: boolean // 默认展开全部（默认 false）
    draggable?: boolean        // 是否可拖拽（默认 false）
  }
}

// ❌ 错误：不声明接口，props 用 any/unknown
interface BadConfig extends ComponentConfig {
  props?: Record<string, unknown>  // AI 和 TS 都不知道能传什么
}
```

### Step 3：能力声明（Skill 的输入输出）

```typescript
// DeptTree.vue 的 setup
const { provide, consume, logger } = useSparkComponent(props.config as DeptTreeConfig)

// ① 声明"消费"的能力——Skill 的输入依赖
const dataSet = consume(PAGE_DATASET)     // 需要：页面数据空间
const appSvc  = consume(APP_SERVICES)     // 需要：应用服务（路由等）

// ② 声明"提供"的能力——Skill 的输出
provide(DATA_SOURCE, treeDataView)        // 提供：树数据视图（供子组件消费）
provide(FIELD_CONTEXT, 'tree')            // 提供：渲染上下文标识

// ③ 记录 Skill 执行日志（AI 迭代的关键数据）
logger.info('DeptTree Skill 初始化', {
  nodeCount: treeDataView?.rows?.length ?? 0,
  dataKey: (props.config as DeptTreeConfig).dataKey,
})
```

### Step 4：Skill 注解（自动注册到 Skill 目录）

这是比「在 `Spark.register()` 手动传 meta」更优的方案：**注解写在 `.vue` 文件顶部注释里，构建时 Vite 插件自动提取**，无需在 `main.ts` 维护任何额外代码。

```vue
<!--
/**
 * @skill dept-tree
 * @description 部门组织树，支持懒加载、拖拽排序、节点点击联动子表
 * @provides DATA_SOURCE
 * @provides FIELD_CONTEXT
 * @consumes PAGE_DATASET
 * @consumes APP_SERVICES
 * @input { dataKey: string, props: { nodeKey?: string, defaultExpandAll?: boolean, draggable?: boolean } }
 * @example { "type": "dept-tree", "dataKey": "Departments@rows", "props": { "nodeKey": "id" } }
 */
-->
<template>...</template>
```

**注解标签说明**：

| 标签 | 说明 | 必填 |
|------|------|------|
| `@skill` | Skill 类型名（= 注册名，kebab-case） | ✅ |
| `@description` | 一句话描述，AI 用于 Skill 选择 | 推荐 |
| `@provides` | 该组件 provide 的能力键（可多行） | 推荐 |
| `@consumes` | 该组件 consume 的能力键（可多行） | 推荐 |
| `@input` | 参数 Schema（JSON 字符串） | 可选 |
| `@example` | rule.json 调用示例（JSON 字符串） | 可选 |

> 💡 **零注册开销**：Vite 插件 `parseSkillMeta()` 只读文件前 60 行，与组件注册共用同一次 `scan()` ——一个注解，同时完成「组件注册」和「Skill 目录收录」两件事。构建日志：
> ```
> ✅ 扫描完成: 13 个组件 (同步: 11, 异步: 2, Skill: 5)
> ```

### Step 5：AI 提示词集成（三档精度，按需输出）

组件加了 `@skill` 注解后，构建产物中自动生成 `virtual:spark-skill-catalog` 虚拟模块，直接 import 即用——无需手动遍历 Registry：

```typescript
import { skillCatalog, buildSkillPrompt } from 'virtual:spark-skill-catalog'

// 📋 场景 A：system prompt 常驻——只告诉 AI「有哪些组件」
//    index 模式：仅 type + 描述，约 20 tokens/组件，200 个组件 ≈ 4000 tokens
const systemPrompt = buildSkillPrompt('## 可用 Skill 索引', 'index')

// 🔗 场景 B：AI 决定组合方式——需要知道依赖关系（默认）
//    compact 模式：type + 描述 + provides/consumes，约 50 tokens/组件
const withCapabilities = buildSkillPrompt()

// 📖 场景 C：AI 准备生成具体 rule.json——只看目标组件完整细节
//    full 模式 + types 过滤：含 inputSchema + example，仅指定组件
const detailPrompt = buildSkillPrompt('## 组件详情', 'full', ['r-table', 'dept-tree'])

// 🗂️ 也可直接使用结构化数据（序列化后发给 AI）
console.log(skillCatalog)  // SkillMeta[]
```

**推荐的两轮对话策略**（token 预算可控 + 高准确率）：

```
第一轮：index 模式注入 system prompt（全量索引）
  AI："我需要用 r-table 和 dept-tree"

第二轮：full 模式 + types 过滤（仅目标组件）
  buildSkillPrompt('', 'full', ['r-table', 'dept-tree'])
  AI 生成精确的 rule.json
```

| 模式 | Token 估算（10组件） | 适合场景 |
|------|-------------------|----------|
| `'index'` | ~200 tokens | system prompt 常驻 |
| `'compact'`（默认） | ~500 tokens | 多数对话轮次 |
| `'full'` + 过滤 | ~300 tokens/个 | 生成具体配置前 |

---

## 九、横向对比：前端 Skill 与主流 AI 工具协议

| 维度 | OpenAI Function Calling | MCP Tool | SPARK Skill |
|------|------------------------|----------|------------|
| **定义方式** | JSON Schema | JSON Schema | TypeScript 接口 + Registry meta |
| **调用方式** | AI 生成 JSON → 后端执行函数 | AI 生成 JSON → MCP server 执行 | AI 生成 rule.json → SPARK 渲染组件 |
| **输出类型** | 函数返回值（文本/JSON） | 工具结果（文本/图片） | **UI 组件渲染** + 能力链接通 |
| **作用域** | 单次调用，无状态 | 会话级，有状态 | **组件树级，有上下文（parent 链）** |
| **可组合性** | 可顺序调用（Chain） | 支持资源引用 | **天然嵌套（children + 能力链）** |
| **反馈机制** | 函数返回值 | 工具结果 | **Logger 日志上报 → AI 迭代修正** |
| **运行环境** | 后端 / 服务端 | MCP Server | **浏览器前端，Vue 运行时** |
| **Skill 发现** | 在 API 请求中声明 | `list_tools` 接口 | Registry + 提示词内嵌 |

**SPARK Skill 的独特优势**：

```
1. 可视化输出：Skill 执行结果是可交互的 UI，不只是文本
2. 状态持久：组件实例持续存在，能力链保持激活
3. 自然嵌套：组件树 = Skill 调用树，无需额外 Chain 框架
4. 反馈闭环：Logger → AI → 修正配置 → 自动重渲（AI Page Loop）
```

---

## 十、前端能力可调用化的终极形态

### 10.1 从 MVC 到 Skill Graph

软件架构的演化有清晰的脉络：

```
MVC（逻辑分层）
    ↓
组件化（UI 复用）
    ↓
微前端（跨团队协作）
    ↓
Skill 化（AI 可调用）    ← 我们现在
    ↓
Skill Graph（AI 自主编排）  ← 下一站
```

**Skill Graph** 的概念：每个前端组件是一个节点（Skill），节点间的依赖关系（能力 provide/consume）是有向边，整个组件树是一个**可被 AI 动态编排**的图结构。

AI 的任务变成：**在 Skill Graph 中找到满足用户需求的最优子图，并激活它**。

### 10.2 CapabilityTypeMap：Skill 的类型系统扩展

SPARK 已经通过模块增强（Declaration Merging）为 Skill 提供了**开放的类型注册机制**：

```typescript
// 为自定义 Skill 扩展类型系统
declare module '@spark-view/spark-utils' {
  interface CapabilityTypeMap {
    // 注册新 Skill 的接口类型
    'my-org:skill:approval-flow': IApprovalFlowCapability
    'my-org:skill:signature-pad': ISignaturePadCapability
    'my-org:skill:geo-picker':    IGeoPickerCapability
  }
}

// 使用——完全类型安全，IDE 全程智能提示
const approval = consume('my-org:skill:approval-flow')
// approval: IApprovalFlowCapability | null
```

这让每个业务团队都能向 Skill 生态贡献自己的能力，且完全类型安全。

### 10.3 AI + Skill 的协作模式演化

| 阶段 | 模式 | 描述 |
|------|------|------|
| **当前（2025~2026）** | AI 生成 + 人验收 | AI 生成 rule.json，人工 review 后部署 |
| **近期规划** | AI 生成 + 自动测试 | Logger + 视觉回归验收，减少人工介入 |
| **中期目标** | AI 主导 + 人设意图 | 人只描述"想要什么"，AI 自主选 Skill、组装、验收 |
| **远期愿景** | AI 自主进化 | AI 发现现有 Skill 不满足需求，自动生成新的 .vue Skill 并注册 |

---

## 十一、总结

"把 .vue 组件抽象为 Skill"，不是一次代码重构，而是一次**开发范式的跃迁**：

| 旧范式（组件化） | 新范式（Skill 化） |
|----------------|-----------------|
| 组件是给人用的 UI 单元 | Skill 是给 AI/人共同调用的能力单元 |
| 能力隐含在 DOM 和逻辑里 | 能力通过 capability 键显式声明 |
| 组件靠 Props 通信 | Skill 靠 provide/consume 建立能力链 |
| 复用靠 copy-paste 或 npm | 复用靠 Registry 按名发现和调用 |
| 调试靠 console.log | 调试靠 Logger 全量上报 + AI 自动分析 |
| 页面由人手写 | 页面由 AI 选 Skill + 声明调用参数 |

**SPARK 框架的四件套**——能力键系统、组件注册表、ComponentConfig 契约、Logger 闭环——共同构成了"前端能力可调用化"的完整基础设施。

这不是遥远的未来，这是正在发生的工程实践。

> 🚀 **下一步行动**：
> 1. 给现有 `.vue` 组件顶部加 `@skill` JSDoc 注解（4 个标签起步即生效）
> 2. `import { buildSkillPrompt } from 'virtual:spark-skill-catalog'`，用 `'index'` 模式注入 AI system prompt
> 3. 对话时按需切换 `'full'` 模式 + `types` 过滤，获取目标组件的完整 example
> 4. 接入 `AIPageLoop`，开启"提示词 → Skill 调用 → 渲染 → 日志反馈 → 迭代"的完整闭环

从今天开始，你写的每一个 `.vue` 文件，都有机会成为 AI 可调用的前端技能。

---

> 📌 **项目参考**：本文所有示例均基于 SPARK View 项目实际代码
>
> | 模块 | 路径 |
> |------|------|
> | 能力系统定义 | `packages/spark-utils/src/capability/index.ts` |
> | 组件注册表 | `packages/spark-component/src/registry/ComponentRegistry.ts` |
> | Spark 命名空间 | `packages/spark-component/src/spark.ts` |
> | useSparkComponent | `packages/spark-component/src/composables/useSparkComponent.ts` |
> | 核心类型 | `packages/spark-component/src/core/types.ts` |
> | **Vite Skill 插件** | **`tools/vite-plugin-spark-components.ts`**（`parseSkillMeta` / `generateSkillCatalog`） |
> | **虚拟模块类型声明** | **`src/env.d.ts`**（`virtual:spark-skill-catalog`） |
> | AI 闭环服务 | `packages/spark-app/src/ai/ai-loop.ts` |
> | 组件开发指南 | `docs/guides/COMPONENT_DEVELOPMENT.md` |
> | 组件注册指南 | `docs/guides/COMPONENT_REGISTRATION.md` |

---

*作者：SPARK Team ｜ 发布：2026-03*
