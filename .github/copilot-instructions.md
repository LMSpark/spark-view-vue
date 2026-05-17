# SPARK 工作区说明

用途：为 AI 编码代理提供仓库级默认规则。本文档保持简短、可执行、以链接为主；已有详细说明时优先链接到文档，不在这里重复展开。

## 快速开始

- 运行时：Node >= 20，pnpm >= 10。仅在 Java 后端工作、运行 `pnpm run dev` 或完整构建时需要 JDK 17+。
- 常用命令：
  - `pnpm run dev` — 全栈启动：Java 后端 + Vite 前端
  - `pnpm run dev:fe` — 仅前端
  - `pnpm run build` — 完整流水线
  - `pnpm run build:check` — 目录生成 + 类型检查 + 前端构建
  - `pnpm run typecheck`
  - `pnpm run lint`
  - `pnpm run test` or `pnpm run test -- -t "name"`
  - `cd spark-ai-server && mvn test` — 后端测试
- Husky pre-commit 会运行 `lint` + `typecheck`。
- Commit scope 仅允许： `deps`, `docs`, `scripts`, `spark-data`, `spark-app`, `spark-ai`, `spark-component`, `spark-utils`, `spark-page-config`.

## 仓库地图

- `packages/spark-utils` — 纯 TypeScript 基础能力：capability key、logger、HTTP、sandbox helpers。
- `packages/spark-data` — 纯 TypeScript 数据空间：`DataSet`、`DataTable`、`DataView`、`TreeManager`、DataViewKey 辅助工具。
- `packages/spark-page-config` — 纯 TypeScript 页面配置解析、脚本上下文类型、配置加载。
- `packages/spark-component` — Vue 渲染器、组件注册表、能力接线、规则绑定。
- `packages/spark-app` — 应用壳、路由、认证、插件、启动引导。
- `spark-ai-server` — AI 聊天、页面配置持久化、scope API 和 SSE 调试流的 Spring Boot 后端。
- 运行中的页面配置保存在 `spark-ai-server/data/pages-config/`。新工作不要把 `public/pages-config/` 当作真源。

高价值入口：

- `packages/spark-component/src/core/useSparkComponent.ts`
- `packages/spark-component/src/page/usePageDataSet.ts`
- `packages/spark-component/src/page/binding/bindRules.ts`
- `packages/spark-component/src/components/SparkComponentRenderer.vue`
- `packages/spark-data/src/core/data-view-key.ts`
- `packages/spark-utils/src/capability.ts`

## 不可协商规则

- **UI 组装强制 SOP**（AI Tool 调用规范）：
  1. 需要构造组件时，先调用 `queryPayloads({})` 或 `queryPayloads({ category: 'container' })` / `queryPayloads({ keyword: '...' })` 查全量/分类/关键词参数荷载列表。
  2. 选定组件类型（如 r-table）后，必定调用 `guidePayload({ key: 'r-table' })` 拉取该型 SparkNode JSON Schema (配置规格)。
  3. 基于拉取到的合法规格在本地拼接 SparkNode (`{ type, props, children }`)。
  4. 最后调用 `pageDesign@nodeTree@addNode` 或 `pageDesign@nodeTree@addNodes` 实施写入。**绝对禁止不看 specs 凭空构造 props！**
- 配置优先：优先使用 `rule.json`、`pagedata.json`、view metadata 和现有渲染器能力。只有配置无法表达行为时才使用 `script.js`。
- DataSet 管线单向： `pagedata.json` -> `parsePageData()` -> `DataSet` -> `usePageDataSet()` -> `PAGE_DATASET` -> `dataViewKey + dataMember + dataField` -> `DataView` -> UI. 不要重新引入渲染器侧 raw JSON 归一化、`pageData` 或 `$data` 旁路。
- `clearDataSet()` 只释放引用。绝不要在其中调用 `DataSet.destroy()`，因为 DataSet 实例会跨导航缓存复用。
- 包边界严格且必须保持无环： `spark-utils` <- `spark-data` <- `spark-page-config` <- `spark-component` <- `spark-app`.
- 跨包导入绝不要使用相对路径，必须使用 `@spark-view/*` 包名。
- `spark-utils`、`spark-data`、`spark-page-config` 必须保持框架无关，不要在这些包里导入 `vue`、`vue-router`、`element-plus` 或其他 UI 框架。
- SPARK capability DI 不是 Vue DI。业务能力使用 `sparkProvide` / `sparkConsume`；Vue `provide/inject` 只用于基础设施，主要是 registry。
- 渲染容器以 DataView 为先。`r-table`、`r-form`、`r-detail`、`r-tree` 使用 `dataViewKey` 解析 `DataView`，并向后代提供 `DATA_SOURCE`。
- 避免破坏 `el-table` -> `el-table-column` 直接关系的 slot 包裹层。容器 children 应通过 `SparkComponentRenderer` 流转。
- 优先 fail-fast。不要添加会掩盖缺失 API、无效配置或运行时状态不一致的静默回退。
- 触及页面配置、导航、通用 CRUD、AI 生成或 SSE 调试时坚持 API 优先。改 Spring controller 或 service 前，优先复用现有 tenant/project scoped endpoint 和前端集成。

## 高价值约定

- 组件 `type` 使用 kebab-case，并通过 `Spark.register()` 注册。
- 直接渲染在 `el-table` 下的组件必须同步注册。表格列类组件不要使用 `defineAsyncComponent`。
- DataViewKey 是显式语义： `dataViewKey` is `table@viewId` or `#scope@table@viewId`; 读取 DataView 输出使用 `dataMember` 加可选 `dataField`。不要恢复成员拼接键或点号数据路径。
- `script.js` 沙箱代码优先使用 `$page`、`$route`、`$dataSet`、`$query`、`SparkData` 和 `h`。
- 在 `script.js` 中不要使用 `$data`、ESM `import`、`window.xxx` 全局、直接 `ElMessage` / `ElMessageBox` 或直接导入 Vue Router。
- `computeExpression` 规则：
  - 单表达式会自动 return
  - 多语句体必须在每条路径上显式 `return`
- 需要当前行高亮的每个 `el-table` 必须自行声明 `props.highlightCurrentRow = true`。
- `packages/**` 下的生产代码遵守严格 TypeScript 规则，不要引入显式 `any`。
- `spark-ai-server/data/pages-config/**/script.js` 是沙箱代码，不是普通模块代码。不要把它改成标准应用模块写法。

## 文档优先

扩展本文档前，先把现有文档当作规范来源。

- [docs/README.md](../docs/README.md) — 文档索引和阅读顺序
- [docs/guides/QUICKSTART.md](../docs/guides/QUICKSTART.md) — 本地设置和启动流程
- [docs/guides/DATA_MANAGEMENT.md](../docs/guides/DATA_MANAGEMENT.md) — `DataSet`、`DataView`、关系、计算列、聚合
- [docs/guides/CONFIG_SYSTEM.md](../docs/guides/CONFIG_SYSTEM.md) — 页面配置、脚本边界、运行时配置行为
- [docs/guides/COMPONENT_DEVELOPMENT.md](../docs/guides/COMPONENT_DEVELOPMENT.md) — 组件模式、注册、渲染器用法
- [docs/guides/PLUGIN_CONFIGURATION.md](../docs/guides/PLUGIN_CONFIGURATION.md) — 插件系统和集成
- [docs/guides/TESTING_BEST_PRACTICES.md](../docs/guides/TESTING_BEST_PRACTICES.md) — 测试方法和预期
- [docs/architecture/DATAFLOW_ARCHITECTURE.md](../docs/architecture/DATAFLOW_ARCHITECTURE.md) — 运行时数据流和所有权边界
- [docs/architecture/PERMISSION_SYSTEM.md](../docs/architecture/PERMISSION_SYSTEM.md) — 权限模型规范
- [docs/architecture/PLATFORM_TENANT_ROUTING.md](../docs/architecture/PLATFORM_TENANT_ROUTING.md) — tenant/project 路由和 API 作用域
- [docs/ai/README.md](../docs/ai/README.md) — AI 治理、prompt 系统和 stills 相关文档
- [packages/README.md](../packages/README.md) — 包级入口
- [tests/README.md](../tests/README.md) — 根级测试范围和约定
- [spark-ai-server/README.md](../spark-ai-server/README.md) — 后端、API 和 SSE 调试上下文
- [README.md](../README.md) and [CONTRIBUTING.md](../CONTRIBUTING.md) — 项目概览和贡献规则

## 常见工作流提示

- 渲染器或组件行为：从 `packages/spark-component` 入手，再阅读组件指南。
- 数据绑定或关系问题：先看 `data-view-key.ts`、`data-view.ts`、`bindRules.ts`，再读数据指南。
- 页面配置或 AI 集成问题：优先使用 scoped 后端 API 和现有 SSE 调试流，不要先造新链路。
- 纯前端变更通常用 `pnpm run typecheck`、`pnpm run lint` 和聚焦 Vitest 验证。
- 后端变更需要运行 `cd spark-ai-server && mvn test`。

如果某个主题已有文档，链接到文档，不要在这里继续膨胀。
