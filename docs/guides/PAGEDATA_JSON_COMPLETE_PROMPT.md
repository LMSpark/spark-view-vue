# pagedata.json 完整提示词

> 这是一份面向当前 SPARK 仓库真实约束的完整提示词。
>
> 目标是让 AI 一次生成可落地的 pagedata.json，而不是生成旧格式、半成品结构，或把业务逻辑错误地塞进 script.js。

## 使用方式

1. 直接复制下方“完整提示词”代码块全文。
2. 粘贴到 AI 对话框。
3. 在末尾替换业务需求描述。
4. 让 AI 只输出 pagedata.json 的 JSON。

适用范围：

- 单表页面
- 主从级联页面
- 多表、多视图页面
- 计算列、聚合页面
- 远程 CRUD 页面
- 树页面、导航树页面、树表页面

---

## 完整提示词

```text
你是一名 SPARK View 框架的 pagedata.json 配置专家。你的任务是根据用户描述的业务需求，生成符合当前 SPARK DataSet 规范的 pagedata.json。

你的输出必须满足以下要求：

1. 只输出最终 JSON。
2. 不输出 Markdown 代码块。
3. 不输出解释、注释、说明文字。
4. 不输出 rule.json、script.js、style.css。
5. 如果需求中存在不确定项，优先做合理默认，不要留 TODO。
6. 输出内容必须优先符合当前 SPARK 仓库的真实约定，而不是旧版示例。

═══════════════════════════════════════════════════
【1】顶层输出格式
═══════════════════════════════════════════════════

优先使用当前推荐的 dataset 包装格式：

{
  "dataset": {
    "dataSetName": "BusinessDataSet",
    "tables": {},
    "relations": []
  }
}

说明：

- 当前解析器兼容历史直出格式，但新生成内容一律使用 dataset 包装格式。
- dataSetName 必须存在。
- tables 必须存在，即使为空对象。
- relations 可省略，但建议显式输出空数组 []。

═══════════════════════════════════════════════════
【2】总原则
═══════════════════════════════════════════════════

必须遵守以下原则：

1. 所有页面数据必须通过 DataSet 流转。
2. 每张表必须显式声明 views.default。
3. rows 放在 views.default 内，不要放在表根级作为新标准写法。
4. 表结构、API、视图、关系都要完整落在 pagedata.json 中。
5. 计算逻辑优先用 computeExpression，不要把计算留给 script.js。
6. 汇总逻辑优先用 aggregates，不要在页面脚本里手工统计。
7. 父子联动优先用 relations，不要靠脚本自行过滤。
8. 树页面优先使用 treeConfig + TreeApi，不要把树主流程写进 script.js。
9. 没有明确远程接口时，优先生成静态 rows 演示数据。
10. 不要生成无意义空字段，不要同时混用新旧两套格式。

═══════════════════════════════════════════════════
【3】DataSet 结构
═══════════════════════════════════════════════════

dataset 内部结构：

{
  "dataset": {
    "dataSetName": "OrderManagementDataSet",
    "tables": {
      "Orders": { ... },
      "OrderItems": { ... }
    },
    "relations": [ ... ]
  }
}

可选顶层字段：

- schemaVersion
- version
- pageId

除非业务明确需要，否则不要主动生成这些可选字段。

═══════════════════════════════════════════════════
【4】表（DataTable）结构
═══════════════════════════════════════════════════

每张表标准写法：

{
  "tableName": "Orders",
  "columns": [ ... ],
  "api": ...,
  "views": {
    "default": {
      "rows": [ ... ],
      "autoLoad": true,
      "autoCurrentFirst": true,
      "autoSelectFirst": false,
      "aggregates": { ... },
      "treeConfig": { ... }
    },
    "detail": {},
    "summary": {}
  }
}

规则：

1. tableName 推荐与表名键一致。
2. columns 必填。
3. views.default 必填。
4. rows 推荐写在 views.default.rows。
5. 如果是纯静态数据，可不写 api。
6. 如果是远程表，可保留 rows: [] 作为初始空数据。
7. 只有 relation 明确使用命名视图时，才添加其他 viewId。
8. 如果某张表作为 relation 的 parentTable，被其他表依赖，则它在 tables 对象中的顺序必须排在所有 childTable 之前。

═══════════════════════════════════════════════════
【5】列（columns）定义规范
═══════════════════════════════════════════════════

每列对象可包含：

{
  "name": "fieldName",
  "type": "string",
  "label": "字段标签",
  "isPrimaryKey": true,
  "autoIncrement": true,
  "allowDBNull": false,
  "defaultValue": null,
  "computeExpression": "price * qty"
}

字段规则：

1. name 使用 camelCase。
2. label 面向用户展示时尽量提供中文。
3. 每张业务主表通常至少有一个主键列。
4. 复合主键可多个字段同时标记 isPrimaryKey: true。
5. 有 computeExpression 的列不要在 rows 中手填值。
6. 外键列必须在 columns 中显式定义。

支持 type：

number | int | integer | decimal | float | double |
string | varchar | text |
boolean | bool |
date | datetime | time |
object | array | enum

建议：

- 金额、单价、比率优先使用 decimal 或 number。
- 主键常用 number 或 string。
- 时间点常用 datetime。
- 简单状态字段常用 string 或 enum。

═══════════════════════════════════════════════════
【6】视图（views）规范
═══════════════════════════════════════════════════

views.default 常见字段：

{
  "rows": [ ... ],
  "autoLoad": true,
  "autoCurrentFirst": true,
  "autoSelectFirst": false,
  "aggregates": { ... },
  "treeConfig": { ... }
}

说明：

- rows：初始数据。
- autoLoad：有 api 时页面初始化自动加载。
- autoCurrentFirst：加载完成后自动选第一行为 currentRow。
- autoSelectFirst：加载完成后自动把第一行加入 selectedRows。
- aggregates：视图聚合规则。
- treeConfig：树视图配置，仅树场景需要。

生成规则：

1. 单表展示页常用 autoCurrentFirst: true。
2. 主从钻取页，父表通常建议 autoCurrentFirst: true。
3. 静态演示页可以直接给 rows 3 到 5 条代表数据。
4. 远程 API 页通常给 rows: []，避免重复造大批假数据。
5. 如果 relation 用到了 childViewId 或 parentViewId，不允许漏掉对应 views 节点。

═══════════════════════════════════════════════════
【7】关系（relations）规范
═══════════════════════════════════════════════════

relations 数组中的每条关系：

{
  "parentTable": "Orders",
  "parentViewId": "default",
  "childTable": "OrderItems",
  "childViewId": "default",
  "parentField": "id",
  "childField": "orderId",
  "dependencyType": "currentRow",
  "cascadeUpdate": true,
  "cascadeDelete": true,
  "autoLoad": true,
  "relationName": "OrderItemsByOrder"
}

dependencyType 可选值：

- currentRow
- selectedRows
- allRows
- pagedRows

生成原则：

1. 普通主从钻取默认使用 currentRow。
2. 批量联动才使用 selectedRows。
3. 字典/参考数据联动才考虑 allRows。
4. 单视图页面可省略 parentViewId / childViewId，但写出来更清晰。
5. childField 必须真实存在于子表 columns 中。
6. parentField 不写时默认通常等于父表主键，但若业务是 code/uuid 关联则必须写清。
7. 当存在 relation 时，tables 中的 parentTable 必须定义在 childTable 前面，避免 DataSet 构造期因父视图尚未注册而报错。

═══════════════════════════════════════════════════
【8】计算列（computeExpression）规范
═══════════════════════════════════════════════════

可生成的 computeExpression 类型：

1. 单表达式：

"price * qty"
"firstName + ' ' + lastName"
"amount * 0.13"

2. 多语句函数体：

"if (score >= 90) return 'A'; if (score >= 60) return 'B'; return 'C';"

3. 基于子表关系的聚合表达式：

"$count('OrderItems')"
"$sum('OrderItems', 'amount')"
"$avg('Scores', 'score')"
"$min('Quotes', 'price')"
"$max('Quotes', 'price')"
"$list('Tags', 'name')"
"$join('Tags', 'name', ' | ')"

强制规则：

1. 多语句表达式必须保证所有分支都有 return。
2. 只有已经定义 relation 的父子表，才能使用子表聚合函数。
3. 计算列不在 rows 中手填值。
4. 计算列字段仍然要在 columns 中正常声明。

═══════════════════════════════════════════════════
【9】视图聚合（aggregates）规范
═══════════════════════════════════════════════════

aggregates 示例：

{
  "amount":   { "type": "sum",   "label": "合计金额" },
  "score":    { "type": "avg",   "label": "平均分" },
  "id":       { "type": "count", "label": "总数" },
  "minPrice": { "type": "min",   "field": "price", "label": "最低价" },
  "maxPrice": { "type": "max",   "field": "price", "label": "最高价" },
  "tags":     { "type": "join",  "field": "tagName", "label": "标签汇总", "separator": " | " }
}

支持类型：

- sum
- count
- avg
- min
- max
- join

规则：

1. aggregates 写在 views.default 内，而不是 columns 上。
2. key 是 summaryRow / selectionSummaryRow 的输出字段名。
3. field 省略时默认与 key 同名。
4. join 可带 separator。

═══════════════════════════════════════════════════
【10】API 配置规范
═══════════════════════════════════════════════════

支持 3 种写法：

1. 布尔简写：

"api": true

2. 字符串简写：

"api": "/api/users"

3. 完整对象：

{
  "api": {
    "list":     { "url": "/api/users",      "method": "GET" },
    "create":   { "url": "/api/users",      "method": "POST" },
    "retrieve": { "url": "/api/users/{id}", "method": "GET" },
    "update":   { "url": "/api/users/{id}", "method": "PUT" },
    "delete":   { "url": "/api/users/{id}", "method": "DELETE" }
  }
}

生成策略：

1. 有明确接口路径时，优先输出完整对象。
2. 没有明确接口路径但业务明显是远程 CRUD，可用字符串简写或 true。
3. 纯静态演示页不要加 api。
4. 同一张表内不要混用多种 API 风格。
5. URL 中路径参数统一使用 {id}、{tenantId}、{projectId} 这类占位格式。

═══════════════════════════════════════════════════
【11】树表与树页面规范
═══════════════════════════════════════════════════

如果业务是树、导航树、目录树、组织树、分类树、树表，必须按当前框架树能力生成。

树场景必须同时考虑：

1. 列定义
2. views.default.treeConfig
3. TreeApi 端点
4. flat / nested 的 treeMode 契约

treeConfig 标准示例：

{
  "treeConfig": {
    "idField": "id",
    "parentIdField": "parentId",
    "textField": "name",
    "treeMode": "flat"
  }
}

treeMode 可选：

- flat
- nested

规则：

1. 默认优先 flat，便于统一 DataView + TreeManager 编排。
2. 如果业务明确后端直接返回 children 嵌套结构，可使用 nested。
3. 树节点必须有稳定主键 idField。
4. parentIdField 要与平铺节点结构一致。
5. textField 对应树节点显示文本字段。

═══════════════════════════════════════════════════
【12】TreeApi 完整规范
═══════════════════════════════════════════════════

树接口按当前 spark-data TreeApi 生成，可包含：

{
  "api": {
    "list":         { "url": "/api/tenants/{tenantId}/projects/{projectId}/navigation/nodes", "method": "GET" },
    "nested":       { "url": "/api/tenants/{tenantId}/projects/{projectId}/navigation/nodes", "method": "GET" },
    "children":     { "url": "/api/tenants/{tenantId}/projects/{projectId}/navigation/nodes", "method": "GET" },
    "path":         { "url": "/api/tenants/{tenantId}/projects/{projectId}/navigation/nodes/path/{id}", "method": "GET" },
    "subtree":      { "url": "/api/tenants/{tenantId}/projects/{projectId}/navigation/nodes/subtree", "method": "POST" },
    "nestedSearch": { "url": "/api/tenants/{tenantId}/projects/{projectId}/navigation/nodes/search", "method": "GET" },
    "create":       { "url": "/api/tenants/{tenantId}/projects/{projectId}/navigation/nodes", "method": "POST" },
    "update":       { "url": "/api/tenants/{tenantId}/projects/{projectId}/navigation/nodes/{id}", "method": "PUT" },
    "delete":       { "url": "/api/tenants/{tenantId}/projects/{projectId}/navigation/nodes/{id}", "method": "DELETE" },
    "move":         { "url": "/api/tenants/{tenantId}/projects/{projectId}/navigation/nodes/{id}/move", "method": "PUT" }
  }
}

说明：

- list：首屏列表加载。
- nested：显式获取嵌套树。
- children：按 parentId 获取直接子节点。
- path：获取祖先路径。
- subtree：展开到某节点时补齐缺失分支。
- nestedSearch：树搜索。
- create / update / delete / move：节点级 CRUD 与移动。

如果业务不是树，不要生成这些树端点。

如果业务是普通树展示但没有远程接口，可以不写 api，只写静态 rows + treeConfig。

═══════════════════════════════════════════════════
【13】测试数据生成规则
═══════════════════════════════════════════════════

1. 纯静态页面：每张表生成 3 到 5 条代表数据。
2. 外键必须与父表真实主键对应。
3. 主表 id 建议从 1 开始。
4. 二级子表 id 建议从 101 开始。
5. 三级子表 id 建议从 1001 开始。
6. 金额、日期、状态、人员名等字段要像真实业务，不要用 a、b、c 这类占位。
7. 时间字段格式保持一致。
8. 不要生成无业务意义的随机垃圾字段。

═══════════════════════════════════════════════════
【14】命名规则
═══════════════════════════════════════════════════

1. dataSetName 使用 PascalCase，并以 DataSet 或 DS 结尾。
2. 表名使用 PascalCase，例如 Orders、OrderItems、NavigationNodes。
3. 字段名使用 camelCase，例如 orderId、createdAt、parentId。
4. relationName 使用可读英文短语。
5. 视图名默认 default；只有确有需要时使用 detail、summary、tree、dialog 等命名视图。

═══════════════════════════════════════════════════
【15】输出前自检清单
═══════════════════════════════════════════════════

输出前你必须自行检查：

1. 顶层是否使用了 dataset 包装。
2. dataSetName 是否存在。
3. 每张表是否都存在 columns。
4. 每张表是否都存在 views.default。
5. rows 是否写在 views.default 内。
6. relations 中引用的表名和视图名是否真实存在。
7. childField 是否在子表 columns 中存在。
8. computeExpression 列是否没有在 rows 中手填值。
9. aggregates 是否写在视图内而不是列上。
10. 纯静态表是否错误地带了 api。
11. 远程表是否至少具备合理的 list 接口。
12. 树表是否同时具备 treeConfig 和稳定 idField。
13. 树远程表是否使用了符合 treeMode 的树端点。
14. tables 中所有作为 parentTable 的表是否都排在对应 childTable 前面。
15. JSON 是否合法，无注释、无尾逗号、无省略号。
16. 输出是否只有 JSON，没有解释文字。

═══════════════════════════════════════════════════
【16】输出偏好
═══════════════════════════════════════════════════

默认生成策略：

1. 如果业务未说明后端接口，优先生成可本地运行的静态 rows。
2. 如果业务明显是管理后台 CRUD，再补 api。
3. 如果业务明显是树编辑或导航编辑，优先生成 NavigationNodes 这类树表。
4. 如果业务包含金额、数量、状态、日期，优先补充计算列和 aggregates。
5. 如果业务包含父子明细，优先生成 relations 而不是把明细揉进一个大表。

═══════════════════════════════════════════════════
【17】现在开始生成
═══════════════════════════════════════════════════

请根据下面的业务需求生成完整 pagedata.json，只输出 JSON：

[在这里替换为具体业务需求]
```

---

## 使用建议

如果目标页面是树页面，建议把这份提示词和 [docs/guides/TREE_CAPABILITY.md](docs/guides/TREE_CAPABILITY.md) 一起给模型，这样它更容易把 treeConfig、treeMode 和导航树 API 一次写对。