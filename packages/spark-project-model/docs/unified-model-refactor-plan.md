# 统一模型重构计划（修订版）

> 执行状态与阶段划分见本文。架构契约详见 [`src/MODEL-HIERARCHY.md`](../src/MODEL-HIERARCHY.md)、[`src/STRUCTURE.md`](../src/STRUCTURE.md)、[`AGENTS.md`](../AGENTS.md)。
>
> **最近更新（2026-06）**：阶段 5 包内演进主体已完成，含模型与实例分离、`PageContentRepository`、纯领域 `ConfigPageNode`。

## 核心原则

**设计即编辑** — 改导航、改页面、选中、dirty、保存是同一语义。

**DevSystem 定位** — 当前登录项目（`defaultProjectId`）的导航设计 UI，不是独立文件系统。

**模型与实例三层**（勿混用「模型实例」指代 `ProjectEditor`）：

| 层 | 是什么 | 在哪 |
|---|---|---|
| 模型（类型） | `ProjectModel`、`ProjectEditor`、`ConfigPageNode` 等 class | `spark-project-model` 包 |
| 领域实例 | `createBareProjectModel()` / `editor.project`（design + runtime 真源） | 组合根或门面内 |
| 门面实例 | `getAppProjectEditor()` 返回的 `ProjectEditor` | APP `project-editor-host.ts` |

**持久化与领域分离**（阶段 5 已落地）：

| 组件 | 职责 |
|---|---|
| `ConfigPageNode` / content class | 纯内存：rule / pagedata / script / style |
| `PageContentRepository` | 四文件 load/save/版本/资产 CRUD（`io/`） |
| `LoadedPageNode` | 渲染管线 `PageNodeLike`（`factory/`） |
| `ProjectEditor` | 门面编排 + `EditorSession` + repository 装配 |

## 阶段 0：已完成 ✅

- 包分层：`model/` / `facade/` / `io/` / `factory/`
- `ingestNavigationRoot`、`ConfigPageNode` 四文件领域模型
- APP 门面宿主 + DevSystem 直扑 `state.editor.*`
- 设计器制品：`src/services/project-model-artifacts/`

## 阶段 1：文档与术语 ✅

- 统一「门面实例 / 领域实例 / 模型类型」（`MODEL-HIERARCHY.md`）
- `STRUCTURE.md` / `AGENTS.md` 与源码目录对齐
- 删除 `dev-system-project-editor.ts` 废弃入口

## 阶段 2：导航同步收敛

**问题**：DynamicRouter、`App.vue` `_navRoot`、`editor.project` 三份投影；DevSystem 保存后壳层侧栏漂移；保存路径双次 HTTP GET。

**目标**：`reloadAndSyncNavigation()` — 单次 `refreshRoutes` → fan-out 到 router + `ingestNavigationRoot` + `_navRoot`。

**实现**：[`src/services/navigation-sync.ts`](../../../src/services/navigation-sync.ts)

**原则**：运行时 `useNavigation` 只读已提交导航（`getNavTree()`）；DevSystem 读 `readSnapshot()`；`spark-app` 不依赖 APP 门面单例。

## 阶段 3：DevSystem 残余平行状态

- `contextEdit` proxy 替代 `contextItems` / `contextConfig` / `syncContextToNav`
- `pageDataError` ← `readSnapshot().parseErrors`
- 测试种子走 `ingestNavigationRoot`
- `treeData` / `pageList` / `selectedNode` / `navEmpty` / `activePageId` 改为 `readSnapshot()` computed 投影（`useDevState`）

## 阶段 4：AI 门面策略

| 场景 | 实例 |
|---|---|
| DevSystem 面板内 AI | `getAppProjectEditor()`（`useAppSingleton: true`） |
| 隔离式 Host Run / SSE | headless 注册表（[`page-design-editor-provider.ts`](../../../src/services/page-design-editor-provider.ts) + [`page-design-host-run-provider.ts`](../../../src/services/page-design-host-run-provider.ts)） |

## 阶段 5：包内演进 ✅（主体完成）

### 5.1 模型与实例分离 ✅

| 项 | 状态 | 说明 |
|---|---|---|
| `ProjectModelIoPorts` | ✅ | 端口类型留在 `model/project/ports.ts`；不注入 `ProjectModel` |
| `createBareProjectModel` | ✅ | 唯一领域实例工厂；已移除 `createProjectModel*` 别名 |
| `ConfigPageNode` 去 IO | ✅ | 无 `load`/`save`/`createFiles`；`hydrateFileText` / `markLoaded` / `markFileSaved` |
| content class 去 IO | ✅ | `PageRuleFile` 等仅 `loadText` / `setText` / `markSaved` |
| `PageContentRepository` | ✅ | `io/page-content-repository.ts`；门面 `PageFileEditor` / `PageLifecycle` 委托 |
| `LoadedPageNode` | ✅ | `PageNodeFactory.create()` 产出；`spark-component` 渲染 `load()` 不变 |
| 测试 | ✅ | `page-content-repository.test.ts`、`loaded-page-node.test.ts`、`project-model-pure.test.ts`（72 tests） |

### 5.2 按 `nodeKind` 子类 ✅

| nodeKind | class | 状态 |
|---|---|---|
| `module` | `ModuleNode` | ✅ |
| `system-directory` | `SystemDirectoryNode` | ✅ |
| `link` | `LinkNode` | ✅ |
| `ref` | `RefNode` | ✅ |
| `system-page` | `VueComponentPageNode` | ✅ |
| `system-action` | `SystemActionNode` | ✅ |
| `page` | `ConfigPageNode` | ✅ |
| `sub-page` | `ConfigSubPageNode`（`isSubPage`、`toSummary`） | ✅ |

工厂：`createProjectNodeModel` → `navigation/factory.ts`；非配置页 → `navigation/kinds.ts`。

### 5.3 设计表面与运行投影 ✅

- `PageDesignSurface` + `resolvePageDesignSurface`（config-files / vue-component / link / ref / none）
- `ProjectRuntime`：`findOpenPage` / `findLoadedPage` / `findRenderConfig` / `findOpenDataSet` / `readPageRuntimeStats` / `listLoadedPages` / `collectRenderConfigs`
- `ProjectModel.root` deprecated 别名已清理（使用 `design.rootNode` / `navigationRoot`）

### 5.4 待续（可选，非阻塞）

- `LinkNode` / `RefNode` 等领域专属行为（若 DevSystem 需更多节点级 API）
- ✅ 从 `@spark-appworks/spark-project-model/project` 导出 `PageContentRepository`（headless 脚本直连）
- 阶段 2–4 APP 层项的持续验收与回归

## 明确不做

- 运行时 `useNavigation` 直接读 dirty 的 `editor.project`
- `spark-project-model` 包内 APP 单例或 Vue 依赖
- 恢复 DevSystem 平行文件层
- 在 `ConfigPageNode` 上恢复 `load`/`save` 等 IO 方法

## 验证

```bash
pnpm --filter @spark-appworks/spark-project-model run typecheck
pnpm --filter @spark-appworks/spark-project-model run test:run
npx vitest run tests/dev/
npx vitest run tests/auth-nav/cross-project-ref-page.test.ts
```

## 快速入口（阶段 5 后）

```text
@spark-appworks/spark-project-model
  ProjectModel.create / createBareProjectModel   ← 纯领域实例
  ConfigPageNode / ConfigSubPageNode             ← 页面设计（无 IO）
  ProjectRuntime                                 ← 运行投影查询

@spark-appworks/spark-project-model/project
  createProjectEditor                            ← 门面 + repository 装配

稳定出口（允许跨包消费）
  PageContentRepository                          ← 四文件持久化（IO 适配）

包内（勿跨包 import）
  io/*                                           ← 细节实现（不要跨包引用）
  factory/LoadedPageNode + PageNodeFactory       ← 渲染加载
```
