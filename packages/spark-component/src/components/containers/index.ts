/**
 * 容器组件统一分类入口。
 */

// 平铺导出（组件）
export * from './data-components/index.js'
export * from './non-data-components/index.js'
export { default as RendererFilter } from './RendererFilter.vue'
export { default as RendererEditor } from './RendererEditor.vue'
export { default as RendererHeader } from './RendererHeader.vue'
export { default as RendererFooter } from './RendererFooter.vue'
export { default as RendererTail } from './RendererTail.vue'
export { default as RendererFieldScope } from './support/RendererFieldScope.vue'

// ── 结构节点类型（供容器 Props 组合使用） ──
export type { RToolbarProps, InlineAlign, InlineJustify } from './non-data-components/RendererToolbar.types.js'
export type { RendererFilterProps } from './RendererFilter.types.js'
export type { ActionsAlign, ActionsPosition, ActionsFixed, RendererActionsProps } from './support/RendererActions.types.js'
export type { RendererEditorProps } from './RendererEditor.types.js'
export type { RendererHeaderProps } from './RendererHeader.types.js'
export type { RendererFooterProps } from './RendererFooter.types.js'
export type { RendererTailProps } from './RendererTail.types.js'
export type { ToolbarPosition } from './composables/container-composables.js'

export {
	useContainerDataSource,
	useContainerDataSourceEffects,
} from './composables/index.js'
