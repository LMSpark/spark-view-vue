/**
 * 容器组件统一分类入口。
 */

// 平铺导出（组件）
export * from './data-views/index.js'
export * from './layout/index.js'
export { default as RendererFilter } from './page-frame/RendererFilter.vue'
export { default as RendererEditor } from './page-frame/RendererEditor.vue'
export { default as RendererHeader } from './page-frame/RendererHeader.vue'
export { default as RendererFooter } from './page-frame/RendererFooter.vue'
export { default as RendererTail } from './page-frame/RendererTail.vue'
export { default as RendererFieldScope } from './support/RendererFieldScope.vue'

// ── 结构节点类型（供容器 Props 组合使用） ──
export type { RToolbarProps, InlineAlign, InlineJustify } from './layout/RendererToolbar.types.js'
export type { RendererFilterProps } from './page-frame/RendererFilter.types.js'
export type { ActionsAlign, ActionsPosition, ActionsFixed, RendererActionsProps } from './support/RendererActions.types.js'
export type { RendererEditorProps } from './page-frame/RendererEditor.types.js'
export type { RendererHeaderProps } from './page-frame/RendererHeader.types.js'
export type { RendererFooterProps } from './page-frame/RendererFooter.types.js'
export type { RendererTailProps } from './page-frame/RendererTail.types.js'
export type { ToolbarPosition } from './composables/container-ui.js'

export {
	useContainerDataSource,
	useContainerDataSourceEffects,
} from './composables/index.js'
