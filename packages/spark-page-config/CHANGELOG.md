# @spark-view/spark-page-config

## 0.4.0

### Minor Changes

- 新增 `./editor` 子路径，导出 `PageEditor`：框架无关的页面编辑聚合入口，组合导航属性、节点属性、rule.json、pagedata.json、style.css、script.js、版本管理、保存、页面挂载/删除/移动能力，为 DevSystem 编辑器提供统一中后端。
- `PageEditor` 提供页面生命周期委托入口：通过 `createPageForSelectedNode()`、`createMountedPage()`、`removeMountedPage()` 等方法统一编排页面文件与导航挂载，不向调用方暴露裸文件创建/删除流程。
- `PageEditor` 新增 `notifyPageFileChanged` 方法：SSE 事件驱动的缓存失效入口。
- DevSystem `useDevState` 重构为 `PageEditor` adapter：不再直接持有 `PageConfigEditWorkspace`、`PageConfigFileLifecycle`、`NavigationEditSession`，统一委托 `PageEditor`。
- DevSystem `DevDataSetDesigner` 写操作改为 `state.editDataSet()` 模式。

## 0.3.1

### Patch Changes

- Updated dependencies [5894e41]
  - @spark-view/spark-data@0.4.0
