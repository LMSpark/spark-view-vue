# 数据加载与绑定 — 完整指南

快速概览：页面配置 → DataSet 初始化 → 容器组件按 `dataKey` 解析 `DataView` → 渲染器通过 `props.dataSource` / 组件上下文消费 `DataView` → `DataView` 事件驱动（`stateChanged`）完成加载与级联触发。

---

## 1. 设计目标 🎯
- 明确职责：
  - `DataTable` 只负责结构与配置；
  - `DataView` 是数据拥有者（结构兼容 `IDataSource`、响应式、并对外提供 `loadFromServer()` / CRUD）；
  - 级联加载通过 `DataView.setupCascade()` / `respondToParentChange()` 实现（由事件驱动）。
- 渲染层仅依赖 `IDataSource`（通过 `props.dataSource`），不直接触发加载。

## 2. 关键角色与职责（速查） 🔧
- `DataSet` — 管理表、关系、提供 `requestTableData()`。
- `DataTable` — 表结构、视图容器（不持有运行时数据）。
- `DataView` — 视图级数据（结构兼容 `IDataSource`），提供 `loadFromServer()`、CRUD、事件（`stateChanged`）。
- 级联联动 — 通过 `DataView.setupCascade()` / `respondToParentChange()` 实现（父变更 → 子视图自行处理/加载）。
- 渲染器（`RendererTable` / `RendererTree`）— 仅接收 `props.dataSource`（若空则调用 `dataSource.loadFromServer()`）。

## 3. DataKey 与绑定规则 🔗
- 规范格式：`tableName@viewId@field` 或 `tableName@field`（工具：`isDataKey()` / `parseDataKey()` / `resolveDataKey()`）。
- 解析行为：
  - `field === 'rows'` → 返回 `DataView`（`DataView` 实现 `IDataSource`）。
  - 渲染器会把 `DataView` 注入到 `props.dataSource` 和 `props.dataView`。
  - `r-form` / `r-detail` 等单对象容器仍使用 `props.data`。

示例 rule（pagedata）:

```json
{
  "type": "r-table",
  "dataKey": "dataset@Users@default@rows"
}
```

## 4. 完整加载流程（按步骤） 🔁
1. 页面初始化：`usePageDataSet.initDataSet()` — 将 `pagedata.json` 归一化为 `DataSet`。
2. 视图创建：`DataTable.getOrCreateView()` → `DataView`（响应式）并 `setupCascade()`。
3. 容器解析：`RendererTable` / `RendererTree` / `RendererForm` 等组件自行根据 `dataKey` 解析 `DataView`。
4. 渲染时：
   - 若 `dataSource.rows` 已有数据 → 直接渲染；
   - 若 `rows` 为空且 `dataSource.loadFromServer` 可用 → `RendererTable/RendererTree` 在 `mounted` 调用 `loadFromServer()`（视图主动加载）。
5. 脚本/交互加载：推荐调用 `DataView.loadFromServer()`；如需依赖协调则调用 `DataSet.requestTableData()`。
6. 关系联动：`DataView.setupCascade()` 根据 `autoLoad` 决定是否触发子视图 `loadFromServer()`。
7. 状态传播：`DataView.updateFromServer()` → `events.emit('stateChanged')`。

## 5. API 使用样例（推荐） ✨
- 视图主动加载（推荐）

```ts
const usersView = dataSet.getView('Users', 'default')
await usersView.loadFromServer({ page: 1 })
```

- 依赖调度（DataLoader 路径）

```ts
dataSet.requestTableData('OrderItems') // 非阻塞，DataLoader 会按依赖加载
```

- 通过 `DataView.loadFromServer()` 加载数据

```ts
const view = dataSet.getView('Users', 'default')
await view.loadFromServer({ page: 1 })
```

## 6. 渲染器行为要点（注意） ⚠️
- `RendererTable` / `RendererTree` 只信任 `props.dataSource`（`DataView` / `IDataSource`）。
- 当 `props.dataSource.rows` 为空时，组件会调用 `dataSource.loadFromServer()`（不直接调用 `DataLoader`）。
- 表的 `currentChange` / `selectionChange` 由 `RendererTable` 直接同步回 `DataView.selection`。

## 6.1 r-table 统一过滤器（列即过滤项）
- `r-table` 支持在表级容器直接声明 `filterColumns`，只写要过滤的列名即可。
- 过滤项直接复用同名列配置，不需要再维护单独的 filter schema。
- 远端表：过滤值会同步到 `DataView.filterExpression` 并触发 `refresh()`。
- 内联数据表：容器会按同一份过滤表达式做本地过滤。

示例：

```json
{
  "type": "r-table",
  "dataKey": "Users@rows",
  "props": {
    "border": true,
    "highlightCurrentRow": true,
    "filterColumns": ["name", "status", "score", "createdAt"],
    "filterGridColumns": 24,
    "filterGridGap": 12
  },
  "children": [
    {
      "type": "r-text",
      "name": "name",
      "props": { "label": "姓名" }
    },
    {
      "type": "r-multi-select",
      "name": "status",
      "props": {
        "label": "状态",
        "options": [
          { "label": "草稿", "value": "draft" },
          { "label": "完成", "value": "done" },
          { "label": "归档", "value": "archived" }
        ]
      }
    },
    {
      "type": "r-number",
      "name": "score",
      "props": {
        "label": "分数",
        "filterMode": "range"
      }
    },
    {
      "type": "r-date",
      "name": "createdAt",
      "props": {
        "label": "创建日期",
        "filterMode": "range"
      }
    }
  ]
}
```

默认操作符推断：
- `r-text` → `contains`
- `r-multi-select` → `in`
- `r-number` + `filterMode: "range"` → `between`
- `r-date` + `filterMode: "range"` → `between`
- 其他类型默认 `==`

需要覆盖默认行为时，可在列配置上显式声明：

```json
{
  "type": "r-text",
  "name": "code",
  "props": {
    "label": "编码",
    "filterOp": "startsWith"
  }
}
```

## 7. 关系自动加载（autoLoad）
- 在 `relations` 中设置 `autoLoad: true`，当父视图有数据时，`RelationEngine` 会触发子视图的 `loadFromServer()`。
- 如果希望 DataSet 统一协调（例如预取根视图）使用 `dataSet.requestTableData()`。

## 8. 调试清单（遇到问题先查） 🔎
- 确认 `props.dataSource` 是否为 `DataView` 且 `typeof dataSource.loadFromServer === 'function'`。
- 若 UI 未触发加载：检查 `dataSource.rows` 是否为空、`loadFromServer()` 是否可用。
- 关系加载失败：检查 `setupCascade()` 配置与 `parent` 状态、`events.emit('stateChanged')` 是否发出。
- 查日志：`Logger('DataView'|'DataLoader'|'PageRenderer')`。

## 9. 单元测试要点 ✔️
- `DataView.loadFromServer()` 更新 `rows/total/page` 并通过 `events.emit('stateChanged')` 通知。
- `dataKey(rows)` → 容器组件解析为 `DataView` / `IDataSource`（见 `tests/renderer-table.datasource.test.ts`）。
- 渲染器：当 `dataSource.rows` 为空时，应调用 `loadFromServer()`（已覆盖在 `tests/renderer-table.datasource.test.ts`）。
- 级联联动：父变更应触发子 `loadFromServer()`（当 `autoLoad` 为 true）。

## 10. 迁移与最佳实践 ✅
- 全面迁移到 `props.dataSource`（表/树），移除 `props.data` 作为表数据源的用法。
- 优先调用 `DataView.loadFromServer()`（视图主动）；仅在需要依赖协调时使用 `DataSet.requestTableData()`。
- 保持 `DataView` 响应式并结构兼容 `IDataSource`。

---

## 参考代码位置（快速跳转）
- Data 层： `packages/spark-data/src/data-view.ts`、`data-table.ts`、`dataset.ts`
- 级联 / 加载： `packages/spark-data/src/data-view.ts`（`setupCascade` / `respondToParentChange`）
- 绑定 / 渲染： `packages/spark-component/src/renderer/SparkComponentRenderer.vue`、`packages/spark-component/src/renderer/containers/RendererTable.vue`
- 初始化： `packages/spark-component/src/renderer/usePageDataSet.ts`
- 测试： `tests/renderer-table.datasource.test.ts`、`tests/spark-component-renderer.test.ts`

---

如果你要我把这份文档：
- 提交为 MR（我可以帮你准备 PR 描述），或
- 把文中例子补到 `docs/guides/DATA_MANAGEMENT.md` 中，
告诉我下一步。