# 统一模型重构计划（修订版）

> 执行状态与阶段划分见本文。架构契约详见 [`src/MODEL-HIERARCHY.md`](../src/MODEL-HIERARCHY.md)、[`AGENTS.md`](../AGENTS.md)。

## 核心原则

**设计即编辑** — 改导航、改页面、选中、dirty、保存是同一语义。

**DevSystem 定位** — 当前登录项目（`defaultProjectId`）的导航设计 UI，不是独立文件系统。

**模型与实例三层**（勿混用「模型实例」指代 `ProjectEditor`）：

| 层 | 是什么 | 在哪 |
|---|---|---|
| 模型（类型） | `ProjectModel`、`ProjectEditor` 等 class | `spark-project-model` 包 |
| 领域实例 | `editor.project`（design + runtime 真源） | 门面内部 |
| 门面实例 | `getAppProjectEditor()` 返回的 `ProjectEditor` | APP `project-editor-host.ts` |

## 阶段 0：已完成基线

- 包分层：`model/` / `facade/` / `io/`
- `ingestNavigationRoot`、`ConfigPageNode` 四文件 API
- APP 门面宿主 + DevSystem 直扑 `state.editor.*`
- 设计器制品：`src/services/project-model-artifacts/`

## 阶段 1：文档与术语（本文 + MODEL-HIERARCHY）

- 统一「门面实例 / 领域实例 / 模型类型」
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

## 阶段 5：包内演进（持续）

- `ConfigSubPageNode`、`VueComponentPageNode`、`SystemDirectoryNode` 等按 `nodeKind` 子类
- `PageDesignSurface` + `resolvePageDesignSurface`；`pageList` 含 config-files 与 vue-component
- `ProjectRuntime.findOpenPage` / `findOpenDataSet` / `findRenderConfig` / `readPageRuntimeStats`
- `ProjectModel.root` deprecated 别名已清理

## 明确不做

- 运行时 `useNavigation` 直接读 dirty 的 `editor.project`
- `spark-project-model` 包内 APP 单例或 Vue 依赖
- 恢复 DevSystem 平行文件层

## 验证

```bash
pnpm --filter @spark-appworks/spark-project-model run typecheck
pnpm --filter @spark-appworks/spark-project-model run test:run
npx vitest run tests/dev/
```
