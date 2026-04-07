/**
 * 组件层入口。
 *
 * 聚合所有可渲染组件、组件内部注册函数以及少量对外暴露的组件级 composable。
 */

import { markSparkTemplateNodeComponent } from './support/SparkChild.shared.js'
import { createTemplateDsl } from './template/createTemplateDsl.js'
import {
  BuiltinActionButton,
  RendererTable,
  RendererForm,
  RendererDetail,
  RendererTree,
  RendererList,
  RendererTabs,
  RendererCollapse,
  RendererDialog,
  RendererDrawer,
  RendererSteps,
  RendererSection,
  RendererToolbar,
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
  RendererFieldScope,
  RendererListItemScope,
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

// ── DSL 标记：使组件可作为模板 DSL 子节点编译为 SparkNode ─────────────────────
type TemplateNodeComponent = Parameters<typeof markSparkTemplateNodeComponent>[0]
type TemplateNodeEntry = readonly [TemplateNodeComponent, string]

const FIELD_DSL_NODES: TemplateNodeEntry[] = [
  [BuiltinActionButton, 'builtin-action'],
  [FieldText, 'r-text'],
  [FieldTextarea, 'r-textarea'],
  [FieldHtmlEditor, 'r-html-editor'],
  [FieldNumber, 'r-number'],
  [FieldDate, 'r-date'],
  [FieldSelect, 'r-select'],
  [FieldMultiSelect, 'r-multi-select'],
  [FieldRadio, 'r-radio'],
  [FieldCheckbox, 'r-checkbox'],
  [FieldCheckboxGroup, 'r-checkbox-group'],
  [FieldSwitch, 'r-switch'],
  [FieldSlider, 'r-slider'],
  [FieldRate, 'r-rate'],
  [FieldColor, 'r-color'],
  [FieldIcon, 'r-icon'],
  [FieldImage, 'r-image'],
  [FieldFilePath, 'r-file-path'],
  [FieldFileBrowser, 'r-file-browser'],
  [FieldUpload, 'r-upload'],
  [FieldEntityPicker, 'r-entity-picker'],
  [FieldUserPicker, 'r-user-picker'],
  [FieldDeptPicker, 'r-dept-picker'],
  [FieldProductPicker, 'r-product-picker'],
  [FieldCascader, 'r-cascader'],
  [FieldTreeSelect, 'r-tree-select'],
  [FieldTransfer, 'r-transfer'],
  [FieldSegmented, 'r-segmented'],
  [FieldCheckTag, 'r-check-tag'],
  [FieldMention, 'r-mention'],
  [FieldTimePicker, 'r-time-picker'],
  [FieldTimeSelect, 'r-time-select'],
  [FieldAutocomplete, 'r-autocomplete'],
  [FieldContextRenderer, 'r-column-group'],
  [FieldTreeNodeSummary, 'r-tree-node-summary'],
]

const PRESENTATION_DSL_NODES: TemplateNodeEntry[] = [
  [RendererRow, 'r-row'],
  [RendererCol, 'r-col'],
  [RendererCard, 'r-card'],
  [RendererSpace, 'r-space'],
  [RendererDivider, 'r-divider'],
  [RendererButton, 'r-button'],
  [RendererLink, 'r-link'],
  [RendererPageHeader, 'r-page-header'],
  [RendererDropdown, 'r-dropdown'],
  [RendererTooltip, 'r-tooltip'],
  [RendererPopover, 'r-popover'],
  [RendererPopconfirm, 'r-popconfirm'],
  [RendererBacktop, 'r-backtop'],
  [RendererCarousel, 'r-carousel'],
  [RendererCarouselItem, 'r-carousel-item'],
  [RendererWatermark, 'r-watermark'],
  [RendererAffix, 'r-affix'],
  [RendererScrollbar, 'r-scrollbar'],
  [RendererTour, 'r-tour'],
  [RendererAnchor, 'r-anchor'],
  [RendererAnchorLink, 'r-anchor-link'],
  [RendererContainer, 'r-container'],
  [RendererAside, 'r-aside'],
  [RendererMain, 'r-main'],
  [RendererLayoutHeader, 'r-layout-header'],
  [RendererLayoutFooter, 'r-layout-footer'],
  [RendererButtonGroup, 'r-button-group'],
  [DisplayStatistic, 'r-statistic'],
  [DisplayProgress, 'r-progress'],
  [DisplayTag, 'r-tag'],
  [DisplayBadge, 'r-badge'],
  [DisplayAvatar, 'r-avatar'],
  [DisplayText, 'r-text-display'],
  [DisplayPagination, 'r-pagination'],
  [DisplayDescriptions, 'r-descriptions'],
  [DisplayDescriptionsItem, 'r-descriptions-item'],
  [DisplayTimeline, 'r-timeline'],
  [DisplayTimelineItem, 'r-timeline-item'],
  [DisplayAlert, 'r-alert'],
  [DisplayEmpty, 'r-empty'],
  [DisplayResult, 'r-result'],
  [DisplayBreadcrumb, 'r-breadcrumb'],
  [DisplayBreadcrumbItem, 'r-breadcrumb-item'],
  [DisplaySkeleton, 'r-skeleton'],
  [DisplayImage, 'display-image'],
  [DisplayCalendar, 'display-calendar'],
  [DisplayCountdown, 'display-countdown'],
  [DisplayIcon, 'display-icon'],
]

for (const [component, nodeType] of FIELD_DSL_NODES) {
  markSparkTemplateNodeComponent(component, { nodeType })
}

for (const [component, nodeType] of PRESENTATION_DSL_NODES) {
  markSparkTemplateNodeComponent(component, { nodeType })
}

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
// 这些导出面向模板 authoring，统一返回固定 nodeType 的 DSL 包装组件；
// 真实渲染组件仍通过 Field* / BuiltinActionButton 暴露。
type TemplateDslAliasDefinition = readonly [nodeType: string, dslName?: string]
type TemplateDslAliasDefinitions = Record<string, TemplateDslAliasDefinition>
type TemplateDslAliases<T extends TemplateDslAliasDefinitions> = {
  [K in keyof T]: ReturnType<typeof createTemplateDsl>
}

function createTemplateAliases<T extends TemplateDslAliasDefinitions>(
  definitions: T,
): TemplateDslAliases<T> {
  const aliases = {} as TemplateDslAliases<T>
  for (const [aliasName, definition] of Object.entries(definitions) as Array<
    [keyof T & string, T[keyof T]]
  >) {
    const [nodeType, dslName] = definition
    aliases[aliasName] = createTemplateDsl(nodeType, dslName ?? aliasName)
  }
  return aliases
}

const FIELD_TEMPLATE_ALIAS_DEFINITIONS = {
  ElButton: ['builtin-action', 'SparkDslBuiltinActionButton'],
  RText: ['r-text'],
  RTextarea: ['r-textarea'],
  RHtmlEditor: ['r-html-editor'],
  RNumber: ['r-number'],
  RDate: ['r-date'],
  RSelect: ['r-select'],
  RMultiSelect: ['r-multi-select'],
  RRadio: ['r-radio'],
  RCheckbox: ['r-checkbox'],
  RCheckboxGroup: ['r-checkbox-group'],
  RSwitch: ['r-switch'],
  RSlider: ['r-slider'],
  RRate: ['r-rate'],
  RColor: ['r-color'],
  RIcon: ['r-icon'],
  RImage: ['r-image'],
  RFilePath: ['r-file-path'],
  RFileBrowser: ['r-file-browser'],
  RUpload: ['r-upload'],
  REntityPicker: ['r-entity-picker'],
  RUserPicker: ['r-user-picker'],
  RDeptPicker: ['r-dept-picker'],
  RProductPicker: ['r-product-picker'],
  RCascader: ['r-cascader'],
  RTreeSelect: ['r-tree-select'],
  RTransfer: ['r-transfer'],
  RSegmented: ['r-segmented'],
  RCheckTag: ['r-check-tag'],
  RMention: ['r-mention'],
  RTimePicker: ['r-time-picker'],
  RTimeSelect: ['r-time-select'],
  RAutocomplete: ['r-autocomplete'],
  RColumnGroup: ['r-column-group'],
  RTreeNodeSummary: ['r-tree-node-summary'],
} as const

const PRESENTATION_TEMPLATE_ALIAS_DEFINITIONS = {
  RRow: ['r-row'],
  RCol: ['r-col'],
  RCard: ['r-card'],
  RSpace: ['r-space'],
  RDivider: ['r-divider'],
  RButton: ['r-button'],
  RLink: ['r-link'],
  RPageHeader: ['r-page-header'],
  RDropdown: ['r-dropdown'],
  RTooltip: ['r-tooltip'],
  RPopover: ['r-popover'],
  RPopconfirm: ['r-popconfirm'],
  RBacktop: ['r-backtop'],
  RCarousel: ['r-carousel'],
  RCarouselItem: ['r-carousel-item'],
  RWatermark: ['r-watermark'],
  RAffix: ['r-affix'],
  RScrollbar: ['r-scrollbar'],
  RTour: ['r-tour'],
  RAnchor: ['r-anchor'],
  RAnchorLink: ['r-anchor-link'],
  RContainer: ['r-container'],
  RAside: ['r-aside'],
  RMain: ['r-main'],
  RLayoutHeader: ['r-layout-header'],
  RLayoutFooter: ['r-layout-footer'],
  RButtonGroup: ['r-button-group'],
  RStatistic: ['r-statistic'],
  RProgress: ['r-progress'],
  RTag: ['r-tag'],
  RBadge: ['r-badge'],
  RAvatar: ['r-avatar'],
  RTextDisplay: ['r-text-display'],
  RPagination: ['r-pagination'],
  RDescriptions: ['r-descriptions'],
  RDescriptionsItem: ['r-descriptions-item'],
  RTimeline: ['r-timeline'],
  RTimelineItem: ['r-timeline-item'],
  RAlert: ['r-alert'],
  REmpty: ['r-empty'],
  RResult: ['r-result'],
  RBreadcrumb: ['r-breadcrumb'],
  RBreadcrumbItem: ['r-breadcrumb-item'],
  RSkeleton: ['r-skeleton'],
  RDisplayImage: ['display-image'],
  RDisplayCalendar: ['display-calendar'],
  RDisplayCountdown: ['display-countdown'],
  RDisplayIcon: ['display-icon'],
} as const

const FIELD_TEMPLATE_ALIASES = createTemplateAliases(FIELD_TEMPLATE_ALIAS_DEFINITIONS)
const PRESENTATION_TEMPLATE_ALIASES = createTemplateAliases(PRESENTATION_TEMPLATE_ALIAS_DEFINITIONS)

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
} = FIELD_TEMPLATE_ALIASES

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
} = PRESENTATION_TEMPLATE_ALIASES

// ── 容器 Renderer 组件 ───────────────────────────────────────────────────────
export {
  BuiltinActionButton,
  RendererTable,
  RendererForm,
  RendererDetail,
  RendererTree,
  RendererList,
  RendererTabs,
  RendererCollapse,
  RendererDialog,
  RendererDrawer,
  RendererSteps,
  RendererSection,
  RendererToolbar,
  RendererRow,
  RendererCol,
  RendererCard,
  RendererSpace,
  RendererDivider,
  RendererButton,
  RendererButtonGroup,
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
  RendererFieldScope,
  RendererListItemScope,
}

// ── 字段组件 ──────────────────────────────────────────────────────────────────
export { FieldText }
export { FieldTextarea }
export { FieldHtmlEditor }
export { FieldNumber }
export { FieldDate }
export { FieldSelect }
export { FieldMultiSelect }
export { FieldRadio }
export { FieldCheckbox }
export { FieldCheckboxGroup }
export { FieldSwitch }
export { FieldSlider }
export { FieldRate }
export { FieldColor }
export { FieldIcon }
export { FieldImage }
export { FieldFilePath }
export { FieldFileBrowser }
export { FieldUpload }
export { FieldEntityPicker }
export { FieldUserPicker }
export { FieldDeptPicker }
export { FieldProductPicker }
export { FieldCascader }
export { FieldTreeSelect }
export { FieldTransfer }
export { FieldSegmented }
export { FieldCheckTag }
export { FieldMention }
export { FieldTimePicker }
export { FieldTimeSelect }
export { FieldAutocomplete }
export { FieldContextRenderer }
export { FieldContextRenderer as FieldColumnGroup }
export { FieldTreeNodeSummary }

// ── 展示组件导出 ──────────────────────────────────────────────────────────────
export { DisplayStatistic }
export { DisplayProgress }
export { DisplayTag }
export { DisplayBadge }
export { DisplayAvatar }
export { DisplayText }
export { DisplayPagination }
export { DisplayDescriptions }
export { DisplayDescriptionsItem }
export { DisplayTimeline }
export { DisplayTimelineItem }
export { DisplayAlert }
export { DisplayEmpty }
export { DisplayResult }
export { DisplayBreadcrumb }
export { DisplayBreadcrumbItem }
export { DisplaySkeleton }
export { DisplayImage }
export { DisplayCalendar }
export { DisplayCountdown }
export { DisplayIcon }

// ── 注册 & composable ────────────────────────────────────────────────────────
export { registerAllRenderers } from './register-renderers.js'
export { useFieldPermission } from './fields/composables.js'
