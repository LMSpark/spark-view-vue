# 配置系统

SPARK 配置分两层：

- 应用启动配置：属于 `spark-app`，描述租户、认证、插件、主题、路由启动参数。
- 项目节点配置：属于 `spark-project-model`，描述项目、模块、页面、子页面和页面内容。

## 项目节点配置

```text
ProjectModel
  └── design: ProjectDesign
        ├── navigation: NavigationDesign  # 节点树 + 平铺索引
        └── ConfigPageNode
              ├── PageDesign (rule / dataSet / script / style)
              └── 持久化 → rule.json / pagedata.json / script.js / style.css
```

后端 API 仍叫 `navigation`，但模型层用 `NavigationDesign` 组织节点；内存可为树与索引，落盘映射到 DB 平铺行。

## 节点描述

每个节点的 `description` 是功能描述和用户需求。页面生成时使用：

```text
project.description
  + parent descriptions
  + current node.description
```

消费层统一读取 `ProjectEditor.readSnapshot().pageFeatures`（或等价的 `ProjectModel` 设计投影），不要自行拼约束链。

## 运行态配置

应用启动时使用 `pageNode` 配置：

```ts
SparkApp.start({
  rootComponent: App,
  pageNode: {
    apiBaseUrl: '/api',
    pagesConfigBaseUrl: '/api/pages-config',
  },
})
```

运行态由 `PageNodeFactory` 创建 `PageNodeLike`，再交给 `SparkPageRenderer`。

## 脚本边界

`script.js` 是 PageNode 的文本子模型，不是任意前端代码入口。

允许全局变量：`$page`、`$route`、`$dataSet`、`$query`、`SparkData`、`h`。

禁止：`$data`、ESM `import`、`window.xxx`、直接导入 Vue Router 或 Element Plus。

## 后端边界

```text
/api/tenants/{tenantId}/projects/{projectId}/navigation
/api/tenants/{tenantId}/projects/{projectId}/pages-config
```

`navigation` 持久化项目节点；`pages-config` 持久化配置页四文件。模型包不绑定 DB 或 file 的具体实现。
