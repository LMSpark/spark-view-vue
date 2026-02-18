# 数据加载与绑定 — 完整指南

快速概览：页面配置 → DataSet 初始化 → DataView（视图）为数据单元 → 渲染器通过 `props.dataSource` 绑定 `DataView` → `DataView`/`RelationEngine`/`DataLoader` 协同完成加载与依赖自动触发。

---

## 1. 设计目标 🎯
- 明确职责：
  - `DataTable` 只负责结构与配置；
  - `DataView` 是数据拥有者（实现 `IDataSource`、响应式、并对外提供 `loadFromServer()` / CRUD）；
  - `DataLoader` 负责依赖协调与按需后台加载（由 `DataSet.requestTableData()` 驱动）。
- 渲染层仅依赖 `IDataSource`（通过 `props.dataSource`），不直接触发 `DataLoader`。

## 2. 关键角色与职责（速查） 🔧
- `DataSet` — 管理表、关系、提供 `requestTableData()`。
- `DataTable` — 表结构、视图容器（不持有运行时数据）。
- `DataView` — 视图级数据（实现 `IDataSource`），提供 `loadFromServer()`、CRUD、订阅/事件（stateChanged）。
- `RelationEngine` — 视图间联动（父变更 → 子视图自行处理/加载）。
- `DataLoader` — 后台依赖加载器（由 `DataSet` 协调使用）。
- 渲染器（`RendererTable` / `RendererTree`）— 仅接收 `props.dataSource`（若空则调用 `dataSource.loadFromServer()`）。

## 3. DataKey 与绑定规则 🔗
- 规范格式：`scope@tableName@viewId@field`（工具：`isDataKey()` / `parseDataKey()` / `resolveDataKey()`）。
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
3. 规则绑定：`bindRules.ts` 将 `dataKey`/`dataSource` 注入 `props.dataSource`（`DataView`）。
4. 渲染时：
   - 若 `dataSource.rows` 已有数据 → 直接渲染；
   - 若 `rows` 为空且 `dataSource.loadFromServer` 可用 → `RendererTable/RendererTree` 在 `mounted` 调用 `loadFromServer()`（视图主动加载）。
5. 脚本/交互加载：推荐调用 `DataView.loadFromServer()`；如需依赖协调则调用 `DataSet.requestTableData()`（由 `DataLoader` 管理）。
6. 关系联动：`RelationEngine` 根据 `autoLoad` 决定是否触发子视图 `loadFromServer()`。
7. 状态传播：`DataView.updateFromServer()` → `notifySubscribers()` + `events.emit('stateChanged')`。

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

- page 脚本注入 dataLoader

```js
dataSet.dataLoader = async (tableName) => api.fetchRows(tableName)
```

## 6. 渲染器行为要点（注意） ⚠️
- `RendererTable` / `RendererTree` 只信任 `props.dataSource`（`DataView` / `IDataSource`）。
- 当 `props.dataSource.rows` 为空时，组件会调用 `dataSource.loadFromServer()`（不直接调用 `DataLoader`）。
- 表的 `currentChange` / `selectionChange` 由 `bindRules.injectTableEvents()` 注入并同步回 `DataView`（调用 `setCurrentRow()` / `setSelectedRows()`）。

## 7. 关系自动加载（autoLoad）
- 在 `relations` 中设置 `autoLoad: true`，当父视图有数据时，`RelationEngine` 会触发子视图的 `loadFromServer()`。
- 如果希望 DataSet 统一协调（例如预取根视图）使用 `dataSet.requestTableData()`。

## 8. 调试清单（遇到问题先查） 🔎
- 确认 `props.dataSource` 是否为 `DataView` 且 `typeof dataSource.loadFromServer === 'function'`。
- 若 UI 未触发加载：检查 `dataSource.rows` 是否为空、`dataLoader` 是否注入到 `DataSet`（仅用于 `DataLoader` 路径）。
- 关系加载失败：检查 `relations[].autoLoad` 与 `parent` 状态、`events('stateChanged')` 是否发出。
- 查日志：`Logger('DataView'|'DataLoader'|'PageRenderer')`。

## 9. 单元测试要点 ✔️
- `DataView.loadFromServer()` 更新 `rows/total/page` 并调用 `notifySubscribers()`。
- `dataKey(rows)` → `props.dataSource` 注入为 `DataView`（见 `tests/bindRules.test.ts`）。
- 渲染器：当 `dataSource.rows` 为空时，应调用 `loadFromServer()`（已覆盖在 `tests/renderer-table.datasource.test.ts`）。
- 关系引擎：父变更应触发子 `loadFromServer()`（当 `autoLoad` 为 true）。

## 10. 迁移与最佳实践 ✅
- 全面迁移到 `props.dataSource`（表/树），移除 `props.data` 作为表数据源的用法。
- 优先调用 `DataView.loadFromServer()`（视图主动）；仅在需要依赖协调时使用 `DataSet.requestTableData()`。
- 保持 `DataView` 响应式并实现 `IDataSource`。

---

## 参考代码位置（快速跳转）
- Data 层： `packages/spark-data/src/data-view.ts`、`data-table.ts`、`dataset.ts`
- 关系 / 加载： `packages/spark-data/src/core/relation-engine.ts`、`packages/spark-data/src/core/data-loader.ts`
- 绑定 / 渲染： `packages/spark-renderer/src/utils/bindRules.ts`、`packages/spark-renderer/src/components/containers/RendererTable.vue`
- 初始化： `packages/spark-renderer/src/composables/usePageDataSet.ts`
- 测试： `tests/renderer-table.datasource.test.ts`、`tests/bindRules.test.ts`

---

如果你要我把这份文档：
- 提交为 MR（我可以帮你准备 PR 描述），或
- 把文中例子补到 `docs/guides/DATA_MANAGEMENT.md` 中，
告诉我下一步。