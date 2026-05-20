/**
 * 容器组件统一分类入口。
 */

// 平铺导出（组件）
export * from './data-views/index.js'
export * from './layout/index.js'
export { default as RendererFilter } from './zones/RendererFilter.vue'
export { default as RendererEditor } from './zones/RendererEditor.vue'
export { default as RendererHeader } from './zones/RendererHeader.vue'
export { default as RendererFooter } from './zones/RendererFooter.vue'
export { default as RendererTail } from './zones/RendererTail.vue'
export { default as RendererFieldScope } from './support/RendererFieldScope.vue'

// ── 结构节点类型（供容器 Props 组合使用） ──
export type { RToolbarProps, InlineAlign, InlineJustify } from './layout/RendererToolbar.types.js'
export type { RFilterProps } from './zones/RendererFilter.types.js'
export type { ActionsAlign, ActionsPosition, RendererActionsProps } from './support/RendererActions.types.js'
export type { REditorProps } from './zones/RendererEditor.types.js'
export type { RHeaderProps } from './zones/RendererHeader.types.js'
export type { RFooterProps } from './zones/RendererFooter.types.js'
export type { RTailProps } from './zones/RendererTail.types.js'
export type { ToolbarPosition } from './runtime/container-ui.js'

export {
	useContainerDataSource,
	useContainerDataSourceEffects,
} from './runtime/index.js'
