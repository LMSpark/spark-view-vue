/**
 * Dock 组件入口。
 *
 * Dock 组件 = 普通 SparkNode 子节点，容器通过 `type` 识别并提取。
 * 独立使用时渲染 children；在容器内使用时由绑定层提升为容器 props。
 */

// ── Dock Vue 组件 ──
export { default as DockActions } from './DockActions.vue'
export { default as DockFilter } from './DockFilter.vue'
export { default as DockEditor } from './DockEditor.vue'
export { default as DockHeader } from './DockHeader.vue'
export { default as DockFooter } from './DockFooter.vue'
export { default as DockTail } from './DockTail.vue'

// ── Dock 工具函数 ──
export { dockTypeToPropName } from './dock-extraction.js'
