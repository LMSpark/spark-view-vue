# SPARK DataSet JSON 配置 AI 生成指南

本文档提供一套经过验证的提示词（Prompt），帮助开发者通过 AI 模型（ChatGPT、Claude、Gemini 等）根据业务描述自动生成符合 SPARK `spark-data` 规范的 `pagedata.json` DataSet 配置文件。

---

## 目录

1. [概述](#1-概述)
2. [使用方法](#2-使用方法)
3. [提示词（可直接复制）](#3-提示词可直接复制)
4. [验证案例](#4-验证案例)
   - [案例 A：图书馆管理（简单两表 + 主从关系）](#案例-a图书馆管理简单两表--主从关系)
   - [案例 B：电商订单管理（计算列 + 聚合）](#案例-b电商订单管理计算列--聚合)
   - [案例 C：HR 人员管理（API + 多计算列 + 聚合）](#案例-chr-人员管理api--多计算列--聚合)
   - [案例 D：医院门诊管理（三级层次 + 多计算列）](#案例-d医院门诊管理三级层次--多计算列--聚合)
   - [案例 E：员工系统双视图（同父表不同视图驱动不同子表）](#案例-e员工系统双视图同一父表不同命名视图分别驱动不同子表)
   - [案例 F：供应商采购管理（三级层次 + API + 计算列 + 聚合）](#案例-f供应商采购管理三级层次--api--计算列--聚合)
5. [JSON 自检清单](#5-json-自检清单)
6. [配置参考速查](#6-配置参考速查)

---

## 1. 概述

`pagedata.json` 中的 `dataset` 配置是 SPARK 的数据中枢，驱动所有表格、表单、详情页的数据流转。手写 DataSet JSON 需要熟悉类型系统，容易出错。本指南提供一套标准提示词，把业务需求文字转换为可直接运行的 DataSet 配置。

**适用场景**：
- 新建业务页面，快速生成初始 `pagedata.json`
- 扩展已有 DataSet，添加新表或关联关系
- 对照参考案例学习 DataSet 配置写法

---

## 2. 使用方法

**三步完成**：

```
第 1 步：复制下方「3. 提示词」全文
第 2 步：粘贴到 AI 对话框，在末尾追加你的业务需求
第 3 步：将 AI 输出的 JSON 保存为 public/pages-config/<页面名>/pagedata.json
```

**业务需求描述建议包含**：
- 涉及哪些业务实体（表）
- 每个实体的关键字段
- 实体之间的关联关系
- 是否需要计算字段（如金额合计、平均分）
- 是否需要对接后端 API

**提示词追加示例**：

```
以上是框架规范。现在请根据以下业务需求生成 pagedata.json：

需求：图书馆借阅管理系统
- 读者表（Readers）：存储读者基本信息，包含：ID、姓名、借阅卡号、手机号、账号状态
- 借阅记录表（BorrowRecords）：记录每次借阅情况，包含：ID、读者ID（外键）、书名、借阅日期、应还日期、实还日期（可为空）、状态
- 关联关系：点击读者，下方显示该读者的全部借阅记录
- 不需要后端API，使用静态测试数据
```

---

## 3. 提示词（可直接复制）

> 以下内容为完整提示词，复制全文粘贴到 AI 对话框，然后在末尾追加业务需求。

---

```
你是一名 SPARK View 框架的配置专家。你的任务是根据用户描述的业务需求，生成符合
SPARK DataSet 规范的 pagedata.json 配置文件。仅输出完整的 JSON，不添加任何解释说明。

═══════════════════════════════════════════════════
【1】输出格式规范
═══════════════════════════════════════════════════

必须严格使用以下顶层包装结构，所有配置包含在 dataset 键内：

{
  "dataset": {
    "dataSetName": "BusinessDataSet",
    "tables": { ... },
    "relations": [ ... ]
  }
}

═══════════════════════════════════════════════════
【2】三层结构：DataSet → 表（DataTable）→ 视图（DataView）
═══════════════════════════════════════════════════

⚑ 必读：完整的三层层次结构

DataSet 是整个页面的数据容器，内部结构分三层：

  DataSet                              ← 页面数据容器（仅一个）
    ├── DataTable "Orders"             ← 第二层：表（结构层，全视图共用）
    │     ├── columns: [...]           │   存放列定义 + api 端点，不含行数据
    │     ├── api: "/api/orders"       │
    │     │                            │
    │     └── DataView "default"  ✦   ← 第三层：视图（数据层，UI 唯一来源）
    │           ├── rows: [...]        │   ⬅ UI 表格 / 表单绑定的是这里
    │           ├── currentRow         │   ⬅ 驱动子级联的状态在这里
    │           ├── summaryRow         │   ⬅ aggregates 汇总结果在这里
    │           └── aggregates: {...}  │
    │
    └── DataTable "OrderItems"
          ├── columns: [...]
          │
          └── DataView "default"  ✦   ← 每张表自动创建，无需声明
                ├── rows: [...]        （级联过滤后只显示当前订单的明细行）
                ├── currentRow
                └── aggregates: {...}

✦ **每张表构造时自动拥有一个 "default" DataView**，无需在 JSON 中声明。
  所有表格 / 表单 / 详情页都通过 DataView（而非 DataTable）读写数据。

─────────── 显式声明 views.default（标准写法）───────────

rows / aggregates / autoLoad / autoSelectFirst 等**视图级配置**必须写在
`views.default` 内部，不要放在表对象顶层：

  "TableName": {
    // ══ DataTable 层（全视图共用）══════════════
    "columns":  [...],          // 必填：列定义（字段名、类型、主键、计算列）
    "api":      "/api/...",     // 可选：有后端接口时填写

    // ══ 视图集合══════════════════════════════════
    "views": {
      "default": {              // ← default DataView（每张表必须声明）
        "rows":            [...],   // 视图初始数据行（3-5 条测试行）
        "autoLoad":        true,    // 可选：初始化后自动请求 api 加载数据
        "autoSelectFirst": true,    // 可选：加载后自动选中第一行（驱动子级联）
        "aggregates":      { ... }  // 可选：该视图的聚合规则（sum/avg/count 等）
      },
      "detail": {}              // 仅当某 relation 使用了此 viewId 时才添加
    }
  }

─────────── 额外命名视图（通常不需要）───────────

绝大多数页面只需要 `views.default`。
仅当某条 relation 的 `parentViewId` 或 `childViewId` 不是 `"default"` 时，
才在 `views` 中添加对应的命名视图（空对象 `{}` 即可）。

  口诀：先写 views.default → 检查 relations 有无非 default viewId
         → 有则追加该视图名称 → 无则只保留 default

═══════════════════════════════════════════════════
【3】列（Column）定义
═══════════════════════════════════════════════════

每列对象的字段：

{
  "name":              "fieldName",   // 必填：camelCase 字段名
  "type":              "string",      // 必填：见「数据类型」
  "label":             "字段标签",    // 推荐：UI 表头显示文字（中文）
  "isPrimaryKey":      true,          // 主键列专用（每表仅一列）
  "autoIncrement":     true,          // 可选：自增主键
  "allowDBNull":       false,         // 可选：是否允许空值
  "defaultValue":      null,          // 可选：字段默认值
  "computeExpression": "price * qty"  // 可选：计算列表达式
}

数据类型（type）完整列表：
number | int | string | varchar | text | boolean | bool |
date | datetime | time | object | array | enum

═══════════════════════════════════════════════════
【4】视图关联关系（Relations）
═══════════════════════════════════════════════════

relations 定义的是**两个 DataView 之间的依赖关系**。回顾架构：UI 只能通过
DataView 与数据交互，因此「父子关联」也是视图层面的概念，而非表结构关系。

一条 relation = 将「父视图」的交互状态变化，映射为「子视图」的数据过滤：

  父视图（parentTable + parentViewId）
    -- 用户切换当前行 / 勾选行 -->
  子视图（childTable + childViewId）自动重新过滤，只显示匹配父视图当前状态的行

关键规则：
- `parentTable + parentViewId`（默认 'default'）唯一标识父视图
- `childTable  + childViewId` （默认 'default'）唯一标识子视图
- 单张表可有多个命名视图，同一父表可与不同子视图建立多条独立关联
- 绝大多数页面只有 default 视图，parentViewId / childViewId 可省略

relations 数组中每条关联：

{
  "parentTable":    "ParentName",    // 必填：父视图所在表名
  "parentViewId":   "default",       // 可选：父视图 ID（默认 'default'）
  "childTable":     "ChildName",     // 必填：子视图所在表名
  "childViewId":    "default",       // 可选：子视图 ID（默认 'default'）
  "childField":     "parentId",      // 必填：子视图行中的外键字段名
  "dependencyType": "currentRow",    // 推荐填写：见选择规则
  "cascadeUpdate":  true,            // 可选：父视图行更新时级联刷新子视图
  "cascadeDelete":  true,            // 可选：父视图行删除时级联删除子视图匹配行
  "autoLoad":       false,           // 可选：父视图行切换时自动请求子视图 api
  "relationName":   "ParentChild"    // 可选：关联命名（便于调试）
}

dependencyType — 父视图的哪种状态变化会驱动子视图重新过滤（重要）：

┌──────────────────┬──────────────────────────────────────────────────────┐
│ dependencyType   │ 使用场景                                             │
├──────────────────┼──────────────────────────────────────────────────────┤
│ "currentRow"     │ 主从钻取：父视图当前行变化 → 子视图只显示该行的关联数据│
│ (默认)           │ 例：父视图点击订单 → 子视图显示该订单的商品明细      │
├──────────────────┼──────────────────────────────────────────────────────┤
│ "allRows"        │ 字典/参考表：子视图显示父视图所有行的子数据           │
│                  │ 例：加载所有分类下的产品，用于下拉选择器数据源       │
├──────────────────┼──────────────────────────────────────────────────────┤
│ "selectedRows"   │ 批量操作：父视图已勾选行变化 → 子视图显示这些行的子数据│
├──────────────────┼──────────────────────────────────────────────────────┤
│ "pagedRows"      │ 分页模式：子视图仅基于父视图当前页行数据过滤         │
└──────────────────┴──────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════
【5】计算列（computeExpression）
═══════════════════════════════════════════════════

a) 单行字段表达式（不含 return，框架自动包裹）：

  "price * qty"
  "firstName + ' ' + lastName"
  "amount * 0.1"

b) 多语句函数体（含 return，所有分支必须有 return，否则返回 undefined）：

  "if (score >= 90) return 'A'; if (score >= 75) return 'B'; if (score >= 60) return 'C'; return 'D';"
  "if (status === 'active') return '启用'; return '禁用';"

c) 子表聚合函数（需要已定义对应 DataRelation，括号内为从表表名）：

  "$count('ChildTable')"                        // 子行总数
  "$sum('ChildTable', 'fieldName')"             // 子行字段求和
  "$avg('ChildTable', 'fieldName')"             // 子行字段均值
  "$min('ChildTable', 'fieldName')"             // 子行字段最小值
  "$max('ChildTable', 'fieldName')"             // 子行字段最大值
  "$join('ChildTable', 'fieldName', ' | ')"     // 子行字段拼接

═══════════════════════════════════════════════════
【6】视图聚合（aggregates）
═══════════════════════════════════════════════════

声明后自动维护 summaryRow（全行汇总）和 selectionSummaryRow（选中行汇总），可通过
DataKey 绑定到 UI 汇总行。

"aggregates": {
  "amount":   { "type": "sum",   "label": "合计金额" },
  "score":    { "type": "avg",   "label": "平均分"   },
  "id":       { "type": "count", "label": "总记录数" },
  "price":    { "type": "min",   "label": "最低价"   },
  "price2":   { "type": "max",   "label": "最高价"   },
  "tags":     { "type": "join",  "label": "标签列表" }
}

支持类型：sum | count | avg | min | max | join
键名必须与 columns 中已有列的 name 完全一致。

═══════════════════════════════════════════════════
【7】API 配置（有后端接口时使用）
═══════════════════════════════════════════════════

字符串简写（自动展开为 list/create/update/delete 四端点）：
  "api": "/api/users"

true 简写（从表名自动生成路径，如 Users → /api/users）：
  "api": true

完整对象（自定义每个端点）：
  "api": {
    "list":   { "url": "/api/users",     "method": "GET"    },
    "create": { "url": "/api/users",     "method": "POST"   },
    "update": { "url": "/api/users/:id", "method": "PUT"    },
    "delete": { "url": "/api/users/:id", "method": "DELETE" }
  }

纯静态演示数据（仅 rows 内联）不要添加 api 字段。

═══════════════════════════════════════════════════
【8】生成规则（必须严格遵守）
═══════════════════════════════════════════════════

1. 【主键规则】每张业务表必须有且仅有一列声明 "isPrimaryKey": true，通常为 id 列

2. 【测试数据】每张表在 `views.default.rows` 中提供 3-5 条有代表性的测试数据

3. 【外键完整性】rows 中的外键值必须对应父表 rows 中存在的 id 值，不允许引用不存在的父行

4. 【ID 编号规范】顶级表 id 从 1 开始，二级子表 id 从 101 开始，三级子表 id 从 1001 开始

5. 【计算列不填 rows】有 computeExpression 的列，rows 中不要为该列填充数据（由系统自动计算）

6. 【标签规范】所有面向用户展示的字段须添加 label 属性（中文），id/外键列按需添加

7. 【views 声明规则】每张表必须显式声明 views，且 views.default 始终存在：
   - rows / aggregates / autoLoad / autoSelectFirst 均写在 views.default 内部，不写在表对象顶层
   - api 字段保留在表对象顶层（与 columns 同级）
   - relation 的 parentViewId / childViewId 均默认 'default'，单视图页面可省略
   ⚠️ 若 relation 使用了非 default 的 parentViewId / childViewId，该表的 views 中必须显式声明该视图
   （值为 {} 或含配置的对象），否则级联将无法生效。
   示例：relation 使用 parentViewId: "detail" → Employees.views 须包含 "detail": {}
   口诀：先写 views.default → 检查 relation 有无非 default viewId → 有则追加该视图名 → 无则只保留 default

8. 【命名规范】表名用 PascalCase（OrderItems），字段名用 camelCase（orderId），
   dataSetName 以 DataSet 结尾（UserOrderDataSet）

9. 【外键列必须在 columns 中定义】从表必须在 columns 数组中包含外键列的定义

10. 【静态数据不加 api】仅有 rows 内联数据的表不要添加 api 字段

11. 【API 表级联行为】子表是否配置 `api` 决定级联走哪条路径：
    - 子表**无 api**（纯静态/内联数据）→ 级联在内存中直接过滤 `DataTable.rows`，无需网络请求，适合演示页面
    - 子表**有 api**（后端 REST 接口）→ 父行切换时自动发 HTTP 请求刷新子视图（框架在 URL 参数中携带父行主键）
    演示/原型页面推荐全部使用无 api 静态数据（规则 10），实现完全离线的内存级联。

═══════════════════════════════════════════════════
【9】完整示例（学生成绩管理）✅ 已通过 DataSet 实例化测试
═══════════════════════════════════════════════════

{
  "dataset": {
    "dataSetName": "StudentGradeDataSet",
    "tables": {
      "Students": {
        "columns": [
          { "name": "id",        "type": "number", "isPrimaryKey": true, "label": "学号" },
          { "name": "name",      "type": "string",                       "label": "姓名" },
          { "name": "className", "type": "string",                       "label": "班级" },
          { "name": "gradeAvg",  "type": "number",                       "label": "平均分",
            "computeExpression": "$avg('Grades', 'score')" }
        ],
        "views": {
          "default": {
            "rows": [
              { "id": 1, "name": "张三", "className": "高一(1)班" },
              { "id": 2, "name": "李四", "className": "高一(1)班" },
              { "id": 3, "name": "王五", "className": "高一(2)班" }
            ]
          }
        }
      },
      "Grades": {
        "columns": [
          { "name": "id",        "type": "number", "isPrimaryKey": true, "label": "成绩ID" },
          { "name": "studentId", "type": "number",                       "label": "学号"   },
          { "name": "subject",   "type": "string",                       "label": "科目"   },
          { "name": "score",     "type": "number",                       "label": "分数"   },
          { "name": "grade",     "type": "string",                       "label": "等级",
            "computeExpression": "if (score >= 90) return 'A'; if (score >= 75) return 'B'; if (score >= 60) return 'C'; return 'D';" }
        ],
        "views": {
          "default": {
            "rows": [
              { "id": 1001, "studentId": 1, "subject": "数学", "score": 95 },
              { "id": 1002, "studentId": 1, "subject": "语文", "score": 82 },
              { "id": 1003, "studentId": 2, "subject": "数学", "score": 76 },
              { "id": 1004, "studentId": 2, "subject": "语文", "score": 68 },
              { "id": 1005, "studentId": 3, "subject": "数学", "score": 55 },
              { "id": 1006, "studentId": 3, "subject": "语文", "score": 70 }
            ],
            "aggregates": {
              "score": { "type": "avg",   "label": "平均分" },
              "id":    { "type": "count", "label": "科目数" }
            }
          }
        }
      }
    },
    "relations": [
      {
        "relationName":   "StudentGrades",
        "parentTable":    "Students",
        "childTable":     "Grades",
        "childField":     "studentId",
        "dependencyType": "currentRow"
      }
    ]
  }
}

═══════════════════════════════════════════════════

以上是框架规范。现在请根据以下业务需求生成 pagedata.json：

[在此替换为你的业务需求描述]
```

---

## 4. 验证案例

以下三个案例由上方提示词生成并经过逐项验证，可直接用于项目。

---

### 案例 A：图书馆管理（简单两表 + 主从关系）✅ 已通过 DataSet 实例化测试

**需求描述**：
- 读者表（Readers）：ID、姓名、借阅卡号、手机号、状态
- 借阅记录表（BorrowRecords）：ID、读者ID（外键）、书名、借阅/应还/实还日期、状态
- 关联：点击读者 → 显示该读者的借阅记录
- 纯静态数据，无后端 API

**生成结果**：

```json
{
  "dataset": {
    "dataSetName": "LibraryDataSet",
    "tables": {
      "Readers": {
        "columns": [
          { "name": "id",     "type": "number", "isPrimaryKey": true, "label": "读者ID"   },
          { "name": "name",   "type": "string",                       "label": "姓名"     },
          { "name": "cardNo", "type": "string",                       "label": "借阅卡号" },
          { "name": "phone",  "type": "string",                       "label": "手机号"   },
          { "name": "status", "type": "string",                       "label": "状态"     }
        ],
        "views": {
          "default": {
            "rows": [
              { "id": 1, "name": "张三", "cardNo": "LIB-001", "phone": "13800001001", "status": "active"    },
              { "id": 2, "name": "李四", "cardNo": "LIB-002", "phone": "13800001002", "status": "active"    },
              { "id": 3, "name": "王五", "cardNo": "LIB-003", "phone": "13800001003", "status": "suspended" }
            ]
          }
        }
      },
      "BorrowRecords": {
        "columns": [
          { "name": "id",         "type": "number", "isPrimaryKey": true, "label": "记录ID"   },
          { "name": "readerId",   "type": "number",                       "label": "读者ID"   },
          { "name": "bookTitle",  "type": "string",                       "label": "书名"     },
          { "name": "borrowDate", "type": "date",                         "label": "借阅日期" },
          { "name": "dueDate",    "type": "date",                         "label": "应还日期" },
          { "name": "returnDate", "type": "date",   "allowDBNull": true,  "label": "实还日期" },
          { "name": "status",     "type": "string",                       "label": "借阅状态" }
        ],
        "views": {
          "default": {
            "rows": [
              { "id": 1001, "readerId": 1, "bookTitle": "JavaScript高级程序设计", "borrowDate": "2024-03-01", "dueDate": "2024-03-31", "returnDate": "2024-03-20", "status": "returned" },
              { "id": 1002, "readerId": 1, "bookTitle": "Vue.js设计与实现",       "borrowDate": "2024-04-01", "dueDate": "2024-04-30", "returnDate": null,         "status": "borrowed" },
              { "id": 1003, "readerId": 2, "bookTitle": "算法导论",               "borrowDate": "2024-04-05", "dueDate": "2024-05-05", "returnDate": "2024-04-28", "status": "returned" },
              { "id": 1004, "readerId": 3, "bookTitle": "三体",                   "borrowDate": "2024-02-10", "dueDate": "2024-03-10", "returnDate": null,         "status": "overdue"  }
            ]
          }
        }
      }
    },
    "relations": [
      {
        "relationName":   "ReaderBorrowRecords",
        "parentTable":    "Readers",
        "childTable":     "BorrowRecords",
        "childField":     "readerId",
        "dependencyType": "currentRow",
        "cascadeDelete":  true
      }
    ]
  }
}
```

**验证通过要点**：
- ✅ `dataset` 顶层包装
- ✅ Readers / BorrowRecords 各有且仅有一个 `isPrimaryKey: true`
- ✅ BorrowRecords.readerId 值（1, 1, 2, 3）均在 Readers.rows 中存在
- ✅ 可空字段 `returnDate` 设置了 `allowDBNull: true`，rows 中可出现 `null`
- ✅ relation 包含三个必填字段（parentTable / childTable / childField）
- ✅ 无 api 字段（纯静态数据）

---

### 案例 B：电商订单管理（计算列 + 聚合）✅ 已通过 DataSet 实例化测试

**需求描述**：
- 订单表（Orders）：ID、订单号、客户姓名、下单日期、状态；自动汇总商品件数和总金额
- 订单明细表（OrderItems）：ID、订单ID（外键）、商品名、数量、单价；小计 = 数量 × 单价（计算列）
- OrderItems 显示汇总行：总数量和合计金额
- 关联：点击订单 → 显示该订单的明细
- 纯静态数据，无后端 API

**生成结果**：

```json
{
  "dataset": {
    "dataSetName": "EcommerceOrderDataSet",
    "tables": {
      "Orders": {
        "columns": [
          { "name": "id",           "type": "number", "isPrimaryKey": true, "label": "订单ID"   },
          { "name": "orderNo",      "type": "string",                       "label": "订单号"   },
          { "name": "customerName", "type": "string",                       "label": "客户姓名" },
          { "name": "orderDate",    "type": "date",                         "label": "下单日期" },
          { "name": "status",       "type": "string",                       "label": "订单状态" },
          { "name": "itemCount",    "type": "number",                       "label": "商品件数",
            "computeExpression": "$count('OrderItems')" },
          { "name": "totalAmount",  "type": "number",                       "label": "订单总额",
            "computeExpression": "$sum('OrderItems', 'subtotal')" }
        ],
        "views": {
          "default": {
            "rows": [
              { "id": 1, "orderNo": "ORD-2024001", "customerName": "张三", "orderDate": "2024-04-01", "status": "completed" },
              { "id": 2, "orderNo": "ORD-2024002", "customerName": "李四", "orderDate": "2024-04-05", "status": "pending"   },
              { "id": 3, "orderNo": "ORD-2024003", "customerName": "王五", "orderDate": "2024-04-10", "status": "shipped"   }
            ]
          }
        }
      },
      "OrderItems": {
        "columns": [
          { "name": "id",          "type": "number", "isPrimaryKey": true, "label": "明细ID"   },
          { "name": "orderId",     "type": "number",                       "label": "订单ID"   },
          { "name": "productName", "type": "string",                       "label": "商品名称" },
          { "name": "quantity",    "type": "number",                       "label": "数量"     },
          { "name": "unitPrice",   "type": "number",                       "label": "单价"     },
          { "name": "subtotal",    "type": "number",                       "label": "小计",
            "computeExpression": "quantity * unitPrice" }
        ],
        "views": {
          "default": {
            "rows": [
              { "id": 1001, "orderId": 1, "productName": "无线鼠标",   "quantity": 2, "unitPrice": 99.99  },
              { "id": 1002, "orderId": 1, "productName": "机械键盘",   "quantity": 1, "unitPrice": 299.00 },
              { "id": 1003, "orderId": 2, "productName": "USB集线器", "quantity": 3, "unitPrice": 59.00  },
              { "id": 1004, "orderId": 3, "productName": "显示器支架", "quantity": 1, "unitPrice": 189.00 },
              { "id": 1005, "orderId": 3, "productName": "鼠标垫",     "quantity": 2, "unitPrice": 35.00  }
            ],
            "aggregates": {
              "quantity": { "type": "sum", "label": "总数量"   },
              "subtotal": { "type": "sum", "label": "合计金额" }
            }
          }
        }
      }
    },
    "relations": [
      {
        "relationName":   "OrderItems",
        "parentTable":    "Orders",
        "childTable":     "OrderItems",
        "childField":     "orderId",
        "dependencyType": "currentRow",
        "cascadeDelete":  true
      }
    ]
  }
}
```

**验证通过要点**：
- ✅ 计算列 `subtotal`、`itemCount`、`totalAmount` 在 rows 中**不填充值**（框架自动计算）
- ✅ `$count('OrderItems')` / `$sum('OrderItems', 'subtotal')` 引用从表名 "OrderItems"，与 relation.childTable 一致
- ✅ `aggregates` 的键名 `quantity` / `subtotal` 与 OrderItems.columns 中的 name 匹配
- ✅ orderId 外键值（1, 1, 2, 3, 3）在 Orders.rows 中均有对应

---

### 案例 C：HR 人员管理（API + 多计算列 + 聚合）✅ 结构已验证（API 级联测试需 HTTP mock）

**需求描述**：
- 部门表（Departments）：ID、名称、主管ID（可空）；自动统计部门人数
- 员工表（Employees）：ID、部门ID（外键）、姓名、性别、职位、薪资、入职日期；自动计算薪资等级
- Employees 显示平均薪资和人数汇总行
- 关联：点击部门 → 显示该部门的员工（`currentRow`）
- 两张表均有后端 REST API，部门在页面加载时自动拉取

**生成结果**：

```json
{
  "dataset": {
    "dataSetName": "HRDataSet",
    "tables": {
      "Departments": {
        "columns": [
          { "name": "id",        "type": "number", "isPrimaryKey": true, "label": "部门ID"   },
          { "name": "name",      "type": "string",                       "label": "部门名称" },
          { "name": "managerId", "type": "number", "allowDBNull": true,  "label": "主管ID"   },
          { "name": "headcount", "type": "number",                       "label": "人数",
            "computeExpression": "$count('Employees')" }
        ],
        "api":      "/api/departments",
        "views": {
          "default": {
            "rows": [
              { "id": 1, "name": "技术部", "managerId": 101  },
              { "id": 2, "name": "产品部", "managerId": 201  },
              { "id": 3, "name": "市场部", "managerId": null }
            ],
            "autoLoad": true
          }
        }
      },
      "Employees": {
        "columns": [
          { "name": "id",       "type": "number", "isPrimaryKey": true, "label": "员工ID"   },
          { "name": "deptId",   "type": "number",                       "label": "部门ID"   },
          { "name": "name",     "type": "string",                       "label": "姓名"     },
          { "name": "gender",   "type": "string",                       "label": "性别"     },
          { "name": "position", "type": "string",                       "label": "职位"     },
          { "name": "salary",   "type": "number",                       "label": "薪资"     },
          { "name": "hireDate", "type": "date",                         "label": "入职日期" },
          { "name": "level",    "type": "string",                       "label": "薪资等级",
            "computeExpression": "if (salary >= 30000) return 'S'; if (salary >= 20000) return 'A'; if (salary >= 10000) return 'B'; return 'C';" }
        ],
        "api":      "/api/employees",
        "views": {
          "default": {
            "rows": [
              { "id": 101, "deptId": 1, "name": "张工", "gender": "男", "position": "高级工程师", "salary": 28000, "hireDate": "2020-03-15" },
              { "id": 102, "deptId": 1, "name": "李工", "gender": "女", "position": "工程师",     "salary": 18000, "hireDate": "2021-07-01" },
              { "id": 201, "deptId": 2, "name": "王总", "gender": "男", "position": "产品总监",   "salary": 35000, "hireDate": "2019-05-20" },
              { "id": 202, "deptId": 2, "name": "赵妹", "gender": "女", "position": "产品经理",   "salary": 22000, "hireDate": "2022-01-10" },
              { "id": 301, "deptId": 3, "name": "孙明", "gender": "男", "position": "市场专员",   "salary": 9500,  "hireDate": "2023-06-01" }
            ],
            "autoLoad": false,
            "aggregates": {
              "salary": { "type": "avg",   "label": "平均薪资" },
              "id":     { "type": "count", "label": "人数"     }
            }
          }
        }
      }
    },
    "relations": [
      {
        "relationName":   "DeptEmployees",
        "parentTable":    "Departments",
        "childTable":     "Employees",
        "childField":     "deptId",
        "dependencyType": "currentRow",
        "cascadeDelete":  false
      }
    ]
  }
}
```

**验证通过要点**：
- ✅ 多语句计算列 `level`：所有分支（salary ≥ 30000 / ≥ 20000 / ≥ 10000 / else）均有 `return`
- ✅ 计算列 `headcount` 引用 `$count('Employees')`，与 relation.childTable 一致
- ✅ Employees rows 中**不含 `level` 字段**（计算列不填值）
- ✅ API 配置：`autoLoad: true` 让部门表页面加载时自动拉取；`autoLoad: false` 让员工表由级联触发
- ✅ 所有 deptId 外键值（1, 1, 2, 2, 3）在 Departments.rows 中均有对应

---

### 案例 D：医院门诊管理（三级层次 + 多计算列 + 聚合）

**需求描述**：
- 科室表（Departments）：ID、名称、楼层；自动统计医生数（$count）
- 医生表（Doctors）：ID、科室ID（外键）、姓名、职称、挂号费；自动统计预约数（$count）
- 预约记录表（Appointments）：ID、医生ID（外键）、患者姓名、预约日期、状态；显示预约数量汇总
- 三级关联：科室 → 医生 → 预约（两条 currentRow 关联）
- 纯静态数据，无后端 API

**生成结果**：

```json
{
  "dataset": {
    "dataSetName": "HospitalOutpatientDataSet",
    "tables": {
      "Departments": {
        "columns": [
          { "name": "id",          "type": "number", "isPrimaryKey": true, "label": "科室ID"   },
          { "name": "name",        "type": "string",                       "label": "科室名称" },
          { "name": "floor",       "type": "number",                       "label": "楼层"     },
          { "name": "doctorCount", "type": "number",                       "label": "医生数量",
            "computeExpression": "$count('Doctors')" }
        ],
        "views": {
          "default": {
            "rows": [
              { "id": 1, "name": "内科", "floor": 2 },
              { "id": 2, "name": "外科", "floor": 3 },
              { "id": 3, "name": "儿科", "floor": 4 }
            ]
          }
        }
      },
      "Doctors": {
        "columns": [
          { "name": "id",               "type": "number", "isPrimaryKey": true, "label": "医生ID"   },
          { "name": "departmentId",     "type": "number",                       "label": "科室ID"   },
          { "name": "name",             "type": "string",                       "label": "姓名"     },
          { "name": "title",            "type": "string",                       "label": "职称"     },
          { "name": "fee",              "type": "number",                       "label": "挂号费"   },
          { "name": "appointmentCount", "type": "number",                       "label": "预约数量",
            "computeExpression": "$count('Appointments')" }
        ],
        "views": {
          "default": {
            "rows": [
              { "id": 101, "departmentId": 1, "name": "张明", "title": "主任医师",   "fee": 100 },
              { "id": 102, "departmentId": 1, "name": "李华", "title": "副主任医师", "fee": 80  },
              { "id": 103, "departmentId": 2, "name": "王强", "title": "主治医师",   "fee": 60  },
              { "id": 104, "departmentId": 3, "name": "赵芳", "title": "住院医师",   "fee": 50  }
            ]
          }
        }
      },
      "Appointments": {
        "columns": [
          { "name": "id",          "type": "number", "isPrimaryKey": true, "label": "预约ID"   },
          { "name": "doctorId",    "type": "number",                       "label": "医生ID"   },
          { "name": "patientName", "type": "string",                       "label": "患者姓名" },
          { "name": "appointDate", "type": "date",                         "label": "预约日期" },
          { "name": "status",      "type": "string",                       "label": "状态"     }
        ],
        "views": {
          "default": {
            "rows": [
              { "id": 1001, "doctorId": 101, "patientName": "患者甲", "appointDate": "2024-03-01", "status": "已完成" },
              { "id": 1002, "doctorId": 101, "patientName": "患者乙", "appointDate": "2024-03-05", "status": "待诊"   },
              { "id": 1003, "doctorId": 102, "patientName": "患者丙", "appointDate": "2024-03-06", "status": "就诊中" },
              { "id": 1004, "doctorId": 103, "patientName": "患者丁", "appointDate": "2024-03-07", "status": "待诊"   }
            ],
            "aggregates": {
              "id": { "type": "count", "label": "预约总数" }
            }
          }
        }
      }
    },
    "relations": [
      { "relationName": "DepartmentDoctors",  "parentTable": "Departments", "childTable": "Doctors",       "childField": "departmentId", "dependencyType": "currentRow" },
      { "relationName": "DoctorAppointments", "parentTable": "Doctors",     "childTable": "Appointments",  "childField": "doctorId",     "dependencyType": "currentRow" }
    ]
  }
}
```

**验证通过要点**：
- ✅ 三级 ID 编号：科室 1-3，医生 101-104，预约 1001-1004
- ✅ `$count('Doctors')` / `$count('Appointments')` 引用名与对应 relation.childTable 完全一致
- ✅ 三级外键完整性：departmentId ∈ {1,2,3}，doctorId ∈ {101,102,103,104}
- ✅ doctorCount / appointmentCount 这两个计算列在 rows 中均无值
- ✅ aggregates 键名 `id` 与 Appointments.columns[0].name 匹配

---

### 案例 E：员工系统双视图（同一父表不同命名视图分别驱动不同子表）

**需求描述**：
- 员工表（Employees）：ID、姓名、部门、入职日期
  - 需要两个视图：`default`（列表页使用）和 `detail`（详情页使用）
- 考勤记录表（AttendanceRecords）：ID、员工ID（外键）、日期、状态
  - 与 Employees **default 视图**关联（列表切换行时更新）
- 薪资记录表（SalaryRecords）：ID、员工ID（外键）、月份、基本工资、绩效奖金、合计（计算列）；聚合：合计 sum
  - 与 Employees **detail 视图**关联（详情页显示薪资历史）
- 纯静态数据

**生成结果**：

```json
{
  "dataset": {
    "dataSetName": "HRManagementDataSet",
    "tables": {
      "Employees": {
        "columns": [
          { "name": "id",         "type": "number", "isPrimaryKey": true, "label": "员工ID"   },
          { "name": "name",       "type": "string",                       "label": "姓名"     },
          { "name": "department", "type": "string",                       "label": "部门"     },
          { "name": "hireDate",   "type": "date",                         "label": "入职日期" }
        ],
        "views": {
          "default": {
            "rows": [
              { "id": 1, "name": "张三", "department": "技术部", "hireDate": "2022-01-15" },
              { "id": 2, "name": "李四", "department": "市场部", "hireDate": "2021-06-01" },
              { "id": 3, "name": "王五", "department": "技术部", "hireDate": "2023-03-10" }
            ]
          },
          "detail": {}
        }
      },
      "AttendanceRecords": {
        "columns": [
          { "name": "id",         "type": "number", "isPrimaryKey": true, "label": "记录ID" },
          { "name": "employeeId", "type": "number",                       "label": "员工ID" },
          { "name": "date",       "type": "date",                         "label": "日期"   },
          { "name": "status",     "type": "string",                       "label": "状态"   }
        ],
        "views": {
          "default": {
            "rows": [
              { "id": 101, "employeeId": 1, "date": "2024-03-01", "status": "正常" },
              { "id": 102, "employeeId": 1, "date": "2024-03-04", "status": "迟到" },
              { "id": 103, "employeeId": 2, "date": "2024-03-01", "status": "正常" }
            ]
          }
        }
      },
      "SalaryRecords": {
        "columns": [
          { "name": "id",          "type": "number", "isPrimaryKey": true, "label": "薪资ID"   },
          { "name": "employeeId",  "type": "number",                       "label": "员工ID"   },
          { "name": "month",       "type": "string",                       "label": "月份"     },
          { "name": "baseSalary",  "type": "number",                       "label": "基本工资" },
          { "name": "bonus",       "type": "number",                       "label": "绩效奖金" },
          { "name": "totalSalary", "type": "number",                       "label": "合计工资",
            "computeExpression": "baseSalary + bonus" }
        ],
        "views": {
          "default": {
            "rows": [
              { "id": 101, "employeeId": 1, "month": "2024-01", "baseSalary": 10000, "bonus": 2000 },
              { "id": 102, "employeeId": 1, "month": "2024-02", "baseSalary": 10000, "bonus": 1500 },
              { "id": 103, "employeeId": 2, "month": "2024-01", "baseSalary": 8000,  "bonus": 3000 }
            ],
            "aggregates": {
              "totalSalary": { "type": "sum", "label": "工资总计" }
            }
          }
        }
      }
    },
    "relations": [
      {
        "relationName": "EmployeeAttendance",
        "parentTable": "Employees",
        "childTable": "AttendanceRecords",
        "childField": "employeeId",
        "dependencyType": "currentRow"
      },
      {
        "relationName":  "EmployeeDetailSalary",
        "parentTable":   "Employees",
        "parentViewId":  "detail",
        "childTable":    "SalaryRecords",
        "childField":    "employeeId",
        "dependencyType": "currentRow"
      }
    ]
  }
}
```

**验证通过要点**：
- ✅ Employees 在 `views` 中**显式声明了 `detail` 视图**（`"detail": {}`）
  — 这是必须的：`fromTableData` 只处理 `data.views` 中已声明的视图，若漏写则 detail 视图在初始化时不存在，第二条 relation 的级联将失效
- ✅ 第二条 relation 中 `parentViewId: "detail"` 绑定到 Employees.detail 视图
- ✅ 两张子表各自都是二级子表，id 均从 101 开始（互不影响，不同表）
- ✅ totalSalary 是计算列，rows 中无此字段值
- ✅ aggregates 键 `totalSalary` 与 SalaryRecords.columns 中的 name 一致

---

### 案例 F：供应商采购管理（三级层次 + API + 计算列 + 聚合）

**需求描述**：
- 供应商（Suppliers）：ID、名称、联系人、评级；有 API，页面加载自动拉取并选中第一行
- 采购单（PurchaseOrders）：ID、供应商ID（外键）、下单日期、总金额（子表小计之和，计算列）；有 API
- 采购明细（PurchaseDetails）：ID、采购单ID（外键）、商品名、数量、单价、小计（计算列：数量×单价）；有 API；聚合：合计金额 sum、合计数量 sum
- 三级关联：Suppliers → PurchaseOrders → PurchaseDetails（两条 currentRow 关联）

**生成结果**：

```json
{
  "dataset": {
    "dataSetName": "ProcurementDataSet",
    "tables": {
      "Suppliers": {
        "columns": [
          { "name": "id",      "type": "number", "isPrimaryKey": true, "label": "供应商ID"   },
          { "name": "name",    "type": "string",                       "label": "供应商名称" },
          { "name": "contact", "type": "string",                       "label": "联系人"     },
          { "name": "rating",  "type": "number",                       "label": "评级"       }
        ],
        "api": "/api/suppliers",
        "views": {
          "default": {
            "rows": [
              { "id": 1, "name": "供应商甲", "contact": "张经理", "rating": 5 },
              { "id": 2, "name": "供应商乙", "contact": "李经理", "rating": 4 },
              { "id": 3, "name": "供应商丙", "contact": "王经理", "rating": 3 }
            ],
            "autoLoad":        true,
            "autoSelectFirst": true
          }
        }
      },
      "PurchaseOrders": {
        "columns": [
          { "name": "id",          "type": "number", "isPrimaryKey": true, "label": "采购单ID"   },
          { "name": "supplierId",  "type": "number",                       "label": "供应商ID"   },
          { "name": "orderDate",   "type": "date",                         "label": "下单日期"   },
          { "name": "totalAmount", "type": "number",                       "label": "总金额",
            "computeExpression": "$sum('PurchaseDetails', 'subTotal')" }
        ],
        "api": "/api/purchase-orders",
        "views": {
          "default": {
            "rows": [
              { "id": 101, "supplierId": 1, "orderDate": "2024-03-01" },
              { "id": 102, "supplierId": 1, "orderDate": "2024-03-10" },
              { "id": 103, "supplierId": 2, "orderDate": "2024-03-05" }
            ]
          }
        }
      },
      "PurchaseDetails": {
        "columns": [
          { "name": "id",          "type": "number", "isPrimaryKey": true, "label": "明细ID"   },
          { "name": "orderId",     "type": "number",                       "label": "采购单ID" },
          { "name": "productName", "type": "string",                       "label": "商品名"   },
          { "name": "quantity",    "type": "number",                       "label": "数量"     },
          { "name": "unitPrice",   "type": "number",                       "label": "单价"     },
          { "name": "subTotal",    "type": "number",                       "label": "小计",
            "computeExpression": "quantity * unitPrice" }
        ],
        "api": "/api/purchase-details",
        "views": {
          "default": {
            "rows": [
              { "id": 1001, "orderId": 101, "productName": "零件A", "quantity": 100, "unitPrice": 5.5  },
              { "id": 1002, "orderId": 101, "productName": "零件B", "quantity":  50, "unitPrice": 12.0 },
              { "id": 1003, "orderId": 103, "productName": "设备C", "quantity":   2, "unitPrice": 3500 },
              { "id": 1004, "orderId": 102, "productName": "零件D", "quantity": 200, "unitPrice": 1.8  }
            ],
            "aggregates": {
              "subTotal":  { "type": "sum", "label": "合计金额" },
              "quantity":  { "type": "sum", "label": "合计数量" }
            }
          }
        }
      }
    },
    "relations": [
      { "relationName": "SupplierOrders", "parentTable": "Suppliers",      "childTable": "PurchaseOrders",  "childField": "supplierId", "dependencyType": "currentRow" },
      { "relationName": "OrderDetails",   "parentTable": "PurchaseOrders", "childTable": "PurchaseDetails", "childField": "orderId",    "dependencyType": "currentRow" }
    ]
  }
}
```

**验证通过要点**：
- ✅ `$sum('PurchaseDetails', 'subTotal')` 表名与 relations[1].childTable 一致，字段名 `subTotal` 与列 name 一致
- ✅ aggregates 键 `subTotal`、`quantity` 与 PurchaseDetails.columns 中已有列 name 完全匹配
- ✅ 三级外键完整性：supplierId ∈ {1,2,3}，orderId ∈ {101,102,103}
- ✅ totalAmount 和 subTotal 均为计算列，rows 中均无这两个字段值
- ✅ 三表均有 api 且同时有 rows（API 场景：rows 提供本地演示数据，api 用于生产请求，两者并存合法）

---

## 5. JSON 自检清单

生成 JSON 后，按以下清单逐项检查：

### 结构层面

- [ ] 顶层是 `{ "dataset": { ... } }`，不是直接 `{ "tables": { ... } }`
- [ ] `dataSetName` 已设置，以 "DataSet" 结尾
- [ ] `tables` 是对象，键名为 PascalCase（`OrderItems` ✅，`order_items` ❌）
- [ ] `relations` 是数组

### 表层面（每张表检查）

- [ ] 有 `columns` 数组
- [ ] 有且仅有一列 `"isPrimaryKey": true`
- [ ] 每列有 `name`（camelCase）和 `type`
- [ ] 面向用户展示的列已加 `label`

### 数据层面

- [ ] 每张表的 `views.default.rows` 中有 3-5 条数据
- [ ] 有 `computeExpression` 的列，rows 中**不含该列的值**
- [ ] 从表 rows 中的外键值在主表 rows 中**全部存在**（外键完整性）
- [ ] 可空字段已设 `"allowDBNull": true`，且 rows 中允许出现 `null`

### 关联层面（每条 relation 检查）

- [ ] 包含 `parentTable`、`childTable`、`childField`
- [ ] `childField` 是**子视图所在表** columns 中已定义的字段名
- [ ] `dependencyType` 选择正确（主从钻取用 `currentRow`，字典/全集用 `allRows`）
- [ ] 同一张表有多个视图时，已正确填写 `parentViewId` / `childViewId`（默认均为 `'default'`）
- [ ] 若使用了非 default 的 `parentViewId`，该表的 `views` 键中已显式声明该视图（哪怕是空对象 `{}`）

### 计算列 / 聚合层面

- [ ] 子表聚合函数的表名与 `relation.childTable` 完全一致（包含大小写）
- [ ] 多语句表达式中所有代码路径都有 `return`
- [ ] `aggregates` 的键名与 `columns` 中的 `name` 完全匹配

### API 层面

- [ ] 有后端 API 的表才加 `"api": "..."` 或 `"api": true`
- [ ] 纯静态内联数据的表**不加** api 字段

---

## 6. 配置参考速查

### 列类型速查

| type 值 | 适用场景 |
|---------|---------|
| `number` | 浮点数（金额、分数） |
| `int` | 整数（数量、年龄） |
| `string` | 通用文本 |
| `varchar` | 短文本（字段长度有约束时） |
| `text` | 长文本（备注、描述） |
| `boolean` / `bool` | 布尔值（是/否、启用/禁用） |
| `date` | 日期（`2024-03-15`） |
| `datetime` | 日期时间（`2024-03-15T10:30:00`） |
| `time` | 时间（`10:30:00`） |
| `object` | JSON 对象 |
| `array` | JSON 数组 |
| `enum` | 枚举值 |

### dependencyType 选择指南

`dependencyType` 描述**父视图的哪种状态变化**会触发子视图重新过滤：

| 场景 | dependencyType | 示例 |
|------|----------------|------|
| 父视图当前行（单选）驱动子视图 | `currentRow` | 点击订单行 → 明细子视图更新 |
| 父视图全部行驱动子视图（字典表）| `allRows` | 分类下拉数据源一次性加载 |
| 父视图勾选行驱动子视图 | `selectedRows` | 批量勾选后汇总查看子数据 |
| 父视图当前页驱动子视图 | `pagedRows` | 大数据分页场景 |

### computeExpression 常用模式

| 场景 | 表达式示例 |
|------|-----------|
| 乘法小计 | `"price * quantity"` |
| 字符串拼接 | `"lastName + ' ' + firstName"` |
| 百分比 | `"Math.round(score / total * 100)"` |
| 条件文本 | `"status === 'active' ? '启用' : '禁用'"` |
| 多级判断 | `"if (score >= 90) return 'A'; if (score >= 60) return 'B'; return 'C';"` |
| 子行计数 | `"$count('OrderItems')"` |
| 子行求和 | `"$sum('OrderItems', 'amount')"` |
| 子行拼接 | `"$join('Tags', 'name', ', ')"` |

### 聚合类型速查

| type | 说明 | 适用数据 |
|------|------|---------|
| `sum` | 求和 | 金额、数量 |
| `count` | 计数（不含 null）| id、任意列 |
| `avg` | 平均值 | 分数、价格 |
| `min` | 最小值 | 价格、日期 |
| `max` | 最大值 | 价格、日期 |
| `join` | 拼接字符串 | 标签、名称列表 |

> 聚合通过 DataKey `TableName@summaryRow` 绑定到 UI 汇总行，  
> 或 `TableName@selectionSummaryRow` 绑定选中行的汇总。

---

## 附：提示词版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2025-06 | 初始版本，覆盖基础表/关系/计算列/聚合/API 配置 |
| v1.1 | 2026-03 | 修正 DataView 架构描述：DataView 是唯一通道，每表默认视图，多视图通过 views 键声明 |
| v1.2 | 2026-03 | 补充规则 7：非 default 命名视图必须在 views 中显式声明；新增验证案例 D/E/F |
| v1.3 | 2026-06 | 补充规则 11：API 表级联 vs 内存级联行为说明；案例 A/B/C 和示例 9 已通过 DataSet 实例化测试（`dataset-prompt-validation.test.ts`，25/25 通过）|
| v1.4 | 2026-07 | 重写【2】：新增视图层核心概念解释、简写 vs 内部理解对照框、何时需要 views 键决策口诀；示例 9 新增 DataView 层注释 |
