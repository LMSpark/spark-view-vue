# SPARK DataSet JSON 配置 AI 生成指南

> 当前推荐直接使用完整版提示词：[PAGEDATA_JSON_COMPLETE_PROMPT.md](PAGEDATA_JSON_COMPLETE_PROMPT.md)。
>
> 本文仍保留案例与扩展说明；如果你只是要一份可直接复制给 AI 的完整 pagedata.json 提示词，优先使用上面的新文档和 [DATASET_JSON_PROMPT_TEMPLATE.md](DATASET_JSON_PROMPT_TEMPLATE.md)。

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
   - [案例 G：仓库库存管理（v1.9 新特性：复合主键 + integer/decimal + $list + aggregates.field/separator）](#案例-g仓库库存管理v19-新特性复合主键--integerdecimal--list--aggregatesfieldseparator)
   - [案例 H：仓库库存管理（外部 AI 验证：number/string/date + 多分支计算列 + 双 relation）](#案例-h仓库库存管理外部-ai-验证numberstringdate--多分支计算列--双-relation)
   - [案例 I：物业管理系统（提示词模板自测：三级层次 + $count/$sum/$join + aggregates.field）](#案例-i物业管理系统提示词模板自测三级层次--countsumjoin--aggregatesfield)
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

每张表有两层：DataTable（列定义 + api）+ DataView（数据层，UI 唯一来源）：

  DataSet
    └── DataTable "Orders"
          ├── columns: [...]        ← 列定义（与视图无关）
          ├── api: "/api/..."       ← 可选
          └── DataView "default"
                ├── rows: [...]          ← 表格 / 表单绑定
                ├── currentRow           ← 驱动 currentRow 依赖
                ├── selectedRows: [...]  ← 驱动 selectedRows 依赖
                ├── summaryRow           ← aggregates 全行汇总
                ├── selectionSummaryRow  ← aggregates 选中行汇总
                └── aggregates: {...}    ← 视图级聚合规则

每张表对象的标准写法（rows / aggregates / autoLoad 均在 views.default 内）：

  "TableName": {
    "columns": [...],                  // 必填
    "api":     "/api/...",             // 可选：有后端接口时填写
    "views": {
      "default": {                     // 必须显式声明
        "rows":             [...],     // 3-5 条测试行
        "autoLoad":         true,      // 可选：初始化后自动请求 api 加载数据
        "autoCurrentFirst": true,      // 可选：加载后自动将第一行设为 currentRow（驱动 currentRow 级联）
        "autoSelectFirst":  true,      // 可选：加载后自动将第一行加入 selectedRows（驱动 selectedRows 级联）
        "aggregates":       { ... }    // 可选：聚合规则
      },
      "otherViewId": {}                // 仅当某 relation 使用了此 viewId 时才添加
    }
  }

═══════════════════════════════════════════════════
【3】列（Column）定义
═══════════════════════════════════════════════════

每列对象的字段：

{
  "name":              "fieldName",   // 必填：camelCase 字段名
  "type":              "string",      // 必填：见「数据类型」
  "label":             "字段标签",    // 推荐：UI 表头显示文字（中文）
  "isPrimaryKey":      true,          // 标记主键列（多列同时标记 → 自动合成复合主键 _pk）
  "autoIncrement":     true,          // 可选：自增主键
  "allowDBNull":       false,         // 可选：是否允许空值
  "defaultValue":      null,          // 可选：字段默认值
  "computeExpression": "price * qty"  // 可选：计算列表达式
}

数据类型（type）完整列表：
number | int | integer | decimal | float | double |
string | varchar | text | boolean | bool |
date | datetime | time | object | array | enum

═══════════════════════════════════════════════════
【4】视图关联关系（Relations）
═══════════════════════════════════════════════════

父视图的交互状态变化（切换当前行 / 勾选行）→ 子视图自动过滤匹配行。
parentViewId / childViewId 默认均为 'default'，单视图页面可省略。

relations 数组中每条关联：

{
  "parentTable":    "ParentName",    // 必填：父视图所在表名
  "parentViewId":   "default",       // 可选：父视图 ID（默认 'default'）
  "childTable":     "ChildName",     // 必填：子视图所在表名
  "childViewId":    "default",       // 可选：子视图 ID（默认 'default'）
  "parentField":    "id",            // 可选：父视图匹配字段（默认取父表主键）
  "childField":     "parentId",      // 必填：子视图行中的外键字段名
  "dependencyType": "currentRow",    // 推荐填写：见选择规则
  "cascadeUpdate":  true,            // 可选：父视图行更新时级联刷新子视图
  "cascadeDelete":  true,            // 可选：父视图行删除时级联删除子视图匹配行
  "autoLoad":       false,           // 可选：父视图行切换时是否自动请求子视图 api（默认 true，设为 false 禁用）
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
  "$list('ChildTable', 'fieldName')"            // 子行字段值数组（返回 unknown[]）
  "$join('ChildTable', 'fieldName', ' | ')"     // 子行字段拼接（第三参数为分隔符，默认 ', '）

═══════════════════════════════════════════════════
【6】视图聚合（aggregates）
═══════════════════════════════════════════════════

声明后自动维护 summaryRow（全行汇总）和 selectionSummaryRow（选中行汇总），可通过
DataKey 绑定到 UI 汇总行。

"aggregates": {
  "amount":     { "type": "sum",   "label": "合计金额" },
  "score":      { "type": "avg",   "label": "平均分"   },
  "id":         { "type": "count", "label": "总记录数" },
  "minPrice":   { "type": "min",   "field": "price", "label": "最低价" },
  "maxPrice":   { "type": "max",   "field": "price", "label": "最高价" },
  "tags":       { "type": "join",  "label": "标签列表", "separator": " | " }
}

支持类型：sum | count | avg | min | max | join
- 键名 = summaryRow 中的输出字段名（可与列名不同）
- field（可选）= 聚合哪个源字段；省略时默认取与键名同名的列
- separator（可选）= 仅 join 类型有效，默认 ', '

═══════════════════════════════════════════════════
【7】API 配置（有后端接口时使用）
═══════════════════════════════════════════════════

字符串简写（自动展开为 CRUD 五端点 + Tree 端点族）：
  "api": "/api/users"

true 简写（从表名按 kebab-case 约定生成路径，如 OrderItems → /api/order-items）：
  "api": true

完整对象（自定义每个端点，URL 路径参数用 {id} 格式）：
  "api": {
    "list":     { "url": "/api/users",      "method": "GET"    },
    "create":   { "url": "/api/users",      "method": "POST"   },
    "retrieve": { "url": "/api/users/{id}", "method": "GET"    },
    "update":   { "url": "/api/users/{id}", "method": "PUT"    },
    "delete":   { "url": "/api/users/{id}", "method": "DELETE" }
  }

纯静态演示数据（仅 rows 内联）不要添加 api 字段。

═══════════════════════════════════════════════════
【8】生成规则（必须严格遵守）
═══════════════════════════════════════════════════

1. 【主键规则】每张业务表通常一列声明 "isPrimaryKey": true（id 列）；需要复合主键时可同时标记多列，框架自动合成 _pk 计算列作为唯一标识

2. 【测试数据】每张表在 `views.default.rows` 中提供 3-5 条有代表性的测试数据

3. 【外键完整性】rows 中的外键值必须对应父表 rows 中存在的 id 值，不允许引用不存在的父行

4. 【ID 编号规范】顶级表 id 从 1 开始，二级子表 id 从 101 开始，三级子表 id 从 1001 开始

5. 【计算列不填 rows】有 computeExpression 的列，rows 中不要为该列填充数据（由系统自动计算）

6. 【标签规范】所有面向用户展示的字段须添加 label 属性（中文），id/外键列按需添加

7. 【views 声明规则】每张表必须有 views.default（见【2】标准写法）。
   ⚠️ 若某 relation 使用了非 default 的 parentViewId / childViewId，该表 views 中必须
   显式声明该视图（如 "detail": {}），否则级联将无法生效。

8. 【命名规范】表名用 PascalCase（OrderItems），字段名用 camelCase（orderId），
   dataSetName 以 DataSet 结尾（UserOrderDataSet）

9. 【外键列必须在 columns 中定义】从表必须在 columns 数组中包含外键列的定义

10. 【静态数据不加 api】仅有 rows 内联数据的表不要添加 api 字段

11. 【API 表级联行为】子表是否配置 `api` 决定级联走哪条路径：
    - 子表**无 api**（纯静态/内联数据）→ 级联在内存中直接过滤 `DataTable.rows`，无需网络请求，适合演示页面
    - 子表**有 api**（后端 REST 接口）→ 父行切换时自动发 HTTP 请求刷新子视图（框架在 URL 参数中携带父行主键）
    演示/原型页面推荐全部使用无 api 静态数据（规则 10），实现完全离线的内存级联。

12. 【tables 顺序约束】如果存在 relation，所有 `parentTable` 必须在 `tables` 对象中排在对应 `childTable` 之前。
  原因：当前 DataSet 构造阶段会在表注册过程中立即建立级联订阅；若 childTable 先于 parentTable 创建，可能出现“父视图 X:default 不存在，请检查 DataSet 关系配置”。

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
- ✅ Readers / BorrowRecords 各有一列 `isPrimaryKey: true`
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
            "autoLoad":         true,
            "autoCurrentFirst": true
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

### 案例 G：仓库库存管理（v1.9 新特性：复合主键 + integer/decimal + $list + aggregates.field/separator）✅ 已通过 DataSet 实例化测试

**需求描述**：
- 仓库表（Warehouses）：ID（integer）、名称（varchar）、城市（varchar）；自动计算：库存总值（`$sum`）、产品编码列表（`$list`，返回数组）、产品名称拼接（`$join`，分隔符 ` / `）
- 库存明细表（StockItems）：**复合主键**（warehouseId + productCode，两列同时标记 `isPrimaryKey: true`，框架自动合成 `_pk`）、产品名称（varchar）、数量（integer）、单价（decimal）；计算列：库存价值（数量 × 单价）；聚合：`totalVal`（sum，`field` 覆盖源字段 `totalValue`）、`productList`（join，`separator: " | "`）
- 关联：点击仓库 → 显示该仓库的库存明细（`parentField` 显式声明）
- 纯静态数据，无后端 API

**生成结果**（按提示词规范生成，覆盖 v1.9 所有新特性）：

```json
{
  "dataset": {
    "dataSetName": "WarehouseInventoryDataSet",
    "tables": {
      "Warehouses": {
        "columns": [
          { "name": "id",              "type": "integer", "isPrimaryKey": true, "label": "仓库ID"       },
          { "name": "name",            "type": "varchar",                       "label": "仓库名称"   },
          { "name": "city",            "type": "varchar",                       "label": "所在城市"   },
          { "name": "totalStockValue", "type": "decimal",                       "label": "库存总值",
            "computeExpression": "$sum('StockItems', 'totalValue')" },
          { "name": "productCodes",    "type": "array",                         "label": "产品编码列表",
            "computeExpression": "$list('StockItems', 'productCode')" },
          { "name": "productNames",    "type": "string",                        "label": "产品名称拼接",
            "computeExpression": "$join('StockItems', 'productName', ' / ')" }
        ],
        "views": {
          "default": {
            "rows": [
              { "id": 1, "name": "北京仓", "city": "北京" },
              { "id": 2, "name": "上海仓", "city": "上海" }
            ]
          }
        }
      },
      "StockItems": {
        "columns": [
          { "name": "warehouseId",  "type": "integer", "isPrimaryKey": true, "label": "仓库ID"   },
          { "name": "productCode",  "type": "varchar", "isPrimaryKey": true, "label": "产品编码" },
          { "name": "productName",  "type": "varchar",                       "label": "产品名称" },
          { "name": "quantity",     "type": "integer",                       "label": "库存数量" },
          { "name": "unitPrice",    "type": "decimal",                       "label": "单价"     },
          { "name": "totalValue",   "type": "decimal",                       "label": "库存价值",
            "computeExpression": "quantity * unitPrice" }
        ],
        "views": {
          "default": {
            "rows": [
              { "warehouseId": 1, "productCode": "P001", "productName": "笔记本电脑", "quantity": 10, "unitPrice": 5999.99 },
              { "warehouseId": 1, "productCode": "P002", "productName": "无线鼠标",   "quantity": 50, "unitPrice": 99.50   },
              { "warehouseId": 2, "productCode": "P001", "productName": "笔记本电脑", "quantity": 5,  "unitPrice": 5999.99 },
              { "warehouseId": 2, "productCode": "P003", "productName": "机械键盘",   "quantity": 20, "unitPrice": 299.00  }
            ],
            "aggregates": {
              "totalVal":    { "type": "sum",  "field": "totalValue",  "label": "库存总值"  },
              "productList": { "type": "join", "field": "productName", "separator": " | ", "label": "产品列表" }
            }
          }
        }
      }
    },
    "relations": [
      {
        "relationName":   "WarehouseStock",
        "parentTable":    "Warehouses",
        "parentField":    "id",
        "childTable":     "StockItems",
        "childField":     "warehouseId",
        "dependencyType": "currentRow"
      }
    ]
  }
}
```

**验证通过要点**：
- ✅ `integer` / `decimal` / `varchar` / `array` 类型均可被框架解析（v1.9 补充类型）
- ✅ `StockItems` 两列同时标记 `"isPrimaryKey": true` → 框架自动合成 `_pk` 计算列（复合主键）
- ✅ `$list('StockItems', 'productCode')` 返回 `unknown[]` 数组（v1.9 新增函数），rows 中**不含 productCodes 值**
- ✅ `aggregates.totalVal.field = 'totalValue'`：输出键名（totalVal）与源字段名（totalValue）不同（field 覆盖）
- ✅ `aggregates.productList.separator = ' | '`：join 类型自定义分隔符（默认 ', '）
- ✅ `relations[0].parentField = 'id'`：显式声明父视图匹配字段（v1.9 补充文档）
- ✅ 规则 10：无 api 字段（纯静态数据），级联走内存过滤路径
- ✅ 外键完整性：StockItems.warehouseId ∈ {1, 2}，均在 Warehouses.rows 中存在
- ✅ 计算列（totalStockValue / productCodes / productNames / totalValue）在 rows 中**均不填充值**

---

### 案例 H：仓库库存管理（外部 AI 验证：number/string/date + 多分支计算列 + 双 relation）✅ 已通过 DataSet 实例化测试

**需求描述**：
- 仓库表（Warehouses）：ID、名称、城市、负责人
- 库存表（Inventories）：ID、仓库ID（外键）、商品名称、SKU、库存数量、单位、最低预警值；计算列：库存状态（quantity ≤ minQuantity → 预警，否则正常）
- 入库记录表（Inbounds）：ID、仓库ID（外键）、商品名称、入库数量、入库日期、供应商；聚合：入库总数量 sum
- 双 relation：Warehouses→Inventories，Warehouses→Inbounds（均 currentRow）
- 纯静态数据，无后端 API
- **来源**：外部 AI（非本项目 AI）按标准提示词模板生成，用于验证提示词对外部模型的引导效果

**生成结果**：

```json
{
  "dataset": {
    "dataSetName": "WarehouseStockDataSet",
    "tables": {
      "Warehouses": {
        "columns": [
          { "name": "id",      "type": "number", "isPrimaryKey": true, "label": "仓库ID"   },
          { "name": "name",    "type": "string",                       "label": "仓库名称" },
          { "name": "city",    "type": "string",                       "label": "城市"     },
          { "name": "manager", "type": "string",                       "label": "负责人"   }
        ],
        "views": {
          "default": {
            "rows": [
              { "id": 1, "name": "华东仓", "city": "上海", "manager": "张伟" },
              { "id": 2, "name": "华南仓", "city": "广州", "manager": "李强" },
              { "id": 3, "name": "华北仓", "city": "北京", "manager": "王芳" }
            ]
          }
        }
      },
      "Inventories": {
        "columns": [
          { "name": "id",          "type": "number", "isPrimaryKey": true, "label": "库存ID"         },
          { "name": "warehouseId", "type": "number",                       "label": "仓库ID"         },
          { "name": "productName", "type": "string",                       "label": "商品名称"       },
          { "name": "sku",         "type": "string",                       "label": "SKU编号"        },
          { "name": "quantity",    "type": "number",                       "label": "当前库存数量"   },
          { "name": "unit",        "type": "string",                       "label": "单位"           },
          { "name": "minQuantity", "type": "number",                       "label": "最低库存预警值" },
          { "name": "status",      "type": "string",                       "label": "库存状态",
            "computeExpression": "if (quantity <= minQuantity) return '预警'; return '正常';" }
        ],
        "views": {
          "default": {
            "rows": [
              { "id": 101, "warehouseId": 1, "productName": "智能手机",   "sku": "PHN-001", "quantity": 50,  "unit": "件", "minQuantity": 20 },
              { "id": 102, "warehouseId": 1, "productName": "笔记本电脑", "sku": "NTB-002", "quantity": 8,   "unit": "件", "minQuantity": 10 },
              { "id": 103, "warehouseId": 2, "productName": "平板电脑",   "sku": "TAB-003", "quantity": 30,  "unit": "件", "minQuantity": 15 },
              { "id": 104, "warehouseId": 2, "productName": "充电器",     "sku": "CHG-004", "quantity": 5,   "unit": "箱", "minQuantity": 5  },
              { "id": 105, "warehouseId": 3, "productName": "耳机",       "sku": "HPH-005", "quantity": 100, "unit": "件", "minQuantity": 30 }
            ]
          }
        }
      },
      "Inbounds": {
        "columns": [
          { "name": "id",          "type": "number", "isPrimaryKey": true, "label": "入库ID"   },
          { "name": "warehouseId", "type": "number",                       "label": "仓库ID"   },
          { "name": "productName", "type": "string",                       "label": "商品名称" },
          { "name": "inQuantity",  "type": "number",                       "label": "入库数量" },
          { "name": "inDate",      "type": "date",                         "label": "入库日期" },
          { "name": "supplier",    "type": "string",                       "label": "供应商"   }
        ],
        "views": {
          "default": {
            "rows": [
              { "id": 101, "warehouseId": 1, "productName": "智能手机",   "inQuantity": 100, "inDate": "2024-03-01", "supplier": "华为供应链" },
              { "id": 102, "warehouseId": 1, "productName": "笔记本电脑", "inQuantity": 30,  "inDate": "2024-03-05", "supplier": "联想科技"   },
              { "id": 103, "warehouseId": 2, "productName": "平板电脑",   "inQuantity": 50,  "inDate": "2024-03-03", "supplier": "苹果授权商" },
              { "id": 104, "warehouseId": 3, "productName": "耳机",       "inQuantity": 200, "inDate": "2024-03-10", "supplier": "索尼代理"   }
            ],
            "aggregates": {
              "inQuantity": { "type": "sum", "label": "入库总数量" }
            }
          }
        }
      }
    },
    "relations": [
      {
        "relationName":   "WarehouseInventories",
        "parentTable":    "Warehouses",
        "childTable":     "Inventories",
        "childField":     "warehouseId",
        "dependencyType": "currentRow"
      },
      {
        "relationName":   "WarehouseInbounds",
        "parentTable":    "Warehouses",
        "childTable":     "Inbounds",
        "childField":     "warehouseId",
        "dependencyType": "currentRow"
      }
    ]
  }
}
```

**验证通过要点**：
- ✅ 顶层 `{ "dataset": {...} }` 结构正确
- ✅ `rows` 和 `aggregates` 均在 `views.default` 内（v1.9 核心结构要求）
- ✅ 计算列 `status` 多分支逻辑正确（含边界值 quantity===minQuantity → 预警）
- ✅ 两条 relation 均已声明（WarehouseInventories + WarehouseInbounds）
- ✅ 外键完整性：warehouseId ∈ {1,2,3} 均在 Warehouses.rows 中存在
- ✅ 无多余 api 字段（纯静态数据）
- ✅ `aggregates.inQuantity` 直接使用列名作为键名（无需 field 覆盖）
- ✅ 全量汇总 inQuantity sum = 380，级联后华东仓 = 130

---

### 案例 I：物业管理系统（提示词模板自测：三级层次 + $count/$sum/$join + aggregates.field）✅ 已通过 DataSet 实例化测试

**需求描述**：
- 小区表（Communities）：ID、名称、地址、物业经理；自动统计楼栋数（$count）、总户数（$sum）
- 楼栋表（Buildings）：ID、小区ID（外键）、楼栋号、楼层数、户数；自动统计报修数（$count）、报修类型列表（$join）
- 报修工单表（RepairOrders）：ID、楼栋ID（外键）、报修人、电话、类型、描述、日期、优先级；计算列：状态（优先级≥3 → 紧急，=2 → 一般，其他 → 低优先）
- 三级关联：小区→楼栋→报修工单（两条 currentRow 关联）
- 聚合：报修工单 count + 报修类型 join（field 覆盖）
- 纯静态数据，无后端 API
- **来源**：使用独立提示词模板文件自测，验证提示词模板的完整性和准确性

**生成结果**：

```json
{
  "dataset": {
    "dataSetName": "PropertyManagementDataSet",
    "tables": {
      "Communities": {
        "columns": [
          { "name": "id",            "type": "number", "isPrimaryKey": true, "label": "小区ID"     },
          { "name": "name",          "type": "string",                       "label": "小区名称"   },
          { "name": "address",       "type": "string",                       "label": "地址"       },
          { "name": "manager",       "type": "string",                       "label": "物业经理"   },
          { "name": "buildingCount", "type": "number",                       "label": "楼栋数",
            "computeExpression": "$count('Buildings')" },
          { "name": "totalUnits",    "type": "number",                       "label": "总户数",
            "computeExpression": "$sum('Buildings', 'unitCount')" }
        ],
        "views": {
          "default": {
            "rows": [
              { "id": 1, "name": "翠湖花园",   "address": "翠湖路100号", "manager": "张经理" },
              { "id": 2, "name": "金色阳光城", "address": "阳光大道88号", "manager": "王经理" },
              { "id": 3, "name": "碧水湾",     "address": "滨江路66号",  "manager": "李经理" }
            ]
          }
        }
      },
      "Buildings": {
        "columns": [
          { "name": "id",          "type": "number", "isPrimaryKey": true, "label": "楼栋ID"       },
          { "name": "communityId", "type": "number",                       "label": "小区ID"       },
          { "name": "buildingNo",  "type": "string",                       "label": "楼栋号"       },
          { "name": "floorCount",  "type": "number",                       "label": "楼层数"       },
          { "name": "unitCount",   "type": "number",                       "label": "户数"         },
          { "name": "repairCount", "type": "number",                       "label": "报修数",
            "computeExpression": "$count('RepairOrders')" },
          { "name": "repairTypes", "type": "string",                       "label": "报修类型列表",
            "computeExpression": "$join('RepairOrders', 'repairType', ' / ')" }
        ],
        "views": {
          "default": {
            "rows": [
              { "id": 101, "communityId": 1, "buildingNo": "1栋",  "floorCount": 18, "unitCount": 72  },
              { "id": 102, "communityId": 1, "buildingNo": "2栋",  "floorCount": 22, "unitCount": 88  },
              { "id": 103, "communityId": 2, "buildingNo": "A栋", "floorCount": 30, "unitCount": 120 },
              { "id": 104, "communityId": 3, "buildingNo": "1栋",  "floorCount": 12, "unitCount": 48  }
            ]
          }
        }
      },
      "RepairOrders": {
        "columns": [
          { "name": "id",          "type": "number", "isPrimaryKey": true, "label": "工单ID"   },
          { "name": "buildingId",  "type": "number",                       "label": "楼栋ID"   },
          { "name": "reporter",    "type": "string",                       "label": "报修人"   },
          { "name": "phone",       "type": "string",                       "label": "联系电话" },
          { "name": "repairType",  "type": "string",                       "label": "报修类型" },
          { "name": "description", "type": "string",                       "label": "问题描述" },
          { "name": "reportDate",  "type": "date",                         "label": "报修日期" },
          { "name": "priority",    "type": "number",                       "label": "优先级"   },
          { "name": "status",      "type": "string",                       "label": "状态",
            "computeExpression": "if (priority >= 3) return '紧急'; if (priority === 2) return '一般'; return '低优先';" }
        ],
        "views": {
          "default": {
            "rows": [
              { "id": 1001, "buildingId": 101, "reporter": "张三", "phone": "13800001001", "repairType": "水管漏水",   "description": "厨房水管漏水严重",   "reportDate": "2024-03-01", "priority": 3 },
              { "id": 1002, "buildingId": 101, "reporter": "李四", "phone": "13800001002", "repairType": "电梯故障",   "description": "电梯停在5楼不动",    "reportDate": "2024-03-03", "priority": 3 },
              { "id": 1003, "buildingId": 102, "reporter": "王五", "phone": "13800001003", "repairType": "门禁损坏",   "description": "单元门禁刷卡无反应", "reportDate": "2024-03-05", "priority": 2 },
              { "id": 1004, "buildingId": 103, "reporter": "赵六", "phone": "13800001004", "repairType": "墙面脱落",   "description": "走廊墙面涂料脱落",   "reportDate": "2024-03-08", "priority": 1 },
              { "id": 1005, "buildingId": 104, "reporter": "孙七", "phone": "13800001005", "repairType": "水管漏水",   "description": "卫生间水管渗水",     "reportDate": "2024-03-10", "priority": 2 }
            ],
            "aggregates": {
              "id":       { "type": "count", "label": "报修总数" },
              "typeList": { "type": "join",  "field": "repairType", "separator": " | ", "label": "报修类型汇总" }
            }
          }
        }
      }
    },
    "relations": [
      {
        "relationName":   "CommunityBuildings",
        "parentTable":    "Communities",
        "childTable":     "Buildings",
        "childField":     "communityId",
        "dependencyType": "currentRow"
      },
      {
        "relationName":   "BuildingRepairOrders",
        "parentTable":    "Buildings",
        "childTable":     "RepairOrders",
        "childField":     "buildingId",
        "dependencyType": "currentRow"
      }
    ]
  }
}
```

**验证通过要点**：
- ✅ 三级 ID 编号：小区 1-3，楼栋 101-104，工单 1001-1005
- ✅ `$count('Buildings')` / `$sum('Buildings', 'unitCount')` 一级计算列正确（翠湖花园: 2栋, 160户）
- ✅ `$count('RepairOrders')` / `$join('RepairOrders', 'repairType', ' / ')` 二级计算列正确
- ✅ 计算列 `status` 三分支逻辑：priority≥3→紧急，=2→一般，其他→低优先
- ✅ `aggregates.typeList.field = 'repairType'`：输出键名（typeList）与源字段名（repairType）不同（field 覆盖）
- ✅ 三级外键完整性：communityId ∈ {1,2,3}，buildingId ∈ {101,102,103,104}
- ✅ 级联后 aggregates 只汇总过滤行（翠湖花园→1栋: count=2, typeList="水管漏水 | 电梯故障"）
- ✅ 所有计算列（buildingCount / totalUnits / repairCount / repairTypes / status）在 rows 中均不填充值

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
- [ ] 至少一列标记了 `"isPrimaryKey": true`（复合主键可标记多列）
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
