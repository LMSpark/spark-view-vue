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
export type { ToolbarNode, RendererToolbarConfigProps, RendererToolbarProps, InlineAlign, InlineJustify } from './non-data-components/RendererToolbar.types.js'
export type { FilterNode, RendererFilterConfigProps, RendererFilterProps } from './RendererFilter.types.js'
export type { ActionsNode, RendererActionsConfigProps, ActionsAlign, ActionsPosition, ActionsFixed } from './support/RendererActions.types.js'
export type { EditorNode, RendererEditorConfigProps, RendererEditorProps } from './RendererEditor.types.js'
export type { HeaderNode, RendererHeaderConfigProps, RendererHeaderProps } from './RendererHeader.types.js'
export type { FooterNode, RendererFooterConfigProps, RendererFooterProps } from './RendererFooter.types.js'
export type { TailNode, RendererTailConfigProps, RendererTailProps } from './RendererTail.types.js'
export type { ToolbarPosition } from './layout/useContainerToolbar.js'

export {
	useContainerActions,
	useContainerDataSource,
	useContainerDataSourceEffects,
} from './composables/index.js'
export type { LateralActionPosition } from './composables/index.js'
