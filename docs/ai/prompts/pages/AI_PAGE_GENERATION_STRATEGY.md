# AI 页面配置生成策略

> 通过 tree-demo（导航树编辑器工作台）实战迭代验证的提示词工程最佳实践。
>
> 目标：让 AI 一次正确生成 SPARK 页面配置的 4 个文件（pagedata.json, rule.json, script.js, style.css）。
>
> 所属： [AI 提示词体系](../README.md) / [页面生成](README.md) / 策略与实战版。

---

## 1. 迭代实验总结

### 1.1 实验过程

以 tree-demo（11 张表、4 条关系、15 列主表、10 个 TreeApi 端点、660 行 rule.json、550 行 script.js、340 行 style.css）为基准，进行了 6 轮 pagedata.json 提示词迭代 + 3 轮其他文件测试。

| 版本 | 策略 | 通过率 | 典型错误 |
|------|------|--------|----------|
| V1 | 纯业务描述 + 框架规范 | ❌ | `primaryKey` 代替 `isPrimaryKey`，API 带 `/api/` 前缀或手写完整 scoped 前缀，表内多余 `tableName` 字段 |
| V2 | V1 + 格式修正规则 | ❌ | relation 中混入旧扩展字段，破坏当前标准结构 |
| V3 | 逐表逐列完整指定 | ✅ | 无（但提示词冗长，接近"抄答案"） |
| V4 | 纯业务抽象描述 | ❌ | `dependencyType: "cascade"` 代替 `"currentRow"` |
| **V5** | **业务描述 + 格式约束网格** | **✅** | **无（最佳平衡点）** |
| V6 | V5 精简版（省略列细节） | ✅ | 结构正确但行数据内容有偏差 |

### 1.2 核心发现

1. **格式约束必须显式声明**——LLM 对框架自定义字段名和 relation 结构限制（`isPrimaryKey` vs `primaryKey`、标准 relation 字段 vs 旧扩展字段、`dependencyType: "currentRow"` vs `"cascade"`）无法从语境推断，必须**逐条列举**。

2. **业务语义可以抽象**——表的用途、列结构、行数据可以用自然语言描述（"8 种 nodeKind 下拉选项"），LLM 能推断出合理的列定义和数据行。

3. **行数据精度需要行数约束**——仅说"约 21 行"就能让 LLM 生成正确数量，但具体值可能有偏差。精确匹配需要在提示词中列出所有行。

4. **最佳策略是"业务描述 + 硬性格式约束"**（V5）：
   - **业务部分**：用自然语言描述表的职责、列含义、行数范围
   - **格式部分**：用规则清单严格约束字段名、URL 格式、关系结构

---

## 2. 提示词模板（4 文件分离版）

### 2.1 pagedata.json 提示词模板

**结构**：场景描述 → 表清单（表格形式）→ 关键表详细说明 → 关系定义 → 格式约束

```text
你是一个 SPARK 页面配置 AI 生成器。根据以下业务需求和框架约束，生成 pagedata.json。

## 业务场景
[用 3-5 句话描述页面功能，包含用户操作流程]

## 表清单（N 张表，按此顺序）

| # | 表名 | 用途 | 行数 | 特殊配置 |
|---|------|------|------|----------|
| 1 | TableA | 一句话描述 | N | 无 |
| 2 | TableB | 一句话描述 | 0 | API + autoLoad |
| ... |

[对有 API、计算列、treeConfig 的表展开说明列定义和 API 端点]

## 关系定义（M 条 tableRelations，按需补 viewDependencies）

| 链路说明 | parent→child | parentField→childField |
|---|---|---|
| 主从联动 | TableA→TableB | field1→field2 |
| ... |

## 格式约束（必须严格遵守）

- 根结构: `{ "dataset": { "dataSetName": "XxxDS", "tables": {}, "tableRelations": [] } }`
- 每张表: `{ "columns": [...], "views": { "default": { "rows": [...] } } }`（不加 tableName 字段）
- 主键: `"isPrimaryKey": true`（不是 `primaryKey`）
- 每列都有 name 和 type（string/number/boolean）
- API URL 不带 `/api/` 前缀；平台内置 scoped 资源优先写短资源路径（如 `/navigation/nodes`），不要手写 `/tenants/{tenantId}/projects/{projectId}`
- tableRelations 默认只写：`parentTable`、`childTable`、`parentField`、`childField`
- 非默认联动时再显式补 `viewDependencies`，其中可写：`parentTable`、`childTable`、`dependencyType`、`autoLoad`
- 不在 pagedata JSON 中手写 `parentViewId` / `childViewId`
- computeExpression 用多语句 if-return 格式，所有分支有 return
```

### 2.2 rule.json 提示词模板

**结构**：引用 pagedata 表名 → 页面骨架描述 → 区域分解 → 组件约束

```text
你是一个 SPARK 页面配置 AI 生成器。根据以下 UI 需求生成 rule.json。

## 页面数据表（来自 pagedata.json）
[列出所有表名和用途，标注 dataKey 绑定格式]

## 页面骨架
根容器: div.page-class，flex column 布局
├── 区域 A: [描述内容和组件]
├── 区域 B: [描述内容和组件]
└── 区域 C: [描述内容和组件]

## 区域详细说明
[对每个区域描述：使用什么容器组件、dataKey 绑定、子字段列表、布局参数]

## rule.json 格式约束
- 根是 JSON 数组 [...], 通常一个根 div
- 非结构字段(dataKey/id/on/name/field/class/style 等)写根级或 props 内皆可
- r-tree/r-form/r-detail/r-table 用 dataKey 绑定数据
- r-form/r-detail 子组件用 name 绑定行字段，props 含 label/colSpan
- 结构区统一用包装节点：r-toolbar / r-filter / r-actions / r-header / r-footer / r-tail
- on 事件值为 script.js 函数名字符串
- el-table-column width 是字符串，r-* width 是数字
- r-form gridColumns 默认 24，字段 colSpan 控制占比
```

### 2.3 script.js 提示词模板

**结构**：沙箱 API 速查 → 函数清单 → 数据流说明 → 编码约束

```text
你是一个 SPARK 页面脚本生成器。在 with(__ctx) 沙箱中生成 script.js。

## 沙箱可用变量
$dataSet, $page, $route, $query, $queryAll, $el, $refreshData, SparkData, h

## 页面数据表
[列出表名和关键视图，标注哪些是 API 表、哪些是内联表]

## 需要的函数

### __init__（页面入口）
[描述初始化流程：创建 TreeManager / 订阅事件 / 绑定视图]

### handle* 事件处理（列出所有函数名和功能）

### Render* 渲染函数（如有）

### 辅助函数（如有）

## 编码约束
- 不能用 import，所有依赖由沙箱注入
- 不能用 ElMessage/ElMessageBox，用 $page.showMessage/showConfirm
- 模块状态用 let _pageState = {...}
- var 用于函数内局部变量（沙箱 with 语义下 var 比 const/let 更安全）
- 对 API 操作用 try-catch + $page.showMessage 报错
- DataView 方法: getView / replaceRows / appendRow / updateRowById / deleteRowById
- TreeManager: SparkData.createTreeManager / buildNestedTree / addNodesToCache
- 树 API: getTreeApi() 返回 view 上的 treeApi（loadChildren/create/update/delete/move）
```

### 2.4 style.css 提示词模板

**结构**：页面 ID → 区域清单 → 样式需求 → 响应式

```text
你是一个 SPARK 页面样式生成器。生成 style.css。

## 作用域
所有选择器以 [data-page="page-id"] 开头。

## 页面区域和 class 映射
[列出 rule.json 中使用的 class 名和对应区域]

## 样式需求
- 整体布局: [flex column / grid / ...]
- 头部区域: [样式描述]
- 主体区域: [左右分栏比例、滚动行为]
- 表格/表单区域: [特殊覆盖]
- 自定义 Element Plus 覆盖: [如有]

## 响应式（如需）
- 断点 1: [宽度] → [变化]
- 断点 2: [宽度] → [变化]

## 约束
- 禁止全局选择器（不带 [data-page] 的）
- 使用 CSS 变量或直接值均可
- 优先 flexbox/grid 布局
```

---

## 3. 格式约束速查（必须包含在每个提示词中）

这些是 LLM 最容易犯错的点，**每次生成都必须显式声明**：

### pagedata.json

| 约束 | 正确 | 常见错误 |
|------|------|----------|
| 主键标记 | `"isPrimaryKey": true` | `"primaryKey": true` |
| 表对象字段 | 只有 `columns` + `views`（+ `api`） | 多加 `"tableName": "xxx"` |
| API URL | `/navigation/nodes`（平台 scoped 资源示例） | `/api/tenants/{tenantId}/projects/{projectId}/navigation/nodes` |
| tableRelations 字段 | 默认只写 `parentTable` / `childTable` / `parentField` / `childField` | 混入 `autoLoad` / `parentViewId` / `childViewId` |
| viewDependencies | 非默认联动时才显式写 `dependencyType` / `autoLoad` | 把 `dependencyType` 塞进 tableRelations |
| 关系视图 ID | 不在 pagedata JSON 中手写 `parentViewId` / `childViewId` | 强行要求显式写 `default` |
| 计算列 | 所有分支必须 `return` | 缺少最终 `return` |

### rule.json

| 约束 | 正确 | 常见错误 |
|------|------|----------|
| 根结构 | `[{ "type": "div", ... }]` | `{ "type": "div" }` |
| el-table-column width | 字符串 `"80"` | 数字 `80` |
| r-* 字段 width | 数字 `120` | 字符串 `"120"` |
| 事件绑定值 | 函数名字符串 `"handleClick"` | 内联函数 |
| 结构区声明 | `"type": "r-toolbar"` / `"r-filter"` / `"r-actions"` | 用 `"dock": "toolbar"` 等旧写法 |

### script.js

| 约束 | 正确 | 常见错误 |
|------|------|----------|
| 模块导入 | 禁止 `import` | `import { xxx } from '...'` |
| UI 消息 | `$page.showMessage(msg, 'success')` | `ElMessage.success(msg)` |
| 变量声明 | `var` / `let` / 闭包 | `const`（with 语义下部分场景有问题） |
| 树创建 | `SparkData.createTreeManager(config, nodes)` | `new TreeManager(...)` |
| DataView 获取 | `$dataSet?.getView('Table', 'default')` | `$dataSet.tables.Table` |

### style.css

| 约束 | 正确 | 常见错误 |
|------|------|----------|
| 选择器前缀 | `[data-page="xxx"]` | 无前缀全局选择器 |
| page-id 格式 | kebab-case | camelCase |

---

## 4. 验证脚本

生成后使用以下 Node.js 脚本自动验证 pagedata.json 正确性：

```javascript
// node validate-pagedata.js <generated.json> <reference.json>
const g = require(process.argv[2]).dataset;
const r = require(process.argv[3]).dataset;
let err = [];

// 1. 表数量和名称
const gt = Object.keys(g.tables), rt = Object.keys(r.tables);
if (gt.length !== rt.length) err.push(`table count: ${gt.length} vs ${rt.length}`);
for (const t of rt) { if (!g.tables[t]) err.push(`missing table: ${t}`); }

// 2. 表顺序（父表在子表之前）
// [按业务需求自定义检查]

// 3. isPrimaryKey（不能用 primaryKey）
for (const [tn, t] of Object.entries(g.tables)) {
  for (const c of t.columns || []) {
    if (c.primaryKey !== undefined) err.push(`${tn}.${c.name}: has primaryKey`);
  }
  if (!t.columns.some(c => c.isPrimaryKey)) err.push(`${tn}: no isPrimaryKey`);
}

// 4. 无 tableName 字段
for (const [tn, t] of Object.entries(g.tables)) {
  if (t.tableName) err.push(`${tn}: has tableName`);
}

// 5. API URL 无 /api/ 前缀；平台 scoped 资源不要展开 tenant/project scope
const isExpandedPlatformScopedUrl = (url) =>
  /^\/(?:api\/)?tenants\/\{tenantId\}\/projects\/\{projectId\}\/(?:navigation|data|pages-config)(?:\/|$)/.test(url);

for (const [tn, t] of Object.entries(g.tables)) {
  if (t.api) for (const [k, v] of Object.entries(t.api)) {
    if (v.url?.startsWith('/api/')) err.push(`${tn} API ${k}: /api/ prefix`);
    if (isExpandedPlatformScopedUrl(v.url ?? '')) err.push(`${tn} API ${k}: expanded tenant/project scope`);
  }
}

// 6. 行数对比
for (const [tn, t] of Object.entries(r.tables)) {
  const expected = (t.views?.default?.rows || []).length;
  const actual = (g.tables[tn]?.views?.default?.rows || []).length;
  if (actual !== expected) err.push(`${tn} rows: ${actual} vs ${expected}`);
}

// 7. 关系结构
for (const rel of g.tableRelations || []) {
  if (rel.autoLoad !== undefined || rel.parentViewId !== undefined || rel.childViewId !== undefined) {
    err.push('tableRelation has invalid non-standard fields');
  }
  if (rel.dependencyType !== undefined) err.push('tableRelation should not carry dependencyType');
}

for (const dep of g.viewDependencies || []) {
  const depType = dep.dependencyType || 'currentRow';
  if (!['currentRow', 'selectedRows', 'allRows', 'pagedRows'].includes(depType)) {
    err.push(`viewDependency dep: ${dep.dependencyType}`);
  }
  if (dep.parentField !== undefined || dep.childField !== undefined || dep.parentViewId !== undefined || dep.childViewId !== undefined) {
    err.push('viewDependency has invalid fields');
  }
}

if (err.length === 0) console.log('ALL CHECKS PASSED ✅');
else { console.log(`FAILED (${err.length} errors):`); err.forEach(e => console.log(`  ❌ ${e}`)); }
```

---

## 5. 提示词最佳实践

### 5.1 分层策略

| 层次 | 内容 | 抽象度 |
|------|------|--------|
| **业务场景** | 页面功能、用户操作流程 | 高（自然语言） |
| **表/组件清单** | 表名、列名、行数、组件类型 | 中（结构化表格） |
| **关键配置** | API 端点、计算列表达式、关系定义 | 低（接近精确值） |
| **格式约束** | 字段名、URL 格式、结构规则 | 零（必须精确） |

**原则**：**越接近框架特有约定的部分，越需要精确指定；越接近业务语义的部分，可以越抽象。**

### 5.2 提示词长度与正确率的权衡

```
精确度 ──────────────────────────────────►
  │
  ├─ V3（逐行指定）     ✅ 100% 正确，但提示词 ≈ 答案
  │
  ├─ V5（业务+约束）    ✅ 100% 正确，提示词约为答案的 1/3
  │   ← 最佳平衡点
  ├─ V6（精简约束）     ✅ 结构正确，行数据有偏差
  │
  └─ V4（纯业务描述）   ❌ 格式错误（dependencyType）
```

**推荐使用 V5 策略**：
- 表清单用 Markdown 表格概述
- 关键表（有 API/计算列/treeConfig）展开说明
- 关系定义用表格精确指定
- 格式约束用规则列表严格声明

### 5.3 常见 LLM 陷阱

1. **字段名和 relation 结构混淆**：LLM 倾向于使用更"通用"的字段名或补出旧扩展字段（如 `primaryKey`、`relationName`、`cascadeDelete`）→ 必须显式纠正
2. **URL 前缀**：LLM 习惯给 API URL 加 `/api/` 前缀，或把平台 scoped 资源写成完整 `/tenants/{tenantId}/projects/{projectId}/...` → 必须声明“pagedata 里不带 /api/，平台资源优先短路径”
3. **级联类型**：LLM 倾向用 `"cascade"` → 必须声明 `"currentRow"` 并解释含义
4. **表结构冗余**：LLM 喜欢加 `tableName` 字段 → 必须声明"只有 columns + views"
5. **computeExpression 缺少 return**：多语句时 LLM 可能遗漏最后的 `return` → 必须声明"所有分支有 return"

### 5.4 4 文件生成顺序

推荐**分文件独立生成**而非一次生成 4 个文件，原因：

1. **token 预算**：4 个文件总量可达 2000+ 行，单次生成容易超出 context 限制
2. **错误隔离**：分文件生成可以逐个验证，单个失败不影响其他
3. **提示词专注**：每个文件的格式约束不同，专用提示词更精确

生成顺序：

```
1. pagedata.json  ← 数据基础，其他文件引用其表名/列名
2. rule.json      ← UI 结构，引用 pagedata 表名（dataKey）
3. script.js      ← 业务逻辑，引用 pagedata 表名 + rule.json 事件名
4. style.css      ← 样式，引用 rule.json 中的 class 名
```

每个文件生成后用 review/验证脚本检查，确认无误后作为下一个文件的输入上下文。

---

## 6. tree-demo 已验证的提示词

以下为 tree-demo 页面各文件的实战提示词，已通过自动化验证。

### 6.1 pagedata.json（V5 版，100% 通过）

```text
你是一个 SPARK 页面配置 AI 生成器。根据以下业务需求和框架约束，生成 pagedata.json。

## 1. 业务场景

生成一个「导航树编辑器工作台」的 pagedata.json。这个页面允许用户：
- 可视化浏览和编辑一棵导航树（NavigationNodes），支持增删改查、拖拽移动
- 树节点有不同 nodeKind（系统目录、模块、系统页面、页面、子页面、系统动作、外链、引用），
  每种 nodeKind 对应不同的编辑选项
- 右侧表单编辑当前选中节点的属性（path、linkTarget、childPlacement、refId 等）
- 顶部过滤工具栏（按关键词、nodeKind、placement 过滤）
- 顶部状态摘要卡片 (PageMeta) 显示统计信息
- 底部操作日志表格 (ActionLogs) 记录操作历史

## 2. 表清单（11 张表）

按此精确顺序排列：

1. **PageMeta** — 页面统计元数据（只读）
   - columns: id(number,PK), totalNodes(number), pageCount(number), groupCount(number),
     refCount(number), hiddenCount(number), statusText(string), lastSync(string)
   - 1 行默认数据：全 0，statusText="等待服务端数据"，lastSync="-"

2. **EditorFilters** — 过滤条件（表单双向绑定）
   - columns: id(number,PK), searchKeyword(string), nodeKindFilter(string),
     placementFilter(string)
   - 1 行默认数据：所有 filter 为空字符串

3. **NavigationNodes** — 导航节点主表（带树 API + 远程 CRUD）
   - columns（15 列）: id(string,PK), parentId(string), title(string),
     description(string), icon(string), nodeKind(string), path(string),
     linkTarget(string), childPlacement(string), sortOrder(number),
     dividerAfter(boolean), hidden(boolean), disabled(boolean), refId(string),
     editorProfileKey(string, 计算列)
   - editorProfileKey 的 computeExpression：根据 nodeKind 映射到编辑配置文件类型
     - system-directory / module → 'container'
     - system-page / page / sub-page → 'page'
     - link → 'link', ref → 'ref', system-action → 'action'
     - 默认 → 'page'
   - views.default: autoLoad=true, autoCommit=true, autoCurrentFirst=true
   - treeConfig: { idField:"id", parentIdField:"parentId", textField:"title",
     treeMode:"nested" }
   - api（10 端点；生成时写短资源路径，不写 scoped 前缀）:
     list(GET /navigation/nodes), nested(GET /navigation/nodes), children(GET /navigation/nodes), path(GET /navigation/nodes/path/{id}),
     subtree(POST /navigation/nodes/subtree), nestedSearch(GET /navigation/nodes/search),
     create(POST /navigation/nodes), update(PUT /navigation/nodes/{id}), delete(DELETE /navigation/nodes/{id}),
     move(PUT /navigation/nodes/{id}/move)
   - 无内联 rows

4. **NodeKindOptions** — nodeKind 下拉选项
   - columns: id(number,PK), label(string), value(string)
   - 8 行：system-directory, module, system-page, page, sub-page, system-action, link, ref

5. **NodeKindFilterOptions** — nodeKind 过滤下拉（含"全部"）
   - 同上结构，9 行：all(全部类型) + 上面 8 种

6. **ChildPlacementOptions** — 子节点布局（按 nodeKind 级联）
   - columns: id(number,PK), nodeKind(string), label(string), value(string)
   - 每个 nodeKind 都有自己的布局选项组合，共约 21 行
   - 级联键: nodeKind

7. **PlacementFilterOptions** — 布局过滤下拉（含"全部"）
   - 7 行：all(全部布局), header, sidebar, footer, main, drawer, flat

8. **LinkTargetOptions** — 链接打开方式（按 nodeKind 级联）
   - columns: id(number,PK), nodeKind(string), label(string), value(string)
   - 不同 nodeKind 有不同选项，共约 10 行
   - 级联键: nodeKind

9. **RefNodeKindOptions** — 引用节点可选类型（按 profileKey 级联）
   - columns: id(number,PK), profileKey(string), label(string), value(string)
   - 仅 ref 节点使用，4 行（page/sub-page/link/module）
   - 级联键: profileKey

10. **NodeEditorProfiles** — 编辑器配置文件
    - columns: id(number,PK), profileKey(string), label(string),
      allowPath(boolean), allowLinkTarget(boolean),
      allowChildPlacement(boolean), allowRefId(boolean)
    - 5 行：container, page, link, ref, action

11. **ActionLogs** — 操作日志
    - columns: id(number,PK), time(string), action(string), target(string),
      status(string), detail(string)
    - 无内联 rows

## 3. 数据关系（4 条 DataRelation）

所有关系都是内存级联（子表无 API，父行切换时自动过滤）。

| 链路说明 | parentTable | childTable | parentField | childField |
|---|---|---|---|---|
| 编辑配置联动 | NavigationNodes | NodeEditorProfiles | editorProfileKey | profileKey |
| 链接方式联动 | NavigationNodes | LinkTargetOptions | nodeKind | nodeKind |
| 布局方式联动 | NavigationNodes | ChildPlacementOptions | nodeKind | nodeKind |
| 引用类型联动 | NavigationNodes | RefNodeKindOptions | editorProfileKey | profileKey |

## 4. 格式约束（必须严格遵守）

- 根结构: { "dataset": { "dataSetName": "NavigationEditorDS", "tables": {}, "tableRelations": [] } }
- 每张表: { "columns": [...], "views": { "default": { "rows": [...] } } }（不加 tableName 字段）
- 主键: "isPrimaryKey": true（不是 primaryKey）
- 每列都有 name 和 type
- API URL 不带 /api/ 前缀；平台内置 scoped 资源直接写短资源路径，如 /navigation/nodes，不要手写 /tenants/{tenantId}/projects/{projectId}
- tableRelations 默认只写 parentTable / childTable / parentField / childField
- 非默认联动时再显式补 viewDependencies；不要手写 parentViewId / childViewId
- computeExpression 用多语句 if-return 格式，所有分支有 return
```

### 6.2 rule.json 提示词（已验证通过）

```text
你是一个 SPARK 页面配置 AI 生成器。根据以下 UI 需求生成 rule.json（JSON 数组）。

## 数据表（来自 pagedata.json）

| 表名 | dataKey 绑定 |
|------|-------------|
| PageMeta | PageMeta@currentRow（r-detail 摘要卡片） |
| EditorFilters | EditorFilters@currentRow（r-form 过滤表单） |
| NavigationNodes | NavigationNodes@rows（r-tree）+ NavigationNodes@currentRow（r-form 编辑） |
| NodeKindOptions | 下拉 optionKey |
| NodeKindFilterOptions | 下拉 optionKey |
| ChildPlacementOptions | 下拉 optionKey |
| PlacementFilterOptions | 下拉 optionKey |
| LinkTargetOptions | 下拉 optionKey |
| RefNodeKindOptions | 下拉 optionKey |
| NodeEditorProfiles | 编辑器配置（脚本消费） |
| ActionLogs | ActionLogs@rows（r-table 操作日志） |

## 页面骨架

根容器: div.nav-editor-page，flex column，100% 高度，20px padding

### 区域 1：页面头部
- CSS Grid 2 列（auto 1fr）
- 左列：h2 标题"导航编辑工作台" + p 副标题
- 右列：r-detail 绑定 PageMeta@currentRow，gridColumns=4，5 个字段：
  totalNodes(label 节点总数), pageCount(页面数), groupCount(分组数),
  refCount(引用数), statusText(状态，colSpan=2)

### 区域 2：过滤工具栏
- r-form 绑定 EditorFilters@currentRow，inline=true，gridColumns=24
- 3 个字段：
  - r-text name=searchKeyword（搜索关键词，placeholder，colSpan=8）
  - r-select name=nodeKindFilter（节点类型，optionKey=NodeKindFilterOptions，colSpan=6）
  - r-select name=placementFilter（布局方式，optionKey=PlacementFilterOptions，colSpan=6）
- dock="toolbar" 区域 2 个按钮：搜索(handleSearch) + 重置(handleReset)

### 区域 3：主体（el-row 左右布局）
- el-row gutter=20
- 左列 el-col span=8：树面板
  - el-card header="导航树"
  - 内含 r-tree id="treeEditor"，dataKey=NavigationNodes@rows
  - r-tree props: node-key=id, highlight-current=true, default-expand-all=false,
    expand-on-click-node=false, show-checkbox=false,
    onNodeClick=handleNodeClick, onNodeExpand=handleNodeExpand
  - r-tree-node-summary 子组件
  - dock="toolbar" 区域按钮：添加根节点(handleAddRootNode)、展开全部(handleExpandAll)、
    折叠全部(handleCollapseAll)、刷新(handleRefreshTree)
  - dock="actions" 区域按钮：添加子节点(handleAddChildNode)、编辑(handleEditTreeNode)、
    删除(handleDeleteTreeNode)、上移(handleMoveUp)、下移(handleMoveDown)

- 右列 el-col span=16：节点编辑区
  - el-card header="节点编辑"
  - r-form id="nodeEditorForm"，dataKey=NavigationNodes@currentRow，
    labelWidth=100px，gridColumns=24
  - 字段列表（均为 r-* 字段组件，name 对应 NavigationNodes 列名）：
    - title(r-text, colSpan=12), nodeKind(r-select, colSpan=12, optionKey=NodeKindOptions)
    - description(r-textarea, colSpan=24)
    - path(r-text, colSpan=12), icon(r-text, colSpan=12)
    - linkTarget(r-select, colSpan=12, optionKey=LinkTargetOptions)
    - childPlacement(r-select, colSpan=12, optionKey=ChildPlacementOptions)
    - sortOrder(r-number, colSpan=8), dividerAfter(r-switch, colSpan=8),
      hidden(r-switch, colSpan=8)
    - disabled(r-switch, colSpan=8), refId(r-select, colSpan=16,
      optionKey=RefNodeKindOptions)
  - dock="toolbar" 保存按钮(handleSaveNode, type=primary)

### 区域 4：操作日志
- el-card header="操作日志"
- r-table dataKey=ActionLogs@rows，border=true, stripe=true, size=small, maxHeight=300
- 列：time(120), action(100), target(150), status(100), detail(flex)
- dock="toolbar"：清空日志按钮(handleClearLogs, size=small, type=danger)

## 格式约束
- 根是 JSON 数组 [{ "type": "div", ... }]
- r-tree/r-form/r-detail/r-table 用 dataKey 绑定
- r-select 的 optionKey 值为表名字符串
- on 事件值为字符串函数名
- dock 写在子节点根级
```

### 6.3 script.js 提示词（已验证通过）

```text
你是一个 SPARK 页面脚本生成器。生成运行在 with(__ctx) 沙箱中的 script.js。

## 沙箱可用变量
$dataSet, $page, $route, $query, $queryAll, $el, $refreshData, SparkData, h

## 页面数据表
- NavigationNodes（远程 API 树，主表）
- EditorFilters（过滤条件，内联）
- PageMeta（统计元数据，内联）
- NodeKindOptions / NodeKindFilterOptions（选项）
- ChildPlacementOptions / PlacementFilterOptions（选项）
- LinkTargetOptions / RefNodeKindOptions（选项）
- NodeEditorProfiles（编辑器配置）
- ActionLogs（操作日志，内联）

## 需要实现的功能

### _pageState 模块状态
{ treeManager: null, currentNode: null, isEditing: false, filterTimer: null }

### __init__() 页面入口
1. 获取 NavigationNodes 的 default 视图
2. 订阅 rowsChanged：行数据变化时更新 PageMeta 统计
3. 订阅 currentRowChanged：当前节点变化时更新 _pageState.currentNode
4. 订阅 requestStateChanged：请求状态变化时更新 PageMeta.statusText
5. 等待 treeApi 可用（轮询 view.treeApi，间隔 200ms，最多 30 次）
6. treeApi 可用后调用 loadChildren(null) 加载根节点

### 辅助函数
- getView(tableName) → $dataSet?.getView(tableName, 'default')
- getTreeApi() → getView('NavigationNodes')?.treeApi
- getNodeEditorApi() → getView('NavigationNodes')?.crudApi
- waitForApi(getter, name) → Promise，轮询等待 API 可用
- logAction(action, target, status, detail) → 向 ActionLogs 追加一条日志
- updatePageMeta() → 遍历树统计各类节点数量，更新 PageMeta

### 树操作
- bindTreeView(view) → 绑定视图事件
- reloadTreeFromServer() → treeApi.loadChildren(null) 重新加载
- applyTreeFilters() → 根据 EditorFilters 的 searchKeyword/nodeKindFilter/placementFilter
  在本地过滤树节点（walkTree 遍历 + filterTreeRows 过滤），结果 replaceRows 到视图
- walkTree(nodes, fn) → 递归遍历树节点
- filterTreeRows(rows, keyword, kindFilter, placementFilter) → 返回过滤后的嵌套树

### CRUD 处理函数
- handleAddRootNode() → $page.showPrompt 输入名称 → treeApi.create → reload → logAction
- handleAddChildNode() → 检查当前节点 → showPrompt → treeApi.create(含 parentId) → reload
- handleEditTreeNode() → 设置 _pageState.isEditing = true
- handleDeleteTreeNode() → showConfirm → treeApi.delete → reload → logAction
- handleSaveNode() → 收集表单数据 → crudApi.update → reload → logAction
- handleMoveUp() / handleMoveDown() → treeApi.move({direction}) → reload → logAction

### 树视图操作
- handleExpandAll() / handleCollapseAll() → $query('#treeEditor') 获取树组件实例
- handleRefreshTree() → reloadTreeFromServer
- handleNodeClick(nodeData) → 由 r-tree 事件驱动
- handleNodeExpand(nodeData) → 可选懒加载

### 过滤操作
- handleSearch() → applyTreeFilters()
- handleReset() → 清空 EditorFilters → reloadTreeFromServer

### 日志操作
- handleClearLogs() → showConfirm → ActionLogs view.replaceRows([])

## 编码约束
- 不能用 import
- 不能用 ElMessage，用 $page.showMessage / showConfirm / showPrompt
- 函数内用 var 声明局部变量
- 对 API 操作 try-catch + $page.showMessage 报错
- logAction 格式：{ id: Date.now(), time: new Date().toLocaleTimeString(),
  action, target, status, detail }
```

### 6.4 style.css 提示词（已验证通过）

```text
你是一个 SPARK 页面样式生成器。生成 style.css。

## 作用域
所有选择器以 [data-page="tree-demo"] 开头。

## 页面结构和 class 映射

| class / 元素 | 区域 |
|---|---|
| .nav-editor-page | 根容器 (flex column, 100vh) |
| .page-header | 头部 (CSS grid 2列) |
| .page-header h2 | 主标题 |
| .page-header p | 副标题 |
| .filter-toolbar | 过滤工具栏 |
| .tree-panel | 左侧树面板容器 |
| .tree-scroll-wrapper | 树滚动区域 (overflow-y:auto, flex:1) |
| .editor-panel | 右侧编辑面板 |
| .action-logs-section | 底部操作日志区 |

## 样式需求

### 整体布局
- flex column, 100vh, 20px padding, gap 20px
- 背景 #f5f7fa

### 头部
- CSS grid, 2 列 (auto 1fr)
- 标题 #2c3e50, 24px 粗体
- 副标题 #7f8c8d, 14px
- 统计卡片 r-detail 右对齐

### 过滤工具栏
- 白色背景, 圆角, 阴影, 16px padding

### 主体左右布局
- el-row 内 el-col 8:16 比例
- 左侧树面板：el-card 内 flex column, 高度 calc(100vh - 280px)
- 树滚动区域: flex:1, overflow-y:auto, 自定义滚动条
- 右侧编辑面板：el-card 同高

### 操作日志
- 最大高度 300px, 小字号

### 自定义滚动条
- 6px 宽, 圆角, #dcdfe6 轨道, #c0c4cc 滑块, hover #909399

### 响应式
- @media (max-width: 1360px): el-col 比例改为 10:14
- @media (max-width: 768px): 垂直堆叠, 树面板高度 400px
```

---

## 7. 已知局限

1. **行数据精确值**：LLM 能生成正确数量的行，但具体 value/label 可能与预期有偏差。对于下拉选项等关键数据，建议在提示词中列出所有可能的值。

2. **复杂 computeExpression**：多分支 if-return 表达式的默认值（fallback return）LLM 可能生成不同的值。建议在提示词中明确 fallback。

3. **CSS 细节**：像素值、颜色值等 LLM 会生成"合理但不同"的值。如需精确匹配需在提示词中指定。

4. **token 限制**：tree-demo 级别的复杂页面（4 文件总计 2000+ 行），单次生成所有文件可能超出 context window。推荐分文件生成。

5. **跨文件一致性**：分文件生成时，后续文件需要引用前面文件的表名、事件名、class 名。建议将已生成文件的关键信息（表名清单、事件清单等）作为后续提示词的输入。
