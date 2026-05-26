/**
 * 容器组件统一分类入口。
 */

// 平铺导出（组件）
export {
	RendererDetail,
	RendererForm,
	RendererList,
	RendererTable,
	RendererTree,
	RendererVirtualCard,
} from './data-views/index.js'
export type {
	RDetailProps,
	RFormProps,
	RListProps,
	RVirtualCardProps,
	RendererDetailApi,
	RendererFormApi,
	RendererListApi,
	RendererTableApi,
	RendererTreeApi,
	RendererVirtualCardApi,
	RendererTreePath,
	RTableProps,
	RTreeProps,
} from './data-views/index.js'
export {
	RendererAffix,
	RendererAnchor,
	RendererAnchorLink,
	RendererAside,
	RendererBacktop,
	RendererButton,
	RendererButtonGroup,
	RendererCard,
	RendererCarousel,
	RendererCarouselItem,
	RendererCol,
	RendererCollapse,
	RendererCollapseItem,
	RendererContainer,
	RendererDialog,
	RendererDivider,
	RendererDrawer,
	RendererDropdown,
	RendererLayoutFooter,
	RendererLayoutHeader,
	RendererLink,
	RendererMain,
	RendererPageHeader,
	RendererPopconfirm,
	RendererPopover,
	RendererRow,
	RendererScrollbar,
	RendererSection,
	RendererSpace,
	RendererStepItem,
	RendererSteps,
	RendererTabPane,
	RendererTabs,
	RendererToolbar,
	RendererTooltip,
	RendererTour,
	RendererWatermark,
} from './layout/index.js'
export type {
	DropdownItem,
	RAnchorLinkProps,
	RAnchorProps,
	RButtonProps,
	RCardProps,
	RCollapseProps,
	RDialogProps,
	RDividerProps,
	RDrawerProps,
	RDropdownProps,
	RLinkProps,
	RPageHeaderProps,
	RPopconfirmProps,
	RPopoverProps,
	RSectionProps,
	RendererCollapseApi,
	RendererDialogApi,
	RendererDrawerApi,
	RendererSectionApi,
	RendererStepsApi,
	RendererTabsApi,
	RSpaceProps,
	RStepsProps,
	RTabsProps,
	RTooltipProps,
	RTourProps,
	TabsClickEvent,
	TourStep,
} from './layout/index.js'
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
