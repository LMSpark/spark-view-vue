/**
 * Dock 组件入口。
 *
 * Dock 组件 = 普通 SparkNode 子节点，容器通过 `type` 识别并提取。
 * 独立使用时渲染 children；在容器内使用时由容器提取、消费其 props 和 children。
 */

// ── Dock Vue 组件 ──
export { default as DockActions } from './DockActions.vue'
export { default as DockFilter } from './DockFilter.vue'
export { default as DockEditor } from './DockEditor.vue'
export { default as DockHeader } from './DockHeader.vue'
export { default as DockFooter } from './DockFooter.vue'
export { default as DockTail } from './DockTail.vue'

// ── Dock 提取工具 ──
export {
  extractDockChildren,
  useDockExtraction,
  TABLE_DOCK_TYPES,
  TREE_DOCK_TYPES,
  LIST_DOCK_TYPES,
  FORM_DOCK_TYPES,
  NAVIGATION_DOCK_TYPES,
  OVERLAY_DOCK_TYPES,
  SECTION_DOCK_TYPES,
  TOOLBAR_DOCK_TYPES,
  type DockExtractionResult,
  type UseDockExtractionReturn,
} from './dock-extraction.js'
