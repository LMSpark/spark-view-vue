# SPARK pagedata.json 案例与验证附录

> 当前推荐直接使用完整版提示词：[PAGEDATA_JSON_COMPLETE_PROMPT.md](PAGEDATA_JSON_COMPLETE_PROMPT.md)。
>
> 本文只保留案例入口、自检清单与配置速查；schema 规则以生产版主入口为唯一事实源。
>
> 所属： [AI 文档体系](../../README.md) / 数据生成 / 案例与验证附录。

## 1. 定位

`pagedata.json` 的数据部分必须直接输出 canonical DataSet：

```json
{
  "dataSetName": "BusinessDataSet",
  "tables": {},
  "tableRelations": []
}
```

历史 `{ "dataset": { ... } }` 包裹结构已经移除，不再作为输入或输出格式。

## 2. 使用顺序

1. 直接复制 [PAGEDATA_JSON_COMPLETE_PROMPT.md](PAGEDATA_JSON_COMPLETE_PROMPT.md) 中的“完整提示词”正文。
2. 将业务需求追加到提示词末尾，让 AI 只输出 pagedata.json。
3. 需要对照案例时，查看仓库级质量门 [dataset-json-prompt-validation.test.ts](../../../../tests/dataset-json-prompt-validation.test.ts)。
4. 修改数据生成规则时，先改生产版主入口，再同步本页清单或测试案例。

## 3. 最小示例

```json
{
  "dataSetName": "LibraryDataSet",
  "tables": {
    "Readers": {
      "columns": [
        { "name": "id", "type": "number", "isPrimaryKey": true, "label": "读者ID" },
        { "name": "name", "type": "string", "label": "姓名" }
      ],
      "views": {
        "default": {
          "rows": [
            { "id": 1, "name": "张三" },
            { "id": 2, "name": "李四" }
          ]
        }
      }
    }
  },
  "tableRelations": []
}
```

## 4. JSON 自检清单

- 顶层是 canonical DataSet，直接包含 `dataSetName`、`tables`、`tableRelations`。
- 不输出 `{ "dataset": { ... } }` 包裹结构。
- 每张表都声明 `columns` 和 `views.default`。
- 行数据只放在 `views.default.rows` 或命名视图的 `rows` 中，不放在表根级。
- 主键列使用 `isPrimaryKey: true`。
- `computeExpression` 列不要在 rows 中手填派生值。
- 聚合写在视图的 `aggregates` 中，不写在列定义上。
- `tableRelations` 默认只写 `parentTable`、`childTable`、`parentField`、`childField`。
- 只有非默认联动时再补 `viewDependencies`。
- 树数据使用 `treeConfig` 描述树字段，不用脚本承载主流程。
- 远程表至少提供合理的 list 接口；纯静态表不要带无意义 api。
- JSON 必须合法，无注释、无尾逗号、无省略号。

## 5. 可执行案例

完整案例已迁移到 Vitest 质量门，避免文档和测试维护两份事实：

- 图书馆管理：简单两表 + 主从关系
- 电商订单管理：计算列 + 聚合
- 学生成绩管理：`$avg` + 多语句计算列
- 仓库库存管理：多表级联 + 聚合
- 物业管理系统：三级层次 + `$count` / `$sum` / `$join`

运行：

```bash
pnpm exec vitest run tests/dataset-json-prompt-validation.test.ts
```
