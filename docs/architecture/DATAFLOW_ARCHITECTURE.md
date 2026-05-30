# SPARK 数据流架构

> 当前数据流从项目需求开始，经项目节点集合与页面节点模型进入稳定渲染运行时。四文件、navigation API 和 Vue 组件都是投影或消费层，不是理念入口。

## 主链路

```text
项目需求
  -> ProjectModel
  -> ProjectNodeCollection（flat rows，DB 同构）
  -> ProjectPlanningModel（模块策划 + 页面策划）
  -> ProjectConfigPageNodeModel（page/sub-page 同类）
  -> PageNodeRenderConfig
  -> SparkPageRenderer
  -> DataSet / SparkNodeTree / script / style
  -> UI
```

## 项目节点集合

`ProjectNodeCollection` 是项目节点 SSOT。它保存平铺节点，字段与后端 DB 的节点行一致；`root`、`children`、导航树只是为了 UI、路由和策划遍历生成的树形投影。

```text
flat node
  id
  pid
  title
  description
  nodeKind
  path
  icon
  ...
```

父子规则：

```text
项目 => 子模块 || 页面
子模块 => 子模块 || 页面
页面 => 子页面 => 子页面
```

## 页面节点

配置页节点只有一个模型类：

```text
ProjectConfigPageNodeModel
  nodeKind = page | sub-page
  rule
  dataSet
  script
  style
```

`navigation` 属于 `ProjectNodeModel` 基类；`ProjectConfigPageNodeModel` 只扩展配置页内容子模型。`sub-page` 不再有单独模型。Vue 页面走 `ProjectVuePageNodeModel`，只保存项目节点事实和组件路径，不承载四文件。

## 功能约束

每个节点的 `description` 是用户需求。生成某个页面时，父级和本级描述共同形成约束：

```text
effectiveUserRequirement =
  project.description
  + parent module descriptions
  + parent page descriptions
  + current node.description
```

消费层统一读取 `ProjectPlanningModel` 或 `ProjectEditor.readSnapshot().pageFeatures`，不要自行拼约束链。

## 运行态

```mermaid
sequenceDiagram
  participant Router as Router
  participant Factory as PageNodeFactory
  participant Node as PageNode
  participant Renderer as SparkPageRenderer
  participant Data as DataSet
  participant Tree as SparkNodeTree

  Router->>Factory: create(pageId)
  Factory-->>Router: PageNodeLike
  Router->>Renderer: pageNode
  Renderer->>Node: load()
  Node-->>Renderer: toRenderConfig()
  Renderer->>Data: init DataSet
  Renderer->>Tree: build children from rule
```

运行态边界：

- Router 只创建 `PageNodeLike`。
- Renderer 只消费 `PageNodeRenderConfig`。
- Loader、compiler、file-api、版本和导航 client 不进入 App/Renderer。
- 缺少必需四文件或配置非法时 fail-fast。

## 设计态

```text
DevSystem
  -> createProjectEditor()
  -> ProjectEditor
      -> ProjectModel.nodes
      -> ProjectModel.planning
      -> ProjectConfigPageNodeModel
      -> 后端 DB + file
```

DevSystem 是消费层。它可以传入 HTTP、API path、认证头，但不能直接绕过 `ProjectEditor` 操作 DB 节点、页面文件、版本或跨项目引用。

## AI

```text
AI Host
  -> ensurePageDesignBusiness()
  -> PageDesignService
  -> ProjectEditor.createPageDesignEditHost({ pageId })
  -> 配置页节点子模型
```

AI 写入只进入内存 PageNode 并标 dirty。保存、版本、路由刷新和发布由显式用户动作触发。

## DataSet / DataView

`pagedata.json` 进入 `ProjectConfigPageNodeModel.dataSet`，再由 Renderer 初始化 `DataSet`。组件读取必须走：

```text
dataViewKey + dataMember + dataField
```

`dataViewKey` 只定位视图：

```text
Users@grid
#scope@Users@grid
```

不要使用旧的成员拼接键、点号数据路径、`pageData` 或 `$data` 旁路。

## 不变约束

1. `spark-page-config` 保持纯模型。
2. 项目节点集合是 flat SSOT，树是投影。
3. `page` 和 `sub-page` 合并为同一配置页节点模型。
4. Vue 页面是项目节点子类，不反向决定数据结构。
5. 四文件是 PageNode 内容投影，不是最高事实源。
6. DataSet 管线单向：`pagedata.json -> DataSet -> DataViewKey -> DataView -> UI`。
