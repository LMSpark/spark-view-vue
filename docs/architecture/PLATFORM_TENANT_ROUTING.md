# 平台、租户、项目与节点路由

> 当前口径：SPARK AppWorks 以项目为业务应用边界。每个项目都有自己的项目节点树、多个 `PageNode`、数据表、权限和运行时路由。后端 API 仍保留 `navigation` 命名，但在领域模型里它是项目节点树。

## 实体层级

```text
平台
  └── 租户 tenantId
        └── 项目 projectId
              ├── ProjectModel
              │     ├── nodes
              │     ├── planning
              │     └── config page cache
              ├── 后端 DB
              └── 页面四文件存储
```

一个租户可以有多个项目。`homepage` 是系统保留项目，用于承载企业管理平台和应用生命周期管理；用户创建的业务应用也是项目，和 `homepage` 使用同一套模型。

## homepage 与业务项目

| 项目 | 角色 | 技术地位 |
|---|---|---|
| `homepage` | 企业管理平台，负责创建、删除、停用、查看业务项目 | 普通项目模型 + 系统保留职责 |
| `app` 项目 | 业务应用，承载自己的模块、页面、数据和权限 | 普通项目模型 |

`homepage` 不直接代管业务项目内部页面。每个项目都有自己的项目节点集合和自管理入口。

## 项目节点树

```text
项目 => 子模块 || 页面
子模块 => 子模块 || 页面
页面 => 子页面 => 子页面
```

项目节点树同时承担：

- 项目内模块结构。
- 页面入口结构。
- 路由派生来源。
- 页面功能策划来源。
- 权限、上下文、跨项目引用等页面入口配置。

节点 `description` 是功能描述和用户需求。父级与本级描述会共同约束当前模块或页面。

## 项目策划

```text
项目策划 = 模块策划 + 页面策划
模块策划 = 所属模块下的全子模块 + 页面 + 子页面策划
页面策划 = 页面下的全子页面策划
```

项目策划事实由 `ProjectModel.design` 与 `ProjectEditor.readSnapshot().pageFeatures` 承载。DevSystem 和 AI 生成页面时读取 `pageFeatures`，不自行从菜单节点拼接需求。

## 后端 API

作用域 API 显式包含 tenantId 和 projectId：

```text
/api/tenants/{tenantId}/projects/{projectId}/navigation
/api/tenants/{tenantId}/projects/{projectId}/pages-config
/api/tenants/{tenantId}/projects/{projectId}/data
```

语义对应：

| API | 领域语义 |
|---|---|
| `/navigation` | 项目节点树 |
| `/pages-config` | 页面四文件 |
| `/data` | 项目数据表和业务数据 |

页面文件兼容路由仍可从 Header 推断作用域：

```text
/api/pages-config/*
X-Tenant-Id
X-Project-Id
```

新代码优先使用显式作用域 API 或由 `createProjectEditor()` 注入的 API 函数。

## 前端上下文

登录后前端持有：

```text
tenantId
defaultProjectId
```

`src/services/api-paths.ts` 根据当前用户生成：

```text
getNavApi()                  => 当前项目节点树 API
getProjectNavigationApi(id)  => 指定项目节点树 API
getPageApi()                 => 当前项目页面四文件 API
getProjectApi()              => 项目列表 API
getDataApi()                 => 当前项目数据 API
```

DevSystem 把这些函数注入 `createProjectEditor()`，之后所有项目模型读写都通过 `spark-project-model/project`。

## 路由派生

```text
项目节点树
  -> page / sub-page 节点
  -> pageId
  -> DynamicRouter
  -> SparkPageRenderer
  -> PageNode.load()
```

路由只负责把用户带到页面；页面内容仍由 `PageNode` 加载并投影。模块节点不直接渲染页面，除非它被显式转为页面节点。

## 项目切换

```text
切换 defaultProjectId
  -> API 路径切换到目标项目
  -> 重新加载项目节点树
  -> 重新注册动态路由
  -> DevSystem 重新创建或刷新 ProjectEditor
```

项目切换不是简单菜单切换，而是整个 `ProjectModel` 作用域切换。

## 关键约束

1. 项目是业务应用边界。
2. 一个项目由平铺项目节点集合组成，页面节点是其中一种节点类型。
3. 项目节点树即项目内模块树，不只是导航菜单。
4. 节点 `description` 是功能描述和用户需求。
5. `homepage` 是系统保留项目，不是技术上的上帝层。
6. DevSystem 是项目内自管理工具，只通过 `spark-project-model/project` 连接后端。
7. 后端存储可以是 DB + file，但模型包保持纯模型，不绑定存储实现。
8. 旧 `navigation` API 命名只能作为传输命名，不能反向污染领域模型。
