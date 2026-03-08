# 告别手写样板：SPARK "能力驱动"架构如何让 AI 自动写页面、跑闭环、出交付物

> **摘要**：传统前端开发深陷"配置-编码-调试"三段论的泥潭，大量重复样板代码消耗了工程师宝贵的创造力。SPARK 框架以"能力驱动（Capability-Driven）"为核心范式，将组件间通信、数据流转、权限渲染统统收敛到声明式配置层；再接入 AI 闭环服务（AI Page Loop），让大模型直接生成/迭代页面四文件，框架自动渲染、Logger 自动上报、AI 再次修正——形成真正的"零人工干预"智能开发闭环。本文深入解析这套范式的架构原理、使用场景与工程实践，带你看懂从"人写代码"到"AI 生代码 + 框架跑闭环"的全链路进化。

**关键字**：能力驱动开发、SPARK框架、AI代码生成、配置驱动、低代码平台、智能开发范式

---

## 一、破局之问：你的代码有多少是"不得不写"的？

打开任意一个中后台项目的 `src/views/` 目录，随便点开一个列表页：

```vue
<template>
  <el-table :data="tableData" border stripe highlight-current-row>
    <el-table-column prop="orderId" label="订单号" />
    <el-table-column prop="amount"  label="金额" />
    <!-- ... 20 列 ... -->
  </el-table>
  <el-pagination ... />
</template>
<script setup>
const tableData = ref([])
onMounted(async () => {
  tableData.value = await fetchOrders()
})
</script>
```

这段代码，你已经写了多少遍？

**80% 的中后台页面，逻辑高度同质**——表格、表单、层级展示、权限控制。每写一次，都是对同一种认知的第 N 次重复劳动。传统框架的答案是"封装组件，复用代码"，但这本质上只是把"手写 100 行"变成"手写 30 行"——还是在手写。

**SPARK 的答案不一样**：

> 🎯 **凡是可以用配置描述的需求，就不应该写一行代码。**

---

## 二、能力驱动：重新定义组件间的"关系"

### 2.1 传统 DI 的困境

Vue 应用常见通信方式：props 向下、emit 向上、Pinia 横向、`provide/inject` 纵向。看似完备，实则存在根本性问题：

| 通信方式 | 耦合类型 | 痛点 |
|----------|----------|------|
| Props/Emit | 父-子强耦合 | 层级加深后 Props Drilling 失控 |
| Pinia | 全局耦合 | 组件不可复用，依赖全局状态结构 |
| provide/inject | 隐式耦合 | 无类型约束，inject 找不到时无回退策略 |

### 2.2 SPARK 能力系统：按名查找，就近原则

SPARK 能力系统（`packages/spark-utils/src/capability/symbols.ts`）引入了一种更优雅的抽象——**ComponentContext 链上的局部依赖注入**：

```
组件树（ComponentContext 链）
  ┌──────────────────────────────────────────┐
  │  PageRenderer                             │  ← provide(APP_SERVICES, {...})
  │    ┌────────────────────────────────────┐ │     provide(PAGE_DATASET, dataSet)
  │    │  r-table                           │ │  ← consume(PAGE_DATASET) → DataView
  │    │    ┌──────────────────────────────┐│ │     provide(DATA_SOURCE, dataView)
  │    │    │  r-text-col                  ││ │  ← consume(DATA_SOURCE) → rows / currentRow
  │    │    └──────────────────────────────┘│ │
  │    └────────────────────────────────────┘ │
  └──────────────────────────────────────────┘
```

**核心 API 极简，却功能强大**：

```typescript
// 🔑 定义类型安全的能力键
const DATA_SOURCE = defineCapability<IDataSource>('spark:capability:data-source')

// 🎁 父组件"提供"能力（SPARK DI，非 Vue DI）
const { provide } = useSparkComponent(props.config)
provide(DATA_SOURCE, dataView)   // dataView 实现 IDataSource 接口

// 🔍 子组件"消费"能力（自动沿 parent 链向上查找）
const { consume } = useSparkComponent(props.config)
const source = consume(DATA_SOURCE)  // IDataSource | null
```

核心设计思想：

```
能力 = 接口契约（Interface）
     + 运行时注册（Symbol 键）
     + 就近查找（parent 链遍历）
```

> 💡 **与 Vue DI 的本质区别**：SPARK 能力系统是**组件树内的局部 DI**，而 Vue `provide/inject` 是跨越整个 Vue 实例树的全局注入。前者可以精确控制能力范围，后者一旦 provide 就全局可见。

### 2.3 能力键一览：框架内置的"通用语言"

| 能力键（Symbol） | 类型 | 用途 |
|------------------|------|------|
| `APP_SERVICES` | `IAppServicesCapability` | 路由、logger、租户等应用服务 |
| `LOGGER` | `LoggerApi` | 组件级日志覆盖 |
| `PAGE_SERVICE` | `IPageServiceCapability` | 消息框、确认框、导航（框架无关） |
| `PAGE_DATASET` | `IDataSet` | 页面级数据空间（DataSet） |
| `DATA_SOURCE` | `IDataSource` | 组件级数据视图（DataView） |
| `FIELD_CONTEXT` | `'table'\|'form'\|'detail'` | 渲染上下文感知 |
| `CONTEXT_DATA` | `reactive({})` | 表单/详情的可写数据对象 |

---

## 三、配置即交付：四文件就是一个完整的页面

### 3.1 SPARK 页面的核心约定

SPARK 页面由且仅由 **4 个文件**驱动：

```
pages-config/
└── {pageId}/
    ├── rule.json        ← UI 结构（form-create 规则树）
    ├── pagedata.json    ← 数据空间（DataSet 定义 + 初始数据）
    ├── script.js        ← 业务逻辑（沙箱执行，最小化）
    └── style.css        ← 页面样式
```

**这不是配置文件，这就是交付物本身**。

### 3.2 数据流：从 JSON 到可交互 UI 的全链路

```
pagedata.json
      │
      ▼
parsePageData()                 ← spark-page-config 唯一转换点
      │
      ▼
DataSet 实例                    ← FileLoader memCache 缓存，同 pageId 复用
      │
  ┌───┴───────────────┐
  │                   │
DataTable          DataTable    ← 每个表独立管理列、行、API 配置
  │                   │
DataView           DataView     ← 视图层：rows / currentRow / selectedRows
  │
  ▼
provide(PAGE_DATASET, ds)       ← PageRenderer 向组件树注入
  │
  ▼
consume(PAGE_DATASET)           ← r-table 取出 DataSet
  │
resolveDataKeyBinding('Orders@rows', ds)
  │
  ▼
provide(DATA_SOURCE, dataView)  ← r-table 向子组件注入
  │
  ▼
el-table-column / r-text-col 等 ← consume(DATA_SOURCE) 取行数据
```

### 3.3 零代码场景实战：一个订单列表页

**rule.json（UI 描述）**：

```json
[
  {
    "type": "el-card",
    "props": { "header": "订单列表" },
    "children": [
      {
        "type": "r-table",
        "dataKey": "Orders@rows",
        "props": { "border": true, "stripe": true, "highlightCurrentRow": true },
        "children": [
          { "type": "el-table-column", "props": { "prop": "orderId", "label": "订单号", "width": "160" } },
          { "type": "el-table-column", "props": { "prop": "amount",  "label": "金额",   "width": "120" } },
          { "type": "el-table-column", "props": { "prop": "total",   "label": "含税总额" } }
        ]
      }
    ]
  }
]
```

**pagedata.json（数据描述）**：

```jsonc
{
  "dataSetName": "OrderDS",
  "tables": {
    "Orders": {
      "tableName": "Orders",
      "columns": [
        { "name": "orderId", "type": "string" },
        { "name": "amount",  "type": "number" },
        {
          "name": "total",
          "type": "number",
          "computeExpression": "amount * 1.13"  // ← 零代码计算列！
        }
      ],
      "api": { "list": { "url": "/api/orders", "method": "GET" } }
    }
  }
}
```

**script.js（本页无业务逻辑，空文件）**：

```javascript
// 纯展示页，无需业务脚本
```

> ✅ **成果统计**：一个带分页、当前行高亮、含税计算列的订单列表页——**script.js 为空，零代码**。

---

## 四、AI 闭环：让大模型成为代码生产力引擎

### 4.1 传统"AI 辅助编码"的天花板

当前大多数"AI 编程工具"的工作流：

```
需求 → 工程师写提示词 → AI 生成代码片段 → 工程师粘贴/审查/修改 → 提交
```

本质上，AI 仍然是"**建议工具**"，人仍然是"**执行节点**"。当生成的代码有 bug，AI 无法自动感知——**没有反馈回路**。

### 4.2 SPARK AI Page Loop：真正的闭环

SPARK 的 `AIPageLoop`（`src/services/ai-loop.ts`）实现了一套完整的**自主迭代机制**：

```
                ┌──────────────────────────────────────────────────────┐
                │                 AI Page Loop 闭环                    │
                │                                                      │
  用户提示词     │  ┌─────────────┐    AI 生成四文件                    │
 ─────────────► │  │  AI 后端    │ ─────────────────► rule.json        │
                │  │ (LLM / GPT) │                    pagedata.json    │
                │  └─────────────┘                    script.js        │
                │        ▲                            style.css        │
                │        │                               │             │
                │  日志 + 当前文件                        │ 写入磁盘     │
                │        │                               ▼             │
                │  ┌──────────────┐          ┌──────────────────────┐  │
                │  │ PageLog      │          │   SPARK 渲染引擎      │  │
                │  │ Collector    │◄─────────│   自动渲染页面        │  │
                │  └──────────────┘  Logger  └──────────────────────┘  │
                │        │          全量上报           │               │
                │        │                      SSE 文件变更通知       │
                │        │                            │               │
                │        └────────────────────────────┘               │
                │                   循环迭代                           │
                └──────────────────────────────────────────────────────┘
```

**完整流程用代码说话**：

```typescript
import { AIPageLoop } from '@/services/ai-loop'

// 🚀 初始化闭环协调器
const loop = new AIPageLoop({
  aiEndpoint: '/api/ai/chat',
  logCollectDelay: 3000,  // 等待渲染产生日志（毫秒）
  onFilesUpdated: (pageId, written) => {
    console.log(`AI 写入了 ${written.join(', ')}`)
    router.push(`/${pageId}`)   // 自动导航到生成页面
  },
  onError: (err) => showMessage(err.message, 'error'),
})

// 📝 Step 1：首次生成
const resp = await loop.generate(
  'order-analysis',
  '创建订单分析页面：左侧树形部门选择，右侧表格显示该部门订单，底部聚合行显示总金额'
)
console.log('AI 说：', resp.explanation)
// → SPARK 收到文件，自动渲染页面；Logger 开始收集渲染日志

// 🔄 Step 2：AI 自主迭代（日志已被 PageLogCollector 自动收集）
const resp2 = await loop.iterate(
  'order-analysis',
  '表格渲染正常，但部门树点击后右侧数据没有联动，请检查 DataRelation 配置'
)
// → AI 读取日志 + 当前文件 → 修改 pagedata.json → 重新推送 → 自动热重载
```

### 4.3 AIPageLoop 核心模块解析

| 模块 | 职责 | 实现方式 |
|------|------|---------|
| `generate(pageId, prompt)` | 首次生成四文件 | 向 AI 后端发送提示词，接收文件内容 |
| `iterate(pageId, feedback?)` | 基于日志迭代修正 | 读取 `PageLogCollector` 缓存 + 当前文件，打包发给 AI |
| `PageLogCollector` | 日志缓冲器 | 收集页面渲染时 Logger 上报的所有日志快照 |
| `writePageFiles()` | 文件写入 | `POST /api/pages-config/{pageId}/__batch` |
| `setupHotReload()` | SSE 热重载 | 监听文件变更 → 清 localStorage 缓存 → 触发页面重渲 |

**PageLogCollector 设计细节**（AI 发现 bug 的关键）：

```typescript
export class PageLogCollector {
  private logs: LogSnapshot[] = []

  drain(pageId?: string): LogSnapshot[] {
    // 取出当前 pageId 的日志并清空，打包发给 AI
    const matching = this.logs.filter(l => l.pageId === pageId)
    this.logs = this.logs.filter(l => l.pageId !== pageId)
    return matching
  }
}

// AI 后端接收到的 payload 示例
{
  "action": "iterate",
  "pageId": "order-analysis",
  "sessionId": "ai-1741234567890-abc123",
  "feedback": "表格没数据",
  "currentFiles": {
    "rule.json": "[...]",
    "pagedata.json": "{...}"
  },
  "logs": [
    {
      "level": "warn",
      "message": "[DataView] Table Orders has no API configuration",
      "timestamp": 1741234500000,
      "pageId": "order-analysis"
    },
    {
      "level": "error",
      "message": "[bindRules] dataKey 'Orders@rows' resolved to null",
      "timestamp": 1741234501000,
      "pageId": "order-analysis"
    }
  ]
}
```

> 🧠 **这是关键**：AI 不是在"猜" bug，而是在读**真实运行日志**做诊断，如同一个拿着 console 面板的高级工程师。

---

## 五、使用场景全景图

### 🚀 场景 1：极速原型开发（1 小时出可演示产品）

**传统做法**：

```
业务分析 → 原型图 → UI 评审 → 前端编码（2天） → 联调 → 演示
```

**SPARK AI 做法**：

```
业务分析 → 自然语言描述（10 分钟）
         → AI 生成四文件（5 分钟）
         → SPARK 自动渲染（即时）
         → AI 迭代修正（3 轮，15 分钟）
         → 可演示原型（< 1 小时）
```

示例一句话提示词：

> "创建员工绩效看板：顶部卡片显示平均分/最高分/达标率三个指标（从 aggregates 聚合），下方表格列出员工姓名、部门、得分、等级（计算列：90+ 为 A，60+ 为 B，其余 C），支持部门筛选"

AI 理解业务语义 → 生成完整四文件 → SPARK 渲染出带聚合行、计算列的专业级列表页。

---

### 🔐 场景 2：配置驱动的权限渲染（改权限不改代码）

这是 SPARK 架构优越性最突出的场景。

**后端返回数据（携带权限快照）**：

```jsonc
{
  "rows": [
    {
      "id": 1, "name": "张三", "amount": 50000,
      "_perm": {
        "canEdit": true,
        "canDelete": false,
        "editableFields": ["name", "amount"]
      }
    }
  ],
  "_modelPerm": { "canAdd": true, "canImport": false }
}
```

**页面 script.js**（固定不变，权限数据变了 UI 自动变）：

```javascript
let _pageState = { tableData: [], modelPerm: null }

function __init__() {
  const view = $dataSet?.getView('Data', 'default')
  view?.events.on('rowsChanged', () => {
    _pageState.tableData = view.rows
  })
}

// 渲染函数：读 _perm，不写死任何角色判断
function RenderActions() {
  return h('div', _pageState.tableData.map(row =>
    h('span', [
      row._perm.canEdit   && h('button', { onClick: () => handleEdit(row)   }, '编辑'),
      row._perm.canDelete && h('button', { onClick: () => handleDelete(row) }, '删除'),
    ])
  ))
}
```

**测试不同角色**：只需切换后端返回的 `_perm` 数据，前端代码一行不动。

> 💡 **核心哲学**：框架代码是不变量，权限是数据流。

---

### 🌲 场景 3：树形主从联动（内存级联，零代码）

```jsonc
// pagedata.json 配置即完成父子联动
{
  "dataSetName": "OrgDS",
  "tables": {
    "Departments": { "rows": [{ "id": 1, "name": "研发部" }] },
    "Employees":   { "rows": [{ "id": 101, "deptId": 1, "name": "Alice" }] }
  },
  "relations": [{
    "parentTable": "Departments", "childTable": "Employees",
    "parentField": "id",          "childField": "deptId"
  }]
}
```

配置完成后的自动联动流程：

```
点击左侧部门树某行
    │
    ▼
Departments DataView.currentRow 更新
    │
    ▼
DataRelation 自动内存过滤 Employees
    │
    ▼
Employees DataView.rows 更新
    │
    ▼
右侧表格自动重渲（script.js 为空）
```

**整个过程：零行业务代码实现父子联动。**

---

### 🤖 场景 4：AI 驱动的自动化错误诊断

AI 通过 Logger 上报的日志自动发现**配置错误**，精准定位问题：

| 常见错误 | 日志特征 | AI 修复策略 |
|---------|---------|------------|
| dataKey 格式错误 | `[WARN] Unknown dataKey format: 'xxx'` | 修正 rule.json 中的 dataKey 写法 |
| DataSet 表名不存在 | `[WARN] DataSet has no table: 'Orders'` | 核对 pagedata.json 表名拼写 |
| tryAutoLoad 触发但无 API | `[ERROR] Table xxx has no API configuration` | 补充 pagedata.json 的 api.list 配置 |
| DataRelation 父字段拼写错误 | `[WARN] Parent row has no field 'ordreId'` | 修正 relations 中的 parentField |
| el-table 子列不显示 | 无渲染错误（AI 判断结构问题） | 检查 sparkChildren 注入配置 |

---

## 六、与传统开发模式的横向对比

| 维度 | 传统 Vue3 开发 | SPARK 配置驱动 | SPARK + AI 闭环 |
|------|---------------|---------------|----------------|
| 数据绑定 | 手写 ref/reactive | dataKey 配置 | AI 生成 dataKey |
| 父子联动 | Pinia / emit | DataRelation 配置 | AI 生成 relations |
| 计算列 | computed 属性 | computeExpression | AI 生成表达式 |
| 权限控制 | v-if + role 判断 | _perm 快照驱动 | AI 生成 Render* 函数 |
| 页面生产效率 | 1~3 天/页 | 2~4 小时/页 | **10~30 分钟/页（含迭代）** |
| 可维护性 | 随业务增长下降 | 高（配置集中） | 极高（AI 可理解配置） |
| 错误排查 | 手动 console.log | 结构化 Logger | **AI 自动读日志迭代** |

---

## 七、架构设计的深层逻辑

### 7.1 为什么 DataSet 不允许有"旁路"？

SPARK 明确规定：**`pageData` / `$data` 已删除，所有数据必须通过 DataSet**。

这不是限制，这是 **AI 可操作性**的前提。

AI 要理解一个页面，需要能"读懂"这个页面的全部数据结构。如果数据散落在 `ref`、`reactive`、`localStorage`、`Pinia` 各处，AI 无法建立完整的上下文模型。

DataSet 是一个**完全声明式、可序列化的数据描述**——AI 可以读它、生成它、修改它、理解它。这是 AI Page Loop 成立的根基。

```
散落的状态（AI 无法建模）           DataSet 单一入口（AI 完全可操作）
─────────────────────────────────────────────────────────
ref('tableData')  ──┐              pagedata.json
reactive({form})  ──┼──►  ❌       ──► parsePageData()
localStorage.xxx  ──┘              ──► DataSet（可序列化）
Pinia.users       ──                   ──► AI 读/写/生成
```

### 7.2 "能力 = 接口"：为 AI Agent 预留行为接缝

SPARK 所有组件间的通信**都经过能力键**：

```typescript
// 这个 consume，AI Agent 也能"理解"并参与
const services = consume(APP_SERVICES)  // IAppServicesCapability
services?.router?.push('/detail')       // 框架无关的导航抽象
```

当 AI Agent 需要"操控"SPARK 页面时，它只需要：
1. 持有 `ComponentContext` 引用
2. 调用 `consume(能力键)` 获取接口
3. 通过接口方法操作（与人工调用完全一样）

> 🔌 **能力系统天然是 AI Agent 的行为接口层**。

### 7.3 script.js 沙箱：隔离复杂，保留必要

script.js 在 `with(__ctx)` 沙箱中执行，AI 生成此文件时：

- **注入变量有明确契约**（`$api`、`$dataSet`、`$page`、`$route` 等）
- **禁止事项有明确规则**（禁止 `ElMessage`、禁止 `import`、禁止 Vue Router 直接引用）

这使得 AI 生成 script.js 时不会"发挥"——它只能在框架规定的语言框架内写业务逻辑，从源头降低了 AI 引入框架无关代码的风险。

> **设计心得**：好的 AI 友好架构 = 约束恰当的"命令空间" + 丰富的"能力接口" + 完善的"反馈回路"。SPARK 的四文件、能力系统和 Logger 正好对应这三点。

---

## 八、工程实践：在项目中接入 AI Loop

### Step 1：初始化 AI Loop（`main.ts`）

```typescript
import { initAILoop, setupHotReload } from '@/services/ai-loop'

const aiLoop = initAILoop({
  aiEndpoint: import.meta.env.VITE_AI_ENDPOINT ?? '/api/ai/chat',
  logCollectDelay: 3000,
  onFilesUpdated: (pageId) => {
    console.log(`[AI Loop] 页面 ${pageId} 已更新`)
  },
  onError: (err) => console.error('[AI Loop]', err),
})

// 设置 SSE 热重载（文件写入 → 自动清缓存 → 自动刷新页面）
setupHotReload(
  () => router.currentRoute.value.path.replace(/^\/+/, ''),
  () => router.go(0),
)
```

### Step 2：AI 后端接收的 Payload 结构

```typescript
interface AIRequestPayload {
  action: 'generate' | 'iterate'
  pageId: string
  prompt?: string          // generate 时必填
  sessionId: string        // 会话追踪（AIPageLoop 自动生成）
  feedback?: string        // iterate 时的用户追加说明
  currentFiles?: PageFiles // iterate 时的当前文件快照
  logs?: LogSnapshot[]     // iterate 时 Logger 收集的运行日志
}
```

### Step 3：为 AI 提供精准的系统提示词

SPARK 项目已内置高质量提示词模板（`docs/guides/SPARK_PAGE_CONFIG_PROMPT.md`），核心约定摘要：

```
你是 SPARK View 框架的页面配置专家，一次性生成全部 4 个文件。

严格遵守：
1. dataKey 格式：{tableName}@{field} 或 {tableName}@{viewId}@{field}
2. computeExpression 表达式：多语句体必须确保所有分支都有 return
3. script.js 沙箱：只写业务分支逻辑
   ✗ 禁止：ElMessage / import / window.xxx / ElMessageBox
   ✓ 允许：$api / $dataSet / $page / $route / SparkData / h
4. 视图级聚合通过 aggregates 配置，不写脚本
5. 父子联动通过 relations 配置，不写脚本
```

### Step 4：接入日志收集（Logger 传输器）

```typescript
import { getAILoop } from '@/services/ai-loop'

// 在 Logger 全局传输器中将日志推送给 AI Loop
createLogger({
  transports: [
    {
      write(entry) {
        getAILoop()?.collector.push({
          level:     entry.level,
          message:   entry.message,
          meta:      entry.meta,
          timestamp: entry.timestamp,
          pageId:    entry.meta?.pageId as string | undefined,
        })
      }
    }
  ]
})
```

---

## 九、未来方向：从"AI 辅助"到"AI 主导"

SPARK AI Page Loop 当前是"**协作模式**"——人提需求，AI 实现，人验收。

随着以下能力的成熟，这一模式将持续进化：

| 阶段 | 当前（2025~2026） | 近期规划 | 远期愿景 |
|------|-----------------|---------|---------|
| 需求输入 | 自然语言提示词 | 结构化需求单驱动 | 需求文档直接解析 |
| AI 产出 | 生成/修改四文件 | Agent 多轮协商迭代 | 主动探索最优配置 |
| 验收方式 | 人工验收 | 自动化截图 + 断言对比 | 视觉回归 + 语义验收 |
| 错误修复 | 日志反馈后手动触发 | 实时错误流自动推送 | 预测性错误修复 |
| Agent 能力 | 读日志、写文件 | 调用能力接口操控页面 | 端到端自主交付 |

当 AI 能够：

1. **读懂** Logger 日志（✅ 已实现）
2. **写出** 符合 SPARK 约束的四文件（✅ 已实现）
3. **理解** 能力树的上下文传递（✅ 框架已就绪）
4. **调用** 能力接口主动操控页面（🔜 接缝已预留）

那时，"**需求 → 页面**"的路径将真正缩短到：**一句话 → 一次 HTTP → 一个可交付页面**。

---

## 十、总结

| 维度 | 核心洞见 |
|------|---------|
| 🎯 **设计哲学** | 凡可配置，皆不编码；脚本只写框架无法替代的业务分支 |
| 🔗 **能力系统** | Symbol 键 + parent 链查找 = 类型安全的组件间接口契约 |
| 📦 **数据单一入口** | 所有数据通过 DataSet 流转，AI 可理解、可生成、可修改 |
| 🤖 **AI 闭环** | 提示词 → 生成 → 渲染 → Logger 上报 → AI 分析日志 → 再迭代 |
| 🛡️ **AI 友好性** | 四文件结构 + 沙箱约束 + 结构化日志 = AI 的最佳工作环境 |

软件开发的下一个十年，不是"AI 替代程序员"，而是：

> **能力驱动的框架 + AI 填充实现 = 人类专注于真正复杂的业务判断**

SPARK 在这条路上，已经走出了一个清晰的技术范式。

---

> 📌 **项目参考**：本文所有示例均来自 SPARK View 项目实际代码
>
> | 模块 | 路径 |
> |------|------|
> | 能力系统 | `packages/spark-utils/src/capability/symbols.ts` |
> | AI 闭环服务 | `src/services/ai-loop.ts` |
> | 数据流核心 | `packages/spark-data/src/` |
> | 页面渲染器 | `packages/spark-component/src/renderer/` |
> | 提示词模板 | `docs/guides/SPARK_PAGE_CONFIG_PROMPT.md` |

---

*作者：SPARK Team ｜ 发布：2026-03*
