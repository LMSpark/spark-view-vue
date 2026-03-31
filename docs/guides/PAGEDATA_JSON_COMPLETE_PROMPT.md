# pagedata.json 完整提示词

> 这是一份面向当前 SPARK 仓库真实约束的完整提示词。
>
> 目标是让 AI 一次生成可落地、与当前运行时提示词一致的 pagedata.json，而不是生成旧格式、半成品结构，或把业务逻辑错误地塞进 script.js。
>
> 所属： [AI 提示词体系](../ai-prompts/README.md) / [数据生成](../ai-prompts/data/README.md) / 生产版主入口。

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
【0】内部执行流程（只在内部思考，不要输出）
═══════════════════════════════════════════════════

在真正输出 JSON 之前，你必须先在内部完成以下流程，但不要把这些过程输出出来：

1. 先从需求中提取业务实体、主从层次、树层次、统计需求、字段编辑方式，以及是否存在远程数据。
2. 第一阶段先完成“数据与 API 建模”：确定 tables、columns、主外键、api 策略、computeExpression、aggregates、选项表、选项级联键、树数据模型。
3. 第二阶段再完成“视图与关系建模”：补 views.default、决定是否需要命名视图、决定 autoLoad / autoCurrentFirst / autoSelectFirst / treeConfig 等视图行为，并生成 relations。
4. 输出前再做一次错误结构检查：不能有表根级 rows、不能有缺失 views.default 的表、不能有 relation 扩展字段、不能把 options 重复塞进主表 rows。
5. 最终只输出合法 JSON，不输出你的推理过程。

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
2. 每张表都必须显式声明 views.default；即使只有静态 rows，或只有 api，也不能省略，必须写成 views: { default: { ... } }。
3. rows 放在 views.default 内，不要放在表根级作为新标准写法。
4. 表结构、API、视图、关系都要完整落在 pagedata.json 中。
5. 计算逻辑优先用 computeExpression，不要把计算留给 script.js。
6. 汇总逻辑优先用 aggregates，不要在页面脚本里手工统计。
7. 父子联动优先用 relations，不要靠脚本自行过滤。
8. 树页面优先使用 treeConfig + TreeApi，不要把树主流程写进 script.js。
9. 没有明确远程接口时，优先生成静态 rows 演示数据。
10. 不要生成无意义空字段，不要同时混用新旧两套格式。

═══════════════════════════════════════════════════
【2.0】禁止生成的错误结构
═══════════════════════════════════════════════════

下面这些结构一律视为错误，生成前必须排除：

错误示例 1：把 rows 写在表根级

{
  "tableName": "Orders",
  "columns": [ ... ],
  "rows": [ ... ]
}

错误示例 2：只有 api，没有 views.default

{
  "tableName": "Users",
  "columns": [ ... ],
  "api": "/api/users"
}

错误示例 3：在 relation 中生成非标准字段

{
  "parentTable": "Orders",
  "childTable": "OrderItems",
  "childField": "orderId",
  "dependencyType": "currentRow",
  "autoLoad": true,
  "relationName": "OrderItemsByOrder"
}

错误示例 4：把 options 重复塞进主表 rows

{
  "id": 1,
  "status": "active",
  "statusOptions": [ ... ]
}

如果你发现自己生成成了以上结构，必须先改回当前规范再输出。

═══════════════════════════════════════════════════
【2.1】根据用户需求推导 DataSet
═══════════════════════════════════════════════════

生成前先根据业务需求判断数据建模方式：

1. 如果是单实体管理页，通常只需要 1 张主表。
2. 如果是主从、明细、钻取页面，至少需要主表 + 子表，并用 relations 建立 currentRow 联动。
3. 如果页面里有下拉、单选、树选项、状态字典，优先补独立字典表，不要把 options 直接塞进主表每一行。
4. 如果需求包含金额、数量、单价、折扣、得分、统计指标，优先用 computeExpression 和 aggregates，而不是在 rows 里手填汇总值。
5. 如果需求是树、导航、组织架构、目录分类，优先建节点表 + treeConfig；需要远程时再补 TreeApi。
6. 如果需求同时包含列表、详情、明细、统计，这些通常不是一张表的不同字段，而是多张表 + relation + summaryRow 的组合。
7. 不要把“页面模块名”“卡片名”“区块名”直接当成表名；表名应对应真实业务实体。

═══════════════════════════════════════════════════
【2.2】按两个阶段建模
═══════════════════════════════════════════════════

生成 pagedata.json 时，按以下顺序思考，不要一上来就写 views 和 relations：

第一阶段：业务数据与 API 建模

1. 先确定业务主表、从表、明细表、字典表、树表分别有哪些。
2. 先把 columns 设计完整：主键、外键、业务字段、状态字段、金额字段、时间字段、选项键字段。
3. 先确定每张表是纯静态表、普通远程 CRUD 表，还是树远程表；如果是远程表，先把 api 形态和端点范围定清楚。
4. 先确定 computeExpression、aggregates 依赖哪些字段，哪些列是计算列，哪些列是汇总目标。
5. 如果字段可编辑且有下拉/单选/多选/树选项，先建独立选项表，不要先讨论视图。
6. 如果字段编辑存在级联关系，也先在业务模型里确定“谁依赖谁”和“级联键是什么”，例如：
  - nodeKind -> ChildPlacementOptions，级联键为 nodeKind
  - editorProfileKey -> RefNodeKindOptions，级联键为 profileKey
  - provinceCode -> CityOptions，级联键为 provinceCode
7. 第一阶段的目标是把“表、列、主外键、api 策略、计算列、汇总口径、选项表、选项级联键、树数据模型”定清楚。

第二阶段：视图与关系建模

1. 在第一阶段表结构稳定后，再为每张表补 views.default。
2. 只有确实存在多用途 DataView 时，才补非 default 视图；否则统一使用 default。
3. 再决定 autoLoad、autoCurrentFirst、autoSelectFirst、treeConfig 等视图行为。
4. 再根据字段输入级联链路、主从联动链路、树节点联动链路，反推需要哪些父视图 / 子视图关系。
5. 最后再统一生成 relations，明确 parentTable、childTable、parentField、childField、dependencyType，以及 parentViewId / childViewId。
6. 主从表联动、字段编辑选项联动、树节点选项联动，都属于第二阶段的 relations / views 表达问题。
7. 第二阶段的目标是把“哪个视图驱动哪个视图、如何过滤、如何加载、哪些视图需要自动行为”说明白。

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

每张表基础写法：

{
  "tableName": "Orders",
  "columns": [ ... ],
  "api": ...,
  "views": {
    "default": {
      "rows": [ ... ]
    }
  }
}

如果业务明确需要，再按场景补 autoLoad、autoCurrentFirst、autoSelectFirst、aggregates、treeConfig，以及 detail / summary / tree 等命名视图。

不要写成下面这种省略 views.default 的结构：

{
  "tableName": "Orders",
  "columns": [ ... ],
  "rows": [ ... ]
}

也不要只写 api 而没有 views.default。

规则：

1. tableName 推荐与表名键一致。
2. columns 必填。
3. views.default 必填；即使只有 rows: [] 或只有 api，也必须保留 views: { "default": { ... } } 这一层。
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

这部分属于第二阶段：第一阶段先把业务表、列、API、计算列、选项表和级联键定清楚；第二阶段再为每张表补 views.default，并决定是否真的需要额外 viewId。

views.default 常见字段：

下面是常见可选字段全集示意，不表示这些字段必须同时生成：

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
- autoLoad：仅在该表存在 api 且需要页面初始化自动请求时使用；纯静态表通常不要生成。
- autoCurrentFirst：加载完成后自动选第一行为 currentRow。
- autoSelectFirst：加载完成后自动把第一行加入 selectedRows。
- aggregates：视图聚合规则。
- treeConfig：树视图配置，仅树场景需要。
- 视图的作用：同一张表可以派生出不同 DataView，用来承载不同交互状态或用途，例如列表展示、当前行编辑、树形展示、汇总展示。
- 当前生成约定：默认统一创建 views.default；只有业务明确要求同一张表存在多个用途不同的视图时，才额外创建其他 viewId。

生成规则：

1. 单表展示页常用 autoCurrentFirst: true。
2. 主从钻取页，父表通常建议 autoCurrentFirst: true。
3. 静态演示页可以直接给 rows 3 到 5 条代表数据。
4. 远程 API 页通常给 rows: []，避免重复造大批假数据。
5. 如果 relation 用到了 childViewId 或 parentViewId，不允许漏掉对应 views 节点。
6. autoLoad、autoCurrentFirst、autoSelectFirst 都属于第二阶段的视图行为；不要在第一阶段把它们误当成 api 字段或 relation 字段。

═══════════════════════════════════════════════════
【6.1】字段编辑选项（下拉 / 单选 / 多选 / 树选项）
═══════════════════════════════════════════════════

pagedata.json 的职责是提供“选项数据源”，不是把字段组件的 props.options 重复塞进主表每一行。

这部分属于第一阶段：先把选项表和级联键建好；到第二阶段再通过 views / relations 把选项联动串起来。

生成规则：

1. 如果需求里有状态、分类、角色、部门、级联目录、树选项等编辑选项，优先在 pagedata.json 中创建独立字典表，例如 StatusOptions、RoleOptions、CategoryOptions。
2. 简单的一次性静态选项可以直接写在 rule.json 的 props.options；但只要选项需要复用、联动、远程加载、树形层级或多字段映射，就应在 pagedata.json 中单独建表。
3. 选择类字段在 rule.json 中通常通过 optionKey 绑定字典表视图，例如 "StatusOptions@rows"、"RoleOptions@rows"。
4. 选项显示字段常用 label / text / name，取值字段常用 value / id / code；如果不是这些常见命名，rule.json 中应补 optionLabelField、optionValueField。
5. 树选项、级联选项、树下拉如果来自 DataSet，优先给选项视图补 treeConfig；如果 rows 已经是带 children 的嵌套结构，也可以直接使用。
6. 如果字段编辑选项存在级联，不要在第一阶段直接写 relation；先把选项表的级联键列设计出来，例如 nodeKind、profileKey、parentId、categoryCode。
7. 到第二阶段最后，再根据字段输入级联链路生成 relation，并反推 parentViewId / childViewId；不要先写 relation 再回头猜视图。

推荐示例：

{
  "dataset": {
    "dataSetName": "UserFormDataSet",
    "tables": {
      "Users": {
        "columns": [
          { "name": "id", "type": "number", "isPrimaryKey": true },
          { "name": "status", "type": "string", "label": "状态" },
          { "name": "roleCode", "type": "string", "label": "角色" }
        ],
        "views": {
          "default": {
            "rows": []
          }
        }
      },
      "StatusOptions": {
        "columns": [
          { "name": "value", "type": "string", "label": "值" },
          { "name": "label", "type": "string", "label": "显示名" }
        ],
        "views": {
          "default": {
            "rows": [
              { "value": "active", "label": "启用" },
              { "value": "inactive", "label": "停用" }
            ]
          }
        }
      },
      "RoleOptions": {
        "columns": [
          { "name": "code", "type": "string", "label": "编码", "isPrimaryKey": true },
          { "name": "name", "type": "string", "label": "名称" }
        ],
        "views": {
          "default": {
            "rows": [
              { "code": "admin", "name": "管理员" },
              { "code": "editor", "name": "编辑" },
              { "code": "viewer", "name": "访客" }
            ]
          }
        }
      }
    },
    "relations": []
  }
}

对应字段常见写法：

- r-select / r-radio：optionKey 绑定 "StatusOptions@rows"
- 若选项字段是 name/code 这类命名：补 optionLabelField: "name"、optionValueField: "code"
- 若选项需要按当前行字段级联过滤：先在 pagedata.json 中准备带级联键的 Options 表，第二阶段再补 relation

═══════════════════════════════════════════════════
【7】计算列（computeExpression）规范
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
【8】视图聚合（aggregates）规范
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
【9】API 配置规范
═══════════════════════════════════════════════════

这部分属于第一阶段：在表结构确定后就要决定每张表是否需要 api、使用哪种 api 写法，以及需要哪些端点；不要等到第二阶段才临时补 api。

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
6. 第一阶段先决定“这张表是否远程、需要哪些端点”；第二阶段再决定是否在 views.default 上启用 autoLoad、autoCurrentFirst 等视图行为。
7. 树远程表的 api 规划也属于第一阶段；treeConfig 和树视图行为属于第二阶段。
8. autoLoad、autoCurrentFirst、autoSelectFirst 是 views.default 的字段，不是 api 字段的一部分。

═══════════════════════════════════════════════════
【10】树表与树页面规范
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
【11】TreeApi 完整规范
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
【12】测试数据生成规则
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
【13】命名规则
═══════════════════════════════════════════════════

1. dataSetName 使用 PascalCase，并以 DataSet 或 DS 结尾。
2. 表名使用 PascalCase，例如 Orders、OrderItems、NavigationNodes。
3. 字段名使用 camelCase，例如 orderId、createdAt、parentId。
4. 视图名默认 default；只有确有需要时使用 detail、summary、tree、dialog 等命名视图。

═══════════════════════════════════════════════════
【14】关系（relations，最后生成）规范
═══════════════════════════════════════════════════

relations 必须放在所有表、列、API、选项表、树配置、views.default 和命名视图都确定之后，作为最后一个结构设计步骤统一生成。

不要先写 relation 再回头猜表结构；正确顺序是：

1. 先确定字段输入级联链路、主从联动链路、树节点联动链路。
2. 再确定这些链路分别落在哪个 parentTable / parentViewId 和 childTable / childViewId。
3. 最后再输出 relations 数组。

如果关系来自字段输入级联，先看“哪个输入字段驱动哪个选项表或子表过滤”，再反推视图关系。例如：

- provinceCode -> CityOptions：先确定 provinceCode 位于哪个父视图，再用 CityOptions 中的 provinceCode 作为 childField。
- nodeKind -> ChildPlacementOptions：先确定 nodeKind 来自哪个父视图，再用 ChildPlacementOptions 中的 nodeKind 作为 childField。
- editorProfileKey -> RefNodeKindOptions：先确定 editorProfileKey 的来源视图，再反推 RefNodeKindOptions 的 childViewId / childField。

relations 数组中的每条关系：

{
  "parentTable": "Orders",
  "parentViewId": "default",
  "childTable": "OrderItems",
  "childViewId": "default",
  "parentField": "id",
  "childField": "orderId",
  "dependencyType": "currentRow"
}

dependencyType 可选值：

- currentRow
- selectedRows
- allRows
- pagedRows

生成原则：

1. 普通主从钻取默认使用 currentRow。
2. 批量联动才使用 selectedRows。
3. 字典/参考数据联动、字段输入级联过滤，才考虑 allRows。
4. parentViewId 表示从父表的哪个视图读取 currentRow / selectedRows 等状态，childViewId 表示把过滤或加载作用到子表的哪个视图；当前默认统一写 "default"，不要省略。
5. childField 必须真实存在于子表 columns 中。
6. parentField 不写时默认通常等于父表主键，但若业务是 code/uuid/字段输入值关联则必须写清。
7. 当存在 relation 时，tables 中的 parentTable 必须定义在 childTable 前面，避免 DataSet 构造期因父视图尚未注册而报错。
8. 只生成标准 relation 字段：parentTable、parentViewId、childTable、childViewId、parentField、childField、dependencyType；不要生成 relationName、cascadeUpdate、cascadeDelete、autoLoad、lazyLoad、apiEnabled。
9. 如果关系来自字段输入级联，优先根据字段输入链路反推 parentViewId / childViewId，不要先拍脑袋把所有关系都写成 default。
10. relations 是最后收尾步骤：先有 tables / columns / api / views / 选项表 / treeConfig，再有 relations。

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
14. relation 是否只使用标准字段，没有 relationName、cascadeDelete、autoLoad、lazyLoad、apiEnabled 等扩展字段。
15. tables 中所有作为 parentTable 的表是否都排在对应 childTable 前面。
16. JSON 是否合法，无注释、无尾逗号、无省略号。
17. 输出是否只有 JSON，没有解释文字。
18. 是否存在表根级 rows、只有 api 没有 views.default、或 relation 扩展字段这类错误结构。
19. autoLoad、autoCurrentFirst、autoSelectFirst 是否只出现在 views.default，而不是 api、relation 或表根级。

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