/**
 * 一键注册所有内置 Renderer 容器 + 字段组件到 SPARK 注册表
 *
 * 容器组件当前也采用同步注册。
 * 它们已经通过公共入口被同步导出；若这里继续使用动态 import，
 * 只会触发 Vite 的 mixed static/dynamic import 告警，而没有真实懒加载收益。
 */
import { Spark } from '../system/spark.js'

// ── 容器组件（同步导入） ──
import RendererTable from './containers/data-components/RendererTable/index.js'
import RendererForm from './containers/data-components/RendererForm/index.js'
import RendererDetail from './containers/data-components/RendererDetail/index.js'
import RendererTree from './containers/data-components/RendererTree/index.js'
import RendererList from './containers/data-components/RendererList/index.js'
import RendererTabs from './containers/non-data-components/RendererTabs/index.js'
import RendererCollapse from './containers/non-data-components/RendererCollapse/index.js'
import RendererDialog from './containers/non-data-components/RendererDialog/index.js'
import RendererDrawer from './containers/non-data-components/RendererDrawer/index.js'
import RendererSteps from './containers/non-data-components/RendererSteps/index.js'
import RendererSection from './containers/non-data-components/RendererSection/index.js'
import RendererToolbar from './containers/non-data-components/RendererToolbar.vue'
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
import BuiltinActionButton from './containers/BuiltinActionButton.vue'

// ── 展示组件（同步导入） ──
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

// ── Dock 组件（同步导入） ──
import DockActions from './containers/docks/DockActions.vue'
import DockFilter from './containers/docks/DockFilter.vue'
import DockEditor from './containers/docks/DockEditor.vue'
import DockHeader from './containers/docks/DockHeader.vue'
import DockFooter from './containers/docks/DockFooter.vue'
import DockTail from './containers/docks/DockTail.vue'

// ── 字段组件（同步导入） ──
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
import TreeNodeSummary from './fields/non-data-components/TreeNodeSummary.vue'

export function registerAllRenderers(): void {
  // ── 容器组件：同步注册（与公共静态导出保持一致） ──
  Spark.register('r-table', RendererTable)
  Spark.register('r-form', RendererForm)
  Spark.register('r-detail', RendererDetail)
  Spark.register('r-tree', RendererTree)
  Spark.register('r-list', RendererList)
  Spark.register('r-tabs', RendererTabs)
  Spark.register('r-collapse', RendererCollapse)
  Spark.register('r-dialog', RendererDialog)
  Spark.register('r-drawer', RendererDrawer)
  Spark.register('r-steps', RendererSteps)
  Spark.register('r-section', RendererSection)
  Spark.register('r-block', RendererSection)
  Spark.register('r-toolbar', RendererToolbar)
  Spark.register('r-menu', RendererToolbar)
  Spark.register('r-row', RendererRow)
  Spark.register('r-col', RendererCol)
  Spark.register('r-card', RendererCard)
  Spark.register('r-space', RendererSpace)
  Spark.register('r-divider', RendererDivider)
  Spark.register('r-button', RendererButton)
  Spark.register('r-link', RendererLink)
  Spark.register('r-page-header', RendererPageHeader)
  Spark.register('r-dropdown', RendererDropdown)
  Spark.register('r-tooltip', RendererTooltip)
  Spark.register('r-popover', RendererPopover)
  Spark.register('r-popconfirm', RendererPopconfirm)
  Spark.register('r-backtop', RendererBacktop)
  Spark.register('r-carousel', RendererCarousel)
  Spark.register('r-carousel-item', RendererCarouselItem)
  Spark.register('r-watermark', RendererWatermark)
  Spark.register('r-affix', RendererAffix)
  Spark.register('r-scrollbar', RendererScrollbar)
  Spark.register('r-tour', RendererTour)
  Spark.register('r-anchor', RendererAnchor)
  Spark.register('r-anchor-link', RendererAnchorLink)
  Spark.register('builtin-action', BuiltinActionButton)

  // ── 展示组件：数据驱动 + 非数据驱动 ──
  Spark.register('r-statistic', DisplayStatistic)
  Spark.register('r-progress', DisplayProgress)
  Spark.register('r-tag', DisplayTag)
  Spark.register('r-badge', DisplayBadge)
  Spark.register('r-avatar', DisplayAvatar)
  Spark.register('r-text-display', DisplayText)
  Spark.register('r-pagination', DisplayPagination)
  Spark.register('r-descriptions', DisplayDescriptions)
  Spark.register('r-descriptions-item', DisplayDescriptionsItem)
  Spark.register('r-timeline', DisplayTimeline)
  Spark.register('r-timeline-item', DisplayTimelineItem)
  Spark.register('r-alert', DisplayAlert)
  Spark.register('r-empty', DisplayEmpty)
  Spark.register('r-result', DisplayResult)
  Spark.register('r-breadcrumb', DisplayBreadcrumb)
  Spark.register('r-breadcrumb-item', DisplayBreadcrumbItem)
  Spark.register('r-skeleton', DisplaySkeleton)
  Spark.register('display-image', DisplayImage)
  Spark.register('display-calendar', DisplayCalendar)
  Spark.register('display-countdown', DisplayCountdown)

  // ── Dock 组件：容器内由容器提取、独立使用正常渲染 ──
  Spark.register('r-actions', DockActions)
  Spark.register('r-filter', DockFilter)
  Spark.register('r-editor', DockEditor)
  Spark.register('r-header', DockHeader)
  Spark.register('r-footer', DockFooter)
  Spark.register('r-tail', DockTail)

  // ── 字段组件：同步注册（el-table 要求列组件同步就绪） ──
  Spark.register('r-text', FieldText)
  Spark.register('r-textarea', FieldTextarea)
  Spark.register('r-html-editor', FieldHtmlEditor)
  Spark.register('r-number', FieldNumber)
  Spark.register('r-date', FieldDate)
  Spark.register('r-select', FieldSelect)
  Spark.register('r-multi-select', FieldMultiSelect)
  Spark.register('r-radio', FieldRadio)
  Spark.register('r-checkbox', FieldCheckbox)
  Spark.register('r-checkbox-group', FieldCheckboxGroup)
  Spark.register('r-switch', FieldSwitch)
  Spark.register('r-slider', FieldSlider)
  Spark.register('r-rate', FieldRate)
  Spark.register('r-color', FieldColor)
  Spark.register('r-icon', FieldIcon)
  Spark.register('r-image', FieldImage)
  Spark.register('r-file-path', FieldFilePath)
  Spark.register('r-file-browser', FieldFileBrowser)
  Spark.register('r-upload', FieldUpload)
  Spark.register('r-entity-picker', FieldEntityPicker)
  Spark.register('r-user-picker', FieldUserPicker)
  Spark.register('r-dept-picker', FieldDeptPicker)
  Spark.register('r-product-picker', FieldProductPicker)
  Spark.register('r-cascader', FieldCascader)
  Spark.register('r-tree-select', FieldTreeSelect)
  Spark.register('r-transfer', FieldTransfer)
  Spark.register('r-segmented', FieldSegmented)
  Spark.register('r-check-tag', FieldCheckTag)
  Spark.register('r-mention', FieldMention)
  Spark.register('r-column-group', FieldContextRenderer)
  Spark.register('r-tree-node-summary', TreeNodeSummary)
}
