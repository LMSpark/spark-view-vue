# @spark-view/spark-page-config

## 0.5.0

### Breaking Changes

- 将包定位提升为软件项目模型：根入口导出 `ProjectModel`、PageNode factory 和节点模型类型。
- 移除旧 `./editor` 子路径，设计态入口统一为 `@spark-view/spark-page-config/project`。
- 移除旧 `PageNavigationTools` 命名，项目节点树工具统一为 `ProjectNodeTools`。
- 不再承诺旧 `config`、`navigation`、`design`、`runtime`、`page/*` 子路径兼容。

### Minor Changes

- 新增 `ProjectPlanningModel`：支持项目策划、模块策划、页面策划和子页面策划。
- 新增 `ProjectNodeCollection`：以 DB 同构 flat nodes 作为 SSOT，并按需投影为树。
- `page` / `sub-page` 合并为 `ProjectConfigPageNodeModel`；Vue 页面由 `ProjectVuePageNodeModel` 表达。
- 新增 `ProjectReferenceClient`：跨项目读取项目摘要和可引用页面，供 DevSystem 通过模型包访问后端。
- `ProjectEditor` 现在显式接收 `projectId`，内部组合 `ProjectModel.nodes`、策划模型和配置页节点缓存。
- `ProjectEditor.readSnapshot()` 输出 `projectPlanning` 和 `pageFeatures`，消费层不再自行从导航树拼页面清单。

### Design Notes

- 节点 `description` 是功能描述和用户需求的单一真源。
- 父级与本级 `description` 会形成 `requirementConstraints` / `effectiveUserRequirement`。
- 项目节点树规则固定为：项目/模块下可放模块或页面；页面/子页面下只能放子页面。
- 四文件创建、删除、版本、缓存继续由 `PageNodeFileCreator`、`PageNodeFileDeleter`、`PageNodeFileVersions`、`PageNodeFileCache` 分别负责。

## 0.4.0

### Minor Changes

- 新增设计态编辑聚合入口 `ProjectEditor`，组合导航属性、节点属性、rule.json、pagedata.json、style.css、script.js、版本管理、保存、页面挂载、删除和移动能力。
- `ProjectEditor` 提供页面生命周期委托入口：`createPageForSelectedNode()`、`createMountedPage()`、`removeMountedPage()`。
- `ProjectEditor` 新增 `notifyPageFileChanged()`，作为 SSE 事件驱动的缓存失效入口。
- DevSystem `useDevState` 重构为 `ProjectEditor` adapter。
- DevSystem `DevDataSetDesigner` 写操作改为 `state.editDataSet()` 模式。

## 0.3.1

### Patch Changes

- Updated dependencies.
