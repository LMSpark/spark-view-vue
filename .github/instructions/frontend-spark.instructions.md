---
description: "编辑 SPARK 前端 Vue 代码、Spark 渲染器组件、字段、容器、组件注册或根 src UI 集成时使用。覆盖 DataView-first 容器、Spark 能力接线、透明表格列渲染和聚焦前端验证。"
name: "SPARK 前端渲染器指南"
applyTo: "packages/spark-component/**, src/components/**, src/composables/**, src/features/**, src/layout/**, src/views/**, src/App.vue, src/main.ts, src/style.css"
---

# SPARK 前端指南

在 `packages/spark-component/**` 下处理 Vue 渲染器工作，或在 `src/**` 下做根前端集成时使用本说明。

## 保持现有前端形态

- 优先扩展最近的现有容器、字段或渲染器模式，不要发明新的接线路径。
- 保持配置优先。行为能用 `rule.json`、`pagedata.json`、metadata 或现有能力表达时，先用配置表达，再考虑新增 `script.js` 或命令式代码。
- 遇到组件类型缺失、`dataViewKey` / `dataMember` 无效、能力缺失或运行时状态不一致时要 fail-fast，不要添加静默回退分支。

## 渲染器与数据流规则

- 容器以 DataView 为先。`r-table`、`r-form`、`r-detail`、`r-tree` 应把 `dataViewKey` 解析为 `DataView`，并向下提供 `DATA_SOURCE`。
- 不要在前端代码中重新引入 raw page-data 归一化、渲染器侧 JSON 解析、`pageData` 或 `$data` 式旁路。
- 只使用当前显式绑定格式：容器使用 `dataViewKey`，格式为 `table@viewId` 或 `#scope@table@viewId`；读取 DataView 输出时使用 `dataMember` 加可选 `dataField`。
- `clearDataSet()` 只能释放引用。渲染器生命周期清理中绝不要调用 `DataSet.destroy()`。

## 能力与组件边界

- `sparkProvide` / `sparkConsume` 是业务 DI 路径。Vue `provide/inject` 只用于基础设施，主要服务 registry。
- 将 `useSparkComponent()` 保持在 `<script setup>` 顶层，并默认通过它访问可见性、禁用状态、logger 和能力。
- 前端工作跨包时，不要把 Vue 或 Element Plus 导入 `spark-utils`、`spark-data`、`spark-page-config`。
- 跨 workspace 包边界绝不要使用相对导入，始终通过 `@spark-view/*` 导入。

## 表格与渲染器注意事项

- 直接渲染在 `el-table` 下的内容必须保留 `el-table` -> `el-table-column` 直接结构。不要添加破坏列发现的包裹层。
- 容器 children 应通过 `props.children` 和 `SparkComponentRenderer` 流转，不要通过额外 slot 包裹层改变 DOM/组件父子关系。
- 列式或表格直连组件必须同步注册，不要在该路径使用 `defineAsyncComponent`。
- 如果注册代码是生成或集中式的，异步加载器要通过 `Spark.register(...)` 接入，不要使用原始 registry 异步定义。
- 需要当前行高亮的每张表都必须自行设置 `props.highlightCurrentRow = true`。

## 实用编辑默认值

- 组件 `type` 值保持 kebab-case。
- 优先使用 typed props 和现有 capability/data-source 类型。生产前端代码不要引入显式 `any`。
- 面向 `script.js` 沙箱的工作优先使用 `$page`、`$route`、`$dataSet`、`$query`、`SparkData` 和 `h`；不要添加直接框架全局或 ESM 导入。
- 调整渲染器递归或字段值流时，先确认所属抽象是 `SparkComponentRenderer`、容器组件、`bindRules.ts` 还是 `useSparkComponent.ts`，再决定是否扩大范围。

## 验证

- 前端变更通常应使用 `pnpm run typecheck` 验证。
- 触及的行为已有附近覆盖时，运行聚焦 Vitest 用例。
- 编辑共享前端代码路径或引入新的 TS/Vue 逻辑时，运行 `pnpm run lint`。

## 文档

- `docs/guides/COMPONENT_DEVELOPMENT.md` — 组件注册、`useSparkComponent`、能力使用
- `docs/guides/DATA_MANAGEMENT.md` — `DataSet`、`DataView`、关系、计算列
- `docs/guides/CONFIG_SYSTEM.md` — 配置/脚本边界
- `docs/architecture/DATAFLOW_ARCHITECTURE.md` — 渲染器/运行时所有权边界
- `tests/README.md` — 根级前端/集成测试范围
