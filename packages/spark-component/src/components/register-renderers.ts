/**
 * 一键注册所有内置 Renderer 容器 + 字段组件到 SPARK 注册表。
 *
 * 架构：
 *   Core      — 首屏必需：数据容器 / 非数据容器 / 布局 / 核心字段 / Passthrough
 *   Extended  — 扩展组件：在 classic 注册路径中同步挂载（避免与 smart 自动注册产生无效动态导入告警）
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
  RendererTable, RendererForm, RendererDetail, RendererTree, RendererList, RendererRowFragment,
} from './containers/data-components/index.js'

// ── 命名区域 ──
import {
  RendererFilter, RendererEditor, RendererHeader, RendererFooter, RendererTail,
} from './containers/index.js'
import RendererHostRowScope from './containers/support/RendererHostRowScope.vue'

// ── 非数据容器 + 布局 + Passthrough ──
import {
  RendererSection, RendererToolbar, RendererTabs, RendererCollapse,
  RendererDialog, RendererDrawer, RendererSteps, RendererButton, RendererLink,
  RendererCard, RendererSpace, RendererDivider, RendererDropdown,
  RendererTooltip, RendererPopover, RendererPopconfirm, RendererPageHeader,
  RendererTour, RendererAnchor, RendererAnchorLink,
  RendererButtonGroup, RendererContainer, RendererMain, RendererAside,
  RendererLayoutHeader, RendererLayoutFooter, RendererRow, RendererCol,
  RendererAffix, RendererBacktop, RendererScrollbar,
  RendererCarousel, RendererCarouselItem, RendererWatermark,
} from './containers/non-data-components/index.js'

// ── 核心字段 ──
import {
  FieldText, FieldTextarea, FieldNumber, FieldDate, FieldSelect,
  FieldMultiSelect, FieldRadio, FieldCheckbox, FieldCheckboxGroup, FieldSwitch,
  FieldHtmlEditor, FieldSlider, FieldRate, FieldColor, FieldIcon, FieldImage,
  FieldFilePath, FieldFileBrowser, FieldUpload, FieldEntityPicker, FieldUserPicker,
  FieldDeptPicker, FieldProductPicker, FieldCascader, FieldTreeSelect, FieldTransfer,
  FieldSegmented, FieldCheckTag, FieldMention, FieldTimePicker, FieldTimeSelect,
  FieldAutocomplete,
} from './fields/data-components/index.js'

// ── 非数据字段 ──
import {
  FieldContextRenderer, FieldTreeNodeSummary,
} from './fields/non-data-components/index.js'

// ── 核心展示 ──
import {
  DisplayText, DisplayTag, DisplayPagination, DisplayStatistic,
  DisplayProgress, DisplayBadge, DisplayAvatar,
} from './display/data-components/index.js'
import {
  DisplayAlert,
  DisplayDescriptions,
  DisplayDescriptionsItem,
  DisplayTimeline,
  DisplayTimelineItem,
  DisplayEmpty,
  DisplayResult,
  DisplayBreadcrumb,
  DisplayBreadcrumbItem,
  DisplaySkeleton,
} from './display/non-data-components/index.js'

// ── 支持组件（无 barrel）──
import SparkCodeEditor from './support/SparkCodeEditor.vue'
import SparkJsonEditor from './support/SparkJsonEditor.vue'

// ═══════════════════════════════════════════════════════════════════════════════
// 注册表
// ═══════════════════════════════════════════════════════════════════════════════

type RegisteredComponent = Parameters<typeof Spark.register>[1]
type RegistrationMeta = Record<string, unknown>
type RegistrationEntry = readonly [string, RegisteredComponent] | readonly [string, RegisteredComponent, RegistrationMeta]

/** 同步注册：核心 + Passthrough */
const CORE_COMPONENTS: RegistrationEntry[] = [
  // 数据容器（区域子组件通过自身 meta.liftAs 声明角色，容器无需枚举子类型）
  ['r-table', RendererTable],
  ['r-form', RendererForm],
  ['r-detail', RendererDetail],
  ['r-tree', RendererTree],
  ['r-list', RendererList],
  ['r-row-fragment', RendererRowFragment],
  // 区域子组件（meta.liftAs 声明提升后的 prop 名，绑定层据此将其提升为容器 props）
  ['r-actions', RendererHostRowScope, { liftAs: 'actions' }],
  ['r-filter', RendererFilter, { liftAs: 'filter' }],
  ['r-editor', RendererEditor, { liftAs: 'editor' }],
  ['r-header', RendererHeader, { liftAs: 'header' }],
  ['r-footer', RendererFooter, { liftAs: 'footer' }],
  ['r-tail', RendererTail, { liftAs: 'tail' }],
  // 核心非数据容器
  ['r-section', RendererSection],
  ['r-block', RendererSection],
  ['r-toolbar', RendererToolbar, { liftAs: 'toolbar' }],
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

/** 扩展组件：classic 路径下同步注册（避免与 smart 自动注册产生重复动态导入路径） */
const EXTENDED_COMPONENTS: ReadonlyArray<readonly [string, RegisteredComponent]> = [
  // 扩展容器
  ['r-popconfirm', RendererPopconfirm],
  ['r-page-header', RendererPageHeader],
  ['r-tour', RendererTour],
  ['r-anchor', RendererAnchor],
  ['r-anchor-link', RendererAnchorLink],
  // 扩展字段
  ['r-html-editor', FieldHtmlEditor],
  ['r-slider', FieldSlider],
  ['r-rate', FieldRate],
  ['r-color', FieldColor],
  ['r-icon', FieldIcon],
  ['r-image', FieldImage],
  ['r-file-path', FieldFilePath],
  ['r-file-browser', FieldFileBrowser],
  ['r-upload', FieldUpload],
  ['r-entity-picker', FieldEntityPicker],
  ['r-user-picker', FieldUserPicker],
  ['r-dept-picker', FieldDeptPicker],
  ['r-product-picker', FieldProductPicker],
  ['r-cascader', FieldCascader],
  ['r-tree-select', FieldTreeSelect],
  ['r-transfer', FieldTransfer],
  ['r-segmented', FieldSegmented],
  ['r-check-tag', FieldCheckTag],
  ['r-mention', FieldMention],
  ['r-time-picker', FieldTimePicker],
  ['r-time-select', FieldTimeSelect],
  ['r-autocomplete', FieldAutocomplete],
  // 扩展展示
  ['r-progress', DisplayProgress],
  ['r-badge', DisplayBadge],
  ['r-avatar', DisplayAvatar],
  ['r-descriptions', DisplayDescriptions],
  ['r-descriptions-item', DisplayDescriptionsItem],
  ['r-timeline', DisplayTimeline],
  ['r-timeline-item', DisplayTimelineItem],
  ['r-empty', DisplayEmpty],
  ['r-result', DisplayResult],
  ['r-breadcrumb', DisplayBreadcrumb],
  ['r-breadcrumb-item', DisplayBreadcrumbItem],
  ['r-skeleton', DisplaySkeleton],
]

// ═══════════════════════════════════════════════════════════════════════════════
// 公共 API
// ═══════════════════════════════════════════════════════════════════════════════

export function registerAllRenderers(): void {
  // Core — 核心 + Passthrough（含可选 meta）
  for (const entry of CORE_COMPONENTS) {
    const [type, component, meta] = entry
    Spark.register(type, component, meta)
  }

  // Extended — classic 路径下同步注册
  for (const [type, component] of EXTENDED_COMPONENTS) {
    Spark.register(type, component)
  }
}
