/**
 * 组件层入口。
 *
 * 聚合所有可渲染组件、组件内部注册函数以及少量对外暴露的组件级 composable。
 */

// ── 支持组件 ──────────────────────────────────────────────────────────────────
export { default as SparkComponentRenderer } from './SparkComponentRenderer.vue'
export { default as SparkCodeEditor } from './support/SparkCodeEditor.vue'
export { default as SparkJsonEditor } from './support/SparkJsonEditor.vue'
export { default as JsonTreeEditor } from './support/JsonTreeEditor.vue'
export { default as AiChatShell } from './support/AiChatShell.vue'
export * from './support/jsonTreeEditor.js'

// ── 组件 re-exports（leaf barrel 统一导出）──────────────────────────────────
export * from './containers/data-components/index.js'
export * from './containers/non-data-components/index.js'
export * from './fields/data-components/index.js'
export * from './fields/non-data-components/index.js'
export * from './display/data-components/index.js'
export * from './display/non-data-components/index.js'

// ── 注册 & composable ────────────────────────────────────────────────────────
export { registerAllRenderers } from './register-renderers.js'
export { useFieldPermission } from './fields/context/useFieldPermission.js'
