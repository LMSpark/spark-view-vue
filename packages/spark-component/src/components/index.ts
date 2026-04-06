/**
 * 组件层入口。
 *
 * 聚合所有可渲染组件、组件内部注册函数以及少量对外暴露的组件级 composable。
 */

import { markSparkTemplateNodeComponent } from './support/SparkChild.shared.js'
import { createTemplateDsl } from './template/createTemplateDsl.js'
import RendererTable from './containers/data-components/RendererTable/index.js'

// ── 字段组件导入（用于 DSL 标记 + 别名导出）──────────────────────────────────
import BuiltinActionButton from './containers/BuiltinActionButton.vue'
import FieldText from './fields/data-components/FieldText.vue'
import FieldTextarea from './fields/data-components/FieldTextarea.vue'
import FieldHtmlEditor from './fields/data-components/FieldHtmlEditor.vue'
import FieldNumber from './fields/data-components/FieldNumber.vue'
import FieldDate from './fields/data-components/FieldDate.vue'
import FieldSelect from './fields/data-components/FieldSelect.vue'
import FieldMultiSelect from './fields/data-components/FieldMultiSelect.vue'
import FieldRadio from './fields/data-components/FieldRadio.vue'
import FieldCheckbox from './fields/data-components/FieldCheckbox.vue'
import FieldCheckboxGroup from './fields/data-components/FieldCheckboxGroup.vue'
import FieldSwitch from './fields/data-components/FieldSwitch.vue'
import FieldSlider from './fields/data-components/FieldSlider.vue'
import FieldRate from './fields/data-components/FieldRate.vue'
import FieldColor from './fields/data-components/FieldColor.vue'
import FieldIcon from './fields/data-components/FieldIcon.vue'
import FieldImage from './fields/data-components/FieldImage.vue'
import FieldFilePath from './fields/data-components/FieldFilePath.vue'
import FieldFileBrowser from './fields/data-components/FieldFileBrowser.vue'
import FieldUpload from './fields/data-components/FieldUpload.vue'
import FieldEntityPicker from './fields/data-components/FieldEntityPicker.vue'
import FieldUserPicker from './fields/data-components/FieldUserPicker.vue'
import FieldDeptPicker from './fields/data-components/FieldDeptPicker.vue'
import FieldProductPicker from './fields/data-components/FieldProductPicker.vue'
import FieldCascader from './fields/data-components/FieldCascader.vue'
import FieldTreeSelect from './fields/data-components/FieldTreeSelect.vue'
import FieldTransfer from './fields/data-components/FieldTransfer.vue'
import FieldSegmented from './fields/data-components/FieldSegmented.vue'
import FieldCheckTag from './fields/data-components/FieldCheckTag.vue'
import FieldMention from './fields/data-components/FieldMention.vue'
import FieldContextRenderer from './fields/non-data-components/FieldContextRenderer.vue'
import FieldTreeNodeSummary from './fields/non-data-components/TreeNodeSummary.vue'

// ── 新增布局/展示/反馈组件导入 ──────────────────────────────────────────────
import RendererRow from './containers/non-data-components/RendererRow.vue'
import RendererCol from './containers/non-data-components/RendererCol.vue'
import RendererCard from './containers/non-data-components/RendererCard.vue'
import RendererSpace from './containers/non-data-components/RendererSpace.vue'
import RendererDivider from './containers/non-data-components/RendererDivider.vue'
import RendererButton from './containers/non-data-components/RendererButton.vue'
import RendererLink from './containers/non-data-components/RendererLink.vue'
import RendererPageHeader from './containers/non-data-components/RendererPageHeader.vue'
import RendererDropdown from './containers/non-data-components/RendererDropdown.vue'
import RendererTooltip from './containers/non-data-components/RendererTooltip.vue'
import RendererPopover from './containers/non-data-components/RendererPopover.vue'
import RendererPopconfirm from './containers/non-data-components/RendererPopconfirm.vue'
import RendererBacktop from './containers/non-data-components/RendererBacktop.vue'
import RendererCarousel from './containers/non-data-components/RendererCarousel.vue'
import RendererCarouselItem from './containers/non-data-components/RendererCarouselItem.vue'
import RendererWatermark from './containers/non-data-components/RendererWatermark.vue'
import RendererAffix from './containers/non-data-components/RendererAffix.vue'
import RendererScrollbar from './containers/non-data-components/RendererScrollbar.vue'
import RendererTour from './containers/non-data-components/RendererTour.vue'
import RendererAnchor from './containers/non-data-components/RendererAnchor.vue'
import RendererAnchorLink from './containers/non-data-components/RendererAnchorLink.vue'
import DisplayStatistic from './display/data-components/DisplayStatistic.vue'
import DisplayProgress from './display/data-components/DisplayProgress.vue'
import DisplayTag from './display/data-components/DisplayTag.vue'
import DisplayBadge from './display/data-components/DisplayBadge.vue'
import DisplayAvatar from './display/data-components/DisplayAvatar.vue'
import DisplayText from './display/data-components/DisplayText.vue'
import DisplayPagination from './display/data-components/DisplayPagination.vue'
import DisplayDescriptions from './display/non-data-components/DisplayDescriptions.vue'
import DisplayDescriptionsItem from './display/non-data-components/DisplayDescriptionsItem.vue'
import DisplayTimeline from './display/non-data-components/DisplayTimeline.vue'
import DisplayTimelineItem from './display/non-data-components/DisplayTimelineItem.vue'
import DisplayAlert from './display/non-data-components/DisplayAlert.vue'
import DisplayEmpty from './display/non-data-components/DisplayEmpty.vue'
import DisplayResult from './display/non-data-components/DisplayResult.vue'
import DisplayBreadcrumb from './display/non-data-components/DisplayBreadcrumb.vue'
import DisplayBreadcrumbItem from './display/non-data-components/DisplayBreadcrumbItem.vue'
import DisplaySkeleton from './display/non-data-components/DisplaySkeleton.vue'
import DisplayImage from './display/data-components/DisplayImage.vue'
import DisplayCalendar from './display/non-data-components/DisplayCalendar.vue'
import DisplayCountdown from './display/non-data-components/DisplayCountdown.vue'

// ── DSL 标记：使组件可作为模板 DSL 子节点编译为 SparkNode ─────────────────────
markSparkTemplateNodeComponent(BuiltinActionButton, { nodeType: 'builtin-action' })
markSparkTemplateNodeComponent(FieldText, { nodeType: 'r-text' })
markSparkTemplateNodeComponent(FieldTextarea, { nodeType: 'r-textarea' })
markSparkTemplateNodeComponent(FieldHtmlEditor, { nodeType: 'r-html-editor' })
markSparkTemplateNodeComponent(FieldNumber, { nodeType: 'r-number' })
markSparkTemplateNodeComponent(FieldDate, { nodeType: 'r-date' })
markSparkTemplateNodeComponent(FieldSelect, { nodeType: 'r-select' })
markSparkTemplateNodeComponent(FieldMultiSelect, { nodeType: 'r-multi-select' })
markSparkTemplateNodeComponent(FieldRadio, { nodeType: 'r-radio' })
markSparkTemplateNodeComponent(FieldCheckbox, { nodeType: 'r-checkbox' })
markSparkTemplateNodeComponent(FieldCheckboxGroup, { nodeType: 'r-checkbox-group' })
markSparkTemplateNodeComponent(FieldSwitch, { nodeType: 'r-switch' })
markSparkTemplateNodeComponent(FieldSlider, { nodeType: 'r-slider' })
markSparkTemplateNodeComponent(FieldRate, { nodeType: 'r-rate' })
markSparkTemplateNodeComponent(FieldColor, { nodeType: 'r-color' })
markSparkTemplateNodeComponent(FieldIcon, { nodeType: 'r-icon' })
markSparkTemplateNodeComponent(FieldImage, { nodeType: 'r-image' })
markSparkTemplateNodeComponent(FieldFilePath, { nodeType: 'r-file-path' })
markSparkTemplateNodeComponent(FieldFileBrowser, { nodeType: 'r-file-browser' })
markSparkTemplateNodeComponent(FieldUpload, { nodeType: 'r-upload' })
markSparkTemplateNodeComponent(FieldEntityPicker, { nodeType: 'r-entity-picker' })
markSparkTemplateNodeComponent(FieldUserPicker, { nodeType: 'r-user-picker' })
markSparkTemplateNodeComponent(FieldDeptPicker, { nodeType: 'r-dept-picker' })
markSparkTemplateNodeComponent(FieldProductPicker, { nodeType: 'r-product-picker' })
markSparkTemplateNodeComponent(FieldCascader, { nodeType: 'r-cascader' })
markSparkTemplateNodeComponent(FieldTreeSelect, { nodeType: 'r-tree-select' })
markSparkTemplateNodeComponent(FieldTransfer, { nodeType: 'r-transfer' })
markSparkTemplateNodeComponent(FieldSegmented, { nodeType: 'r-segmented' })
markSparkTemplateNodeComponent(FieldCheckTag, { nodeType: 'r-check-tag' })
markSparkTemplateNodeComponent(FieldMention, { nodeType: 'r-mention' })
markSparkTemplateNodeComponent(FieldContextRenderer, { nodeType: 'r-column-group' })
markSparkTemplateNodeComponent(FieldTreeNodeSummary, { nodeType: 'r-tree-node-summary' })

// ── DSL 标记：布局/展示/反馈组件 ──────────────────────────────────────────────
markSparkTemplateNodeComponent(RendererRow, { nodeType: 'r-row' })
markSparkTemplateNodeComponent(RendererCol, { nodeType: 'r-col' })
markSparkTemplateNodeComponent(RendererCard, { nodeType: 'r-card' })
markSparkTemplateNodeComponent(RendererSpace, { nodeType: 'r-space' })
markSparkTemplateNodeComponent(RendererDivider, { nodeType: 'r-divider' })
markSparkTemplateNodeComponent(RendererButton, { nodeType: 'r-button' })
markSparkTemplateNodeComponent(RendererLink, { nodeType: 'r-link' })
markSparkTemplateNodeComponent(RendererPageHeader, { nodeType: 'r-page-header' })
markSparkTemplateNodeComponent(RendererDropdown, { nodeType: 'r-dropdown' })
markSparkTemplateNodeComponent(RendererTooltip, { nodeType: 'r-tooltip' })
markSparkTemplateNodeComponent(RendererPopover, { nodeType: 'r-popover' })
markSparkTemplateNodeComponent(RendererPopconfirm, { nodeType: 'r-popconfirm' })
markSparkTemplateNodeComponent(RendererBacktop, { nodeType: 'r-backtop' })
markSparkTemplateNodeComponent(RendererCarousel, { nodeType: 'r-carousel' })
markSparkTemplateNodeComponent(RendererCarouselItem, { nodeType: 'r-carousel-item' })
markSparkTemplateNodeComponent(RendererWatermark, { nodeType: 'r-watermark' })
markSparkTemplateNodeComponent(RendererAffix, { nodeType: 'r-affix' })
markSparkTemplateNodeComponent(RendererScrollbar, { nodeType: 'r-scrollbar' })
markSparkTemplateNodeComponent(RendererTour, { nodeType: 'r-tour' })
markSparkTemplateNodeComponent(RendererAnchor, { nodeType: 'r-anchor' })
markSparkTemplateNodeComponent(RendererAnchorLink, { nodeType: 'r-anchor-link' })
markSparkTemplateNodeComponent(DisplayStatistic, { nodeType: 'r-statistic' })
markSparkTemplateNodeComponent(DisplayProgress, { nodeType: 'r-progress' })
markSparkTemplateNodeComponent(DisplayTag, { nodeType: 'r-tag' })
markSparkTemplateNodeComponent(DisplayBadge, { nodeType: 'r-badge' })
markSparkTemplateNodeComponent(DisplayAvatar, { nodeType: 'r-avatar' })
markSparkTemplateNodeComponent(DisplayText, { nodeType: 'r-text-display' })
markSparkTemplateNodeComponent(DisplayPagination, { nodeType: 'r-pagination' })
markSparkTemplateNodeComponent(DisplayDescriptions, { nodeType: 'r-descriptions' })
markSparkTemplateNodeComponent(DisplayDescriptionsItem, { nodeType: 'r-descriptions-item' })
markSparkTemplateNodeComponent(DisplayTimeline, { nodeType: 'r-timeline' })
markSparkTemplateNodeComponent(DisplayTimelineItem, { nodeType: 'r-timeline-item' })
markSparkTemplateNodeComponent(DisplayAlert, { nodeType: 'r-alert' })
markSparkTemplateNodeComponent(DisplayEmpty, { nodeType: 'r-empty' })
markSparkTemplateNodeComponent(DisplayResult, { nodeType: 'r-result' })
markSparkTemplateNodeComponent(DisplayBreadcrumb, { nodeType: 'r-breadcrumb' })
markSparkTemplateNodeComponent(DisplayBreadcrumbItem, { nodeType: 'r-breadcrumb-item' })
markSparkTemplateNodeComponent(DisplaySkeleton, { nodeType: 'r-skeleton' })
markSparkTemplateNodeComponent(DisplayImage, { nodeType: 'display-image' })
markSparkTemplateNodeComponent(DisplayCalendar, { nodeType: 'display-calendar' })
markSparkTemplateNodeComponent(DisplayCountdown, { nodeType: 'display-countdown' })

// ── 支持组件 ──────────────────────────────────────────────────────────────────
export { default as SparkComponentRenderer } from './SparkComponentRenderer.vue'
export { default as SparkChild } from './support/SparkChild.js'
export { default as SparkChildrenBridge } from './support/SparkChildrenBridge.js'
export { default as SparkCodeEditor } from './support/SparkCodeEditor.vue'
export { default as SparkJsonEditor } from './support/SparkJsonEditor.vue'
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
export const ElButton = createTemplateDsl('builtin-action', 'SparkDslBuiltinActionButton')
export const RText = createTemplateDsl('r-text', 'RText')
export const RTextarea = createTemplateDsl('r-textarea', 'RTextarea')
export const RHtmlEditor = createTemplateDsl('r-html-editor', 'RHtmlEditor')
export const RNumber = createTemplateDsl('r-number', 'RNumber')
export const RDate = createTemplateDsl('r-date', 'RDate')
export const RSelect = createTemplateDsl('r-select', 'RSelect')
export const RMultiSelect = createTemplateDsl('r-multi-select', 'RMultiSelect')
export const RRadio = createTemplateDsl('r-radio', 'RRadio')
export const RCheckbox = createTemplateDsl('r-checkbox', 'RCheckbox')
export const RCheckboxGroup = createTemplateDsl('r-checkbox-group', 'RCheckboxGroup')
export const RSwitch = createTemplateDsl('r-switch', 'RSwitch')
export const RSlider = createTemplateDsl('r-slider', 'RSlider')
export const RRate = createTemplateDsl('r-rate', 'RRate')
export const RColor = createTemplateDsl('r-color', 'RColor')
export const RIcon = createTemplateDsl('r-icon', 'RIcon')
export const RImage = createTemplateDsl('r-image', 'RImage')
export const RFilePath = createTemplateDsl('r-file-path', 'RFilePath')
export const RFileBrowser = createTemplateDsl('r-file-browser', 'RFileBrowser')
export const RUpload = createTemplateDsl('r-upload', 'RUpload')
export const REntityPicker = createTemplateDsl('r-entity-picker', 'REntityPicker')
export const RUserPicker = createTemplateDsl('r-user-picker', 'RUserPicker')
export const RDeptPicker = createTemplateDsl('r-dept-picker', 'RDeptPicker')
export const RProductPicker = createTemplateDsl('r-product-picker', 'RProductPicker')
export const RCascader = createTemplateDsl('r-cascader', 'RCascader')
export const RTreeSelect = createTemplateDsl('r-tree-select', 'RTreeSelect')
export const RTransfer = createTemplateDsl('r-transfer', 'RTransfer')
export const RSegmented = createTemplateDsl('r-segmented', 'RSegmented')
export const RCheckTag = createTemplateDsl('r-check-tag', 'RCheckTag')
export const RMention = createTemplateDsl('r-mention', 'RMention')
export const RColumnGroup = createTemplateDsl('r-column-group', 'RColumnGroup')
export const RTreeNodeSummary = createTemplateDsl('r-tree-node-summary', 'RTreeNodeSummary')

// ── DSL 快捷名：布局/展示/反馈 ──────────────────────────────────────────────
export const RRow = createTemplateDsl('r-row', 'RRow')
export const RCol = createTemplateDsl('r-col', 'RCol')
export const RCard = createTemplateDsl('r-card', 'RCard')
export const RSpace = createTemplateDsl('r-space', 'RSpace')
export const RDivider = createTemplateDsl('r-divider', 'RDivider')
export const RButton = createTemplateDsl('r-button', 'RButton')
export const RLink = createTemplateDsl('r-link', 'RLink')
export const RPageHeader = createTemplateDsl('r-page-header', 'RPageHeader')
export const RDropdown = createTemplateDsl('r-dropdown', 'RDropdown')
export const RTooltip = createTemplateDsl('r-tooltip', 'RTooltip')
export const RPopover = createTemplateDsl('r-popover', 'RPopover')
export const RPopconfirm = createTemplateDsl('r-popconfirm', 'RPopconfirm')
export const RBacktop = createTemplateDsl('r-backtop', 'RBacktop')
export const RCarousel = createTemplateDsl('r-carousel', 'RCarousel')
export const RCarouselItem = createTemplateDsl('r-carousel-item', 'RCarouselItem')
export const RWatermark = createTemplateDsl('r-watermark', 'RWatermark')
export const RAffix = createTemplateDsl('r-affix', 'RAffix')
export const RScrollbar = createTemplateDsl('r-scrollbar', 'RScrollbar')
export const RTour = createTemplateDsl('r-tour', 'RTour')
export const RAnchor = createTemplateDsl('r-anchor', 'RAnchor')
export const RAnchorLink = createTemplateDsl('r-anchor-link', 'RAnchorLink')
export const RStatistic = createTemplateDsl('r-statistic', 'RStatistic')
export const RProgress = createTemplateDsl('r-progress', 'RProgress')
export const RTag = createTemplateDsl('r-tag', 'RTag')
export const RBadge = createTemplateDsl('r-badge', 'RBadge')
export const RAvatar = createTemplateDsl('r-avatar', 'RAvatar')
export const RTextDisplay = createTemplateDsl('r-text-display', 'RTextDisplay')
export const RPagination = createTemplateDsl('r-pagination', 'RPagination')
export const RDescriptions = createTemplateDsl('r-descriptions', 'RDescriptions')
export const RDescriptionsItem = createTemplateDsl('r-descriptions-item', 'RDescriptionsItem')
export const RTimeline = createTemplateDsl('r-timeline', 'RTimeline')
export const RTimelineItem = createTemplateDsl('r-timeline-item', 'RTimelineItem')
export const RAlert = createTemplateDsl('r-alert', 'RAlert')
export const REmpty = createTemplateDsl('r-empty', 'REmpty')
export const RResult = createTemplateDsl('r-result', 'RResult')
export const RBreadcrumb = createTemplateDsl('r-breadcrumb', 'RBreadcrumb')
export const RBreadcrumbItem = createTemplateDsl('r-breadcrumb-item', 'RBreadcrumbItem')
export const RSkeleton = createTemplateDsl('r-skeleton', 'RSkeleton')
export const RDisplayImage = createTemplateDsl('display-image', 'RDisplayImage')
export const RDisplayCalendar = createTemplateDsl('display-calendar', 'RDisplayCalendar')
export const RDisplayCountdown = createTemplateDsl('display-countdown', 'RDisplayCountdown')

// ── 容器 Renderer 组件 ───────────────────────────────────────────────────────
export { RendererTable }
export { default as RendererForm } from './containers/data-components/RendererForm/index.js'
export { default as RendererDetail } from './containers/data-components/RendererDetail/index.js'
export { default as RendererTree } from './containers/data-components/RendererTree/index.js'
export { default as RendererList } from './containers/data-components/RendererList/index.js'
export { default as RendererTabs } from './containers/non-data-components/RendererTabs/index.js'
export { default as RendererCollapse } from './containers/non-data-components/RendererCollapse/index.js'
export { default as RendererDialog } from './containers/non-data-components/RendererDialog/index.js'
export { default as RendererDrawer } from './containers/non-data-components/RendererDrawer/index.js'
export { default as RendererSteps } from './containers/non-data-components/RendererSteps/index.js'
export { default as RendererSection } from './containers/non-data-components/RendererSection/index.js'
export { default as RendererToolbar } from './containers/non-data-components/RendererToolbar.vue'
export { RendererRow }
export { RendererCol }
export { RendererCard }
export { RendererSpace }
export { RendererDivider }
export { RendererButton }
export { RendererLink }
export { RendererPageHeader }
export { RendererDropdown }
export { RendererTooltip }
export { RendererPopover }
export { RendererPopconfirm }
export { RendererBacktop }
export { RendererCarousel }
export { RendererCarouselItem }
export { RendererWatermark }
export { RendererAffix }
export { RendererScrollbar }
export { RendererTour }
export { RendererAnchor }
export { RendererAnchorLink }
export { BuiltinActionButton }
export { default as RendererFieldScope } from './containers/data-components/RendererFieldScope.vue'
export { default as RendererListItemScope } from './containers/data-components/RendererListItemScope.vue'

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

// ── 注册 & composable ────────────────────────────────────────────────────────
export { registerAllRenderers } from './register-renderers.js'
export { useFieldPermission } from './fields/composables.js'
