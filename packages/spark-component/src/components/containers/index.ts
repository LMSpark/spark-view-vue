/**
 * 容器组件统一分类入口。
 *
 * 目标：
 * 1. 让调用方按领域发现组件（data / structural / docks）
 * 2. 收敛对 deep path 的直接依赖
 * 3. 保留可平铺导入能力
 */

// 组件分类
export * as dataComponents from './data-components/index.js'
export * as structuralComponents from './non-data-components/index.js'
export * as dockComponents from './docks/index.js'

// 能力分类（composable / helper）
export * as actions from './actions/index.js'
export * as context from './context/index.js'
export * as data from './data/index.js'
export * as layout from './layout/index.js'
export * as support from './support/index.js'

// 平铺导出（组件）
export * from './data-components/index.js'
export * from './non-data-components/index.js'
export * from './docks/index.js'
export { default as BuiltinActionButton } from './BuiltinActionButton.vue'
