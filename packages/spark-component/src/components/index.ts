/**
 * 组件层入口。
 *
 * 聚合所有可渲染组件、组件内部注册函数以及少量对外暴露的组件级 composable。
 */

// ── AI 面板模块 ─────────────────────────────────────────────────────────
export * from './ai/index.js'

// ── 支持组件 ──────────────────────────────────────────────────────────────────
export { default as SparkComponentRenderer } from './SparkComponentRenderer.vue'
export * from './editors/index.js'

// ── 组件 re-exports（leaf barrel 统一导出）──────────────────────────────────
export * from './containers/data-views/index.js'
export * from './containers/layout/index.js'
export * from './fields/data-components/index.js'
export * from './fields/non-data-components/index.js'
export * from './display/data-components/index.js'
export * from './display/non-data-components/index.js'

// ── 注册 & composable ────────────────────────────────────────────────────────
export { registerAllRenderers } from './register-renderers.js'
export { useFieldPermission } from './fields/context/useFieldPermission.js'
