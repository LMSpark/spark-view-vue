<<<<<<< Updated upstream
/**
 * 一键注册所有内置 Renderer 容器 + 字段组件到 SPARK 注册表。
 *
 * 架构：
 *   Sync   — 首屏必需：数据容器 / 非数据容器 / 布局 / 核心字段 / Passthrough
 *   Async  — 异步 `() => import()` 按需加载：低频容器 / 扩展字段 / 展示组件
 *
 * Passthrough 组件由 barrel (`non-data-components/index`) 统一创建，
 * 此文件仅导入实例，不再本地调用 `createPassthrough()`。
 *
 * display-image / display-calendar / display-countdown / display-icon / ai-studio-panel
 * 由 virtual:spark-components 自动扫描注册（文件名 = 注册名），无需在此重复。
 */
import { Spark } from '../system/spark.js'

// ── 数据容器 ──
import {
  RendererTable, RendererForm, RendererDetail, RendererTree, RendererList,
} from './containers/data-components/index.js'

// ── Dock ──
import {
  DockActions, DockFilter, DockEditor, DockHeader, DockFooter, DockTail,
} from './containers/docks/index.js'

// ── 内置操作按钮 ──
import BuiltinActionButton from './containers/BuiltinActionButton.vue'

// ── 非数据容器 + 布局 + Passthrough ──
import {
  RendererSection, RendererToolbar, RendererTabs, RendererCollapse,
  RendererDialog, RendererDrawer, RendererSteps, RendererButton, RendererLink,
  RendererCard, RendererSpace, RendererDivider, RendererDropdown,
  RendererTooltip, RendererPopover,
  RendererButtonGroup, RendererContainer, RendererMain, RendererAside,
  RendererLayoutHeader, RendererLayoutFooter, RendererRow, RendererCol,
  RendererAffix, RendererBacktop, RendererScrollbar,
  RendererCarousel, RendererCarouselItem, RendererWatermark,
} from './containers/non-data-components/index.js'

// ── 核心字段 ──
import {
  FieldText, FieldTextarea, FieldNumber, FieldDate, FieldSelect,
  FieldMultiSelect, FieldRadio, FieldCheckbox, FieldCheckboxGroup, FieldSwitch,
} from './fields/data-components/index.js'

// ── 非数据字段 ──
import {
  FieldContextRenderer, FieldTreeNodeSummary,
} from './fields/non-data-components/index.js'

// ── 核心展示 ──
import {
  DisplayText, DisplayTag, DisplayPagination, DisplayStatistic,
} from './display/data-components/index.js'
import { DisplayAlert } from './display/non-data-components/index.js'

// ── 支持组件（无 barrel）──
import SparkCodeEditor from './support/SparkCodeEditor.vue'
import SparkJsonEditor from './support/SparkJsonEditor.vue'

// ═══════════════════════════════════════════════════════════════════════════════
// 注册表
// ═══════════════════════════════════════════════════════════════════════════════

type RegisteredComponent = Parameters<typeof Spark.register>[1]
type RegistrationEntry = readonly [string, RegisteredComponent]

/** 同步注册：核心 + Passthrough */
const CORE_COMPONENTS: RegistrationEntry[] = [
  // 数据容器
  ['r-table', RendererTable],
  ['r-form', RendererForm],
  ['r-detail', RendererDetail],
  ['r-tree', RendererTree],
  ['r-list', RendererList],
  // Dock
  ['r-actions', DockActions],
  ['r-filter', DockFilter],
  ['r-editor', DockEditor],
  ['r-header', DockHeader],
  ['r-footer', DockFooter],
  ['r-tail', DockTail],
  // 内置操作
  ['builtin-action', BuiltinActionButton],
  // 核心非数据容器
  ['r-section', RendererSection],
  ['r-block', RendererSection],
  ['r-toolbar', RendererToolbar],
  ['r-menu', RendererToolbar],
  ['r-tabs', RendererTabs],
  ['r-collapse', RendererCollapse],
  ['r-dialog', RendererDialog],
  ['r-drawer', RendererDrawer],
  ['r-steps', RendererSteps],
  ['r-button', RendererButton],
  ['r-link', RendererLink],
  // 核心布局
  ['r-card', RendererCard],
  ['r-space', RendererSpace],
  ['r-divider', RendererDivider],
  ['r-dropdown', RendererDropdown],
  ['r-tooltip', RendererTooltip],
  ['r-popover', RendererPopover],
  // 核心字段
  ['r-text', FieldText],
  ['r-textarea', FieldTextarea],
  ['r-number', FieldNumber],
  ['r-date', FieldDate],
  ['r-select', FieldSelect],
  ['r-multi-select', FieldMultiSelect],
  ['r-radio', FieldRadio],
  ['r-checkbox', FieldCheckbox],
  ['r-checkbox-group', FieldCheckboxGroup],
  ['r-switch', FieldSwitch],
  // 核心展示
  ['r-text-display', DisplayText],
  ['r-tag', DisplayTag],
  ['r-pagination', DisplayPagination],
  ['r-statistic', DisplayStatistic],
  ['r-alert', DisplayAlert],
  // 非数据字段
  ['r-column-group', FieldContextRenderer],
  ['r-tree-node-summary', FieldTreeNodeSummary],
  // 支持
  ['code-editor', SparkCodeEditor],
  ['json-editor', SparkJsonEditor],
  // Passthrough（barrel 工厂实例）
  ['r-button-group', RendererButtonGroup],
  ['r-container', RendererContainer],
  ['r-main', RendererMain],
  ['r-aside', RendererAside],
  ['r-layout-header', RendererLayoutHeader],
  ['r-layout-footer', RendererLayoutFooter],
  ['r-row', RendererRow],
  ['r-col', RendererCol],
  ['r-affix', RendererAffix],
  ['r-backtop', RendererBacktop],
  ['r-scrollbar', RendererScrollbar],
  ['r-carousel', RendererCarousel],
  ['r-carousel-item', RendererCarouselItem],
  ['r-watermark', RendererWatermark],
]

/** Tier 2: 异步按需注册 — Spark.register 检测到 function 自动包装 defineAsyncComponent */
const ASYNC_COMPONENTS: ReadonlyArray<readonly [string, () => Promise<{ default: unknown }>]> = [
  // 扩展容器
  ['r-popconfirm', () => import('./containers/non-data-components/RendererPopconfirm.vue')],
  ['r-page-header', () => import('./containers/non-data-components/RendererPageHeader.vue')],
  ['r-tour', () => import('./containers/non-data-components/RendererTour.vue')],
  ['r-anchor', () => import('./containers/non-data-components/RendererAnchor.vue')],
  ['r-anchor-link', () => import('./containers/non-data-components/RendererAnchorLink.vue')],
  // 扩展字段
  ['r-html-editor', () => import('./fields/data-components/FieldHtmlEditor.vue')],
  ['r-slider', () => import('./fields/data-components/FieldSlider.vue')],
  ['r-rate', () => import('./fields/data-components/FieldRate.vue')],
  ['r-color', () => import('./fields/data-components/FieldColor.vue')],
  ['r-icon', () => import('./fields/data-components/FieldIcon.vue')],
  ['r-image', () => import('./fields/data-components/FieldImage.vue')],
  ['r-file-path', () => import('./fields/data-components/FieldFilePath.vue')],
  ['r-file-browser', () => import('./fields/data-components/FieldFileBrowser.vue')],
  ['r-upload', () => import('./fields/data-components/FieldUpload.vue')],
  ['r-entity-picker', () => import('./fields/data-components/FieldEntityPicker.vue')],
  ['r-user-picker', () => import('./fields/data-components/FieldUserPicker.vue')],
  ['r-dept-picker', () => import('./fields/data-components/FieldDeptPicker.vue')],
  ['r-product-picker', () => import('./fields/data-components/FieldProductPicker.vue')],
  ['r-cascader', () => import('./fields/data-components/FieldCascader.vue')],
  ['r-tree-select', () => import('./fields/data-components/FieldTreeSelect.vue')],
  ['r-transfer', () => import('./fields/data-components/FieldTransfer.vue')],
  ['r-segmented', () => import('./fields/data-components/FieldSegmented.vue')],
  ['r-check-tag', () => import('./fields/data-components/FieldCheckTag.vue')],
  ['r-mention', () => import('./fields/data-components/FieldMention.vue')],
  ['r-time-picker', () => import('./fields/data-components/FieldTimePicker.vue')],
  ['r-time-select', () => import('./fields/data-components/FieldTimeSelect.vue')],
  ['r-autocomplete', () => import('./fields/data-components/FieldAutocomplete.vue')],
  // 扩展展示
  ['r-progress', () => import('./display/data-components/DisplayProgress.vue')],
  ['r-badge', () => import('./display/data-components/DisplayBadge.vue')],
  ['r-avatar', () => import('./display/data-components/DisplayAvatar.vue')],
  ['r-descriptions', () => import('./display/non-data-components/DisplayDescriptions.vue')],
  ['r-descriptions-item', () => import('./display/non-data-components/DisplayDescriptionsItem.vue')],
  ['r-timeline', () => import('./display/non-data-components/DisplayTimeline.vue')],
  ['r-timeline-item', () => import('./display/non-data-components/DisplayTimelineItem.vue')],
  ['r-empty', () => import('./display/non-data-components/DisplayEmpty.vue')],
  ['r-result', () => import('./display/non-data-components/DisplayResult.vue')],
  ['r-breadcrumb', () => import('./display/non-data-components/DisplayBreadcrumb.vue')],
  ['r-breadcrumb-item', () => import('./display/non-data-components/DisplayBreadcrumbItem.vue')],
  ['r-skeleton', () => import('./display/non-data-components/DisplaySkeleton.vue')],
]

// ═══════════════════════════════════════════════════════════════════════════════
// 公共 API
// ═══════════════════════════════════════════════════════════════════════════════

export function registerAllRenderers(): void {
  // Sync — 核心 + Passthrough
  for (const [type, component] of CORE_COMPONENTS) {
    Spark.register(type, component)
  }
  // Async — Spark.register 检测到 function 自动包装 defineAsyncComponent
  for (const [type, loader] of ASYNC_COMPONENTS) {
    Spark.register(type, loader)
  }
}
=======
/**
 * 一键注册所有内置 Renderer 容器 + 字段组件到 SPARK 注册表
 *
 * 容器组件当前也采用同步注册。
 * 它们已经通过公共入口被同步导出；若这里继续使用动态 import，
 * 只会触发 Vite 的 mixed static/dynamic import 告警，而没有真实懒加载收益。
 */
import { Spark } from '../system/spark.js'

// ── 容器组件（同步导入） ──
import RendererTable from './containers/data-components/RendererTable.vue'
import RendererForm from './containers/data-components/RendererForm.vue'
import RendererDetail from './containers/data-components/RendererDetail.vue'
import RendererTree from './containers/data-components/RendererTree.vue'
import RendererList from './containers/data-components/RendererList.vue'
import RendererTabs from './containers/non-data-components/RendererTabs.vue'
import RendererCollapse from './containers/non-data-components/RendererCollapse.vue'
import RendererDialog from './containers/non-data-components/RendererDialog.vue'
import RendererDrawer from './containers/non-data-components/RendererDrawer.vue'
import RendererSteps from './containers/non-data-components/RendererSteps.vue'
import RendererSection from './containers/non-data-components/RendererSection.vue'
import RendererToolbar from './containers/non-data-components/RendererToolbar.vue'

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
  Spark.register('r-column-group', FieldContextRenderer)
  Spark.register('r-tree-node-summary', TreeNodeSummary)
}
>>>>>>> Stashed changes
