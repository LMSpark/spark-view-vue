/**
 * 组件层入口。
 *
 * 聚合所有可渲染组件、组件内部注册函数以及少量对外暴露的组件级 composable。
 */

import { markSparkTemplateNodeComponent } from './support/SparkChild.shared.js'
import { createTemplateDsl } from './template/createTemplateDsl.js'
import {
  BuiltinActionButton,
  RendererRow,
  RendererCol,
  RendererCard,
  RendererSpace,
  RendererDivider,
  RendererButton,
  RendererLink,
  RendererPageHeader,
  RendererDropdown,
  RendererTooltip,
  RendererPopover,
  RendererPopconfirm,
  RendererBacktop,
  RendererCarousel,
  RendererCarouselItem,
  RendererWatermark,
  RendererAffix,
  RendererScrollbar,
  RendererTour,
  RendererAnchor,
  RendererAnchorLink,
  RendererContainer,
  RendererAside,
  RendererMain,
  RendererLayoutHeader,
  RendererLayoutFooter,
  RendererButtonGroup,
} from './containers/index.js'

// ── 字段组件导入（用于 DSL 标记 + 别名导出）──────────────────────────────────
import {
  FieldText,
  FieldTextarea,
  FieldHtmlEditor,
  FieldNumber,
  FieldDate,
  FieldSelect,
  FieldMultiSelect,
  FieldRadio,
  FieldCheckbox,
  FieldCheckboxGroup,
  FieldSwitch,
  FieldSlider,
  FieldRate,
  FieldColor,
  FieldIcon,
  FieldImage,
  FieldFilePath,
  FieldFileBrowser,
  FieldUpload,
  FieldEntityPicker,
  FieldUserPicker,
  FieldDeptPicker,
  FieldProductPicker,
  FieldCascader,
  FieldTreeSelect,
  FieldTransfer,
  FieldSegmented,
  FieldCheckTag,
  FieldMention,
  FieldTimePicker,
  FieldTimeSelect,
  FieldAutocomplete,
  FieldContextRenderer,
  FieldTreeNodeSummary,
} from './fields/index.js'

// ── 新增布局/展示/反馈组件导入 ──────────────────────────────────────────────
import {
  DisplayStatistic,
  DisplayProgress,
  DisplayTag,
  DisplayBadge,
  DisplayAvatar,
  DisplayText,
  DisplayPagination,
  DisplayDescriptions,
  DisplayDescriptionsItem,
  DisplayTimeline,
  DisplayTimelineItem,
  DisplayAlert,
  DisplayEmpty,
  DisplayResult,
  DisplayBreadcrumb,
  DisplayBreadcrumbItem,
  DisplaySkeleton,
  DisplayImage,
  DisplayCalendar,
  DisplayCountdown,
  DisplayIcon,
} from './display/index.js'

// ── DSL 定义：组件标记 + 模板别名合一 ─────────────────────────────────────────
// 每条 [component, nodeType, dslName?] 同时驱动：
//   1. markSparkTemplateNodeComponent — 编译时标记
//   2. createTemplateDsl — 生成 R-前缀模板组件
type DslDef = readonly [component: unknown, nodeType: string, dslName?: string]

function processDsl<T extends Readonly<Record<string, DslDef>>>(
  defs: T,
): { [K in keyof T]: ReturnType<typeof createTemplateDsl> } {
  const result: Record<string, ReturnType<typeof createTemplateDsl>> = {}
  for (const [alias, entry] of Object.entries(defs)) {
    const [component, nodeType, dslName] = entry
    markSparkTemplateNodeComponent(component, { nodeType })
    result[alias] = createTemplateDsl(nodeType, dslName ?? alias)
  }
  return result as { [K in keyof T]: ReturnType<typeof createTemplateDsl> }
}

const FIELD_DSL = {
  ElButton: [BuiltinActionButton, 'builtin-action', 'SparkDslBuiltinActionButton'],
  RText: [FieldText, 'r-text'],
  RTextarea: [FieldTextarea, 'r-textarea'],
  RHtmlEditor: [FieldHtmlEditor, 'r-html-editor'],
  RNumber: [FieldNumber, 'r-number'],
  RDate: [FieldDate, 'r-date'],
  RSelect: [FieldSelect, 'r-select'],
  RMultiSelect: [FieldMultiSelect, 'r-multi-select'],
  RRadio: [FieldRadio, 'r-radio'],
  RCheckbox: [FieldCheckbox, 'r-checkbox'],
  RCheckboxGroup: [FieldCheckboxGroup, 'r-checkbox-group'],
  RSwitch: [FieldSwitch, 'r-switch'],
  RSlider: [FieldSlider, 'r-slider'],
  RRate: [FieldRate, 'r-rate'],
  RColor: [FieldColor, 'r-color'],
  RIcon: [FieldIcon, 'r-icon'],
  RImage: [FieldImage, 'r-image'],
  RFilePath: [FieldFilePath, 'r-file-path'],
  RFileBrowser: [FieldFileBrowser, 'r-file-browser'],
  RUpload: [FieldUpload, 'r-upload'],
  REntityPicker: [FieldEntityPicker, 'r-entity-picker'],
  RUserPicker: [FieldUserPicker, 'r-user-picker'],
  RDeptPicker: [FieldDeptPicker, 'r-dept-picker'],
  RProductPicker: [FieldProductPicker, 'r-product-picker'],
  RCascader: [FieldCascader, 'r-cascader'],
  RTreeSelect: [FieldTreeSelect, 'r-tree-select'],
  RTransfer: [FieldTransfer, 'r-transfer'],
  RSegmented: [FieldSegmented, 'r-segmented'],
  RCheckTag: [FieldCheckTag, 'r-check-tag'],
  RMention: [FieldMention, 'r-mention'],
  RTimePicker: [FieldTimePicker, 'r-time-picker'],
  RTimeSelect: [FieldTimeSelect, 'r-time-select'],
  RAutocomplete: [FieldAutocomplete, 'r-autocomplete'],
  RColumnGroup: [FieldContextRenderer, 'r-column-group'],
  RTreeNodeSummary: [FieldTreeNodeSummary, 'r-tree-node-summary'],
} as const satisfies Record<string, DslDef>

const PRESENTATION_DSL = {
  RRow: [RendererRow, 'r-row'],
  RCol: [RendererCol, 'r-col'],
  RCard: [RendererCard, 'r-card'],
  RSpace: [RendererSpace, 'r-space'],
  RDivider: [RendererDivider, 'r-divider'],
  RButton: [RendererButton, 'r-button'],
  RLink: [RendererLink, 'r-link'],
  RPageHeader: [RendererPageHeader, 'r-page-header'],
  RDropdown: [RendererDropdown, 'r-dropdown'],
  RTooltip: [RendererTooltip, 'r-tooltip'],
  RPopover: [RendererPopover, 'r-popover'],
  RPopconfirm: [RendererPopconfirm, 'r-popconfirm'],
  RBacktop: [RendererBacktop, 'r-backtop'],
  RCarousel: [RendererCarousel, 'r-carousel'],
  RCarouselItem: [RendererCarouselItem, 'r-carousel-item'],
  RWatermark: [RendererWatermark, 'r-watermark'],
  RAffix: [RendererAffix, 'r-affix'],
  RScrollbar: [RendererScrollbar, 'r-scrollbar'],
  RTour: [RendererTour, 'r-tour'],
  RAnchor: [RendererAnchor, 'r-anchor'],
  RAnchorLink: [RendererAnchorLink, 'r-anchor-link'],
  RContainer: [RendererContainer, 'r-container'],
  RAside: [RendererAside, 'r-aside'],
  RMain: [RendererMain, 'r-main'],
  RLayoutHeader: [RendererLayoutHeader, 'r-layout-header'],
  RLayoutFooter: [RendererLayoutFooter, 'r-layout-footer'],
  RButtonGroup: [RendererButtonGroup, 'r-button-group'],
  RStatistic: [DisplayStatistic, 'r-statistic'],
  RProgress: [DisplayProgress, 'r-progress'],
  RTag: [DisplayTag, 'r-tag'],
  RBadge: [DisplayBadge, 'r-badge'],
  RAvatar: [DisplayAvatar, 'r-avatar'],
  RTextDisplay: [DisplayText, 'r-text-display'],
  RPagination: [DisplayPagination, 'r-pagination'],
  RDescriptions: [DisplayDescriptions, 'r-descriptions'],
  RDescriptionsItem: [DisplayDescriptionsItem, 'r-descriptions-item'],
  RTimeline: [DisplayTimeline, 'r-timeline'],
  RTimelineItem: [DisplayTimelineItem, 'r-timeline-item'],
  RAlert: [DisplayAlert, 'r-alert'],
  REmpty: [DisplayEmpty, 'r-empty'],
  RResult: [DisplayResult, 'r-result'],
  RBreadcrumb: [DisplayBreadcrumb, 'r-breadcrumb'],
  RBreadcrumbItem: [DisplayBreadcrumbItem, 'r-breadcrumb-item'],
  RSkeleton: [DisplaySkeleton, 'r-skeleton'],
  RDisplayImage: [DisplayImage, 'display-image'],
  RDisplayCalendar: [DisplayCalendar, 'display-calendar'],
  RDisplayCountdown: [DisplayCountdown, 'display-countdown'],
  RDisplayIcon: [DisplayIcon, 'display-icon'],
} as const satisfies Record<string, DslDef>

// ── 支持组件 ──────────────────────────────────────────────────────────────────
export { default as SparkComponentRenderer } from './SparkComponentRenderer.vue'
export { default as SparkChild } from './support/SparkChild.js'
export { default as SparkChildrenBridge } from './support/SparkChildrenBridge.js'
export { default as SparkCodeEditor } from './support/SparkCodeEditor.vue'
export { default as SparkJsonEditor } from './support/SparkJsonEditor.vue'
export { default as JsonTreeEditor } from './support/JsonTreeEditor.vue'
export * from './support/jsonTreeEditor.js'
export { default as SparkTableColumns } from './support/SparkTableColumns.js'
export { default as ElTableColumns } from './support/SparkTableColumns.js'

// ── 模板 DSL ──────────────────────────────────────────────────────────────────
export { createTemplateDsl }
export { default as RTable } from './template/RTable.js'
export {
  RForm, RDetail, RTree, RList,
  RTabs, RCollapse, RDialog, RDrawer, RSteps, RSection, RToolbar,
} from './template/dsl-components.js'

// ── DSL 字段别名（R-前缀快捷名）──────────────────────────────────────────────
export const {
  ElButton,
  RText,
  RTextarea,
  RHtmlEditor,
  RNumber,
  RDate,
  RSelect,
  RMultiSelect,
  RRadio,
  RCheckbox,
  RCheckboxGroup,
  RSwitch,
  RSlider,
  RRate,
  RColor,
  RIcon,
  RImage,
  RFilePath,
  RFileBrowser,
  RUpload,
  REntityPicker,
  RUserPicker,
  RDeptPicker,
  RProductPicker,
  RCascader,
  RTreeSelect,
  RTransfer,
  RSegmented,
  RCheckTag,
  RMention,
  RTimePicker,
  RTimeSelect,
  RAutocomplete,
  RColumnGroup,
  RTreeNodeSummary,
} = processDsl(FIELD_DSL)

// ── DSL 快捷名：布局/展示/反馈 ──────────────────────────────────────────────
export const {
  RRow,
  RCol,
  RCard,
  RSpace,
  RDivider,
  RButton,
  RLink,
  RPageHeader,
  RDropdown,
  RTooltip,
  RPopover,
  RPopconfirm,
  RBacktop,
  RCarousel,
  RCarouselItem,
  RWatermark,
  RAffix,
  RScrollbar,
  RTour,
  RAnchor,
  RAnchorLink,
  RContainer,
  RAside,
  RMain,
  RLayoutHeader,
  RLayoutFooter,
  RButtonGroup,
  RStatistic,
  RProgress,
  RTag,
  RBadge,
  RAvatar,
  RTextDisplay,
  RPagination,
  RDescriptions,
  RDescriptionsItem,
  RTimeline,
  RTimelineItem,
  RAlert,
  REmpty,
  RResult,
  RBreadcrumb,
  RBreadcrumbItem,
  RSkeleton,
  RDisplayImage,
  RDisplayCalendar,
  RDisplayCountdown,
  RDisplayIcon,
} = processDsl(PRESENTATION_DSL)

// ── 组件 re-exports（leaf barrel 统一导出）──────────────────────────────────
export { BuiltinActionButton }
export * from './containers/data-components/index.js'
export * from './containers/non-data-components/index.js'
export * from './containers/docks/index.js'
export * from './fields/data-components/index.js'
export * from './fields/non-data-components/index.js'
export * from './display/data-components/index.js'
export * from './display/non-data-components/index.js'

// ── 注册 & composable ────────────────────────────────────────────────────────
export { registerAllRenderers } from './register-renderers.js'
export { useFieldPermission } from './fields/composables.js'
