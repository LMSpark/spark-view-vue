/**
 * 一键注册所有内置 Renderer 容器 + 字段组件到 SPARK 注册表。
 *
 * 【注册策略】
 * 框架支持多条注册路径：
 *   1. 同步注册 — 本文件执行 registerAllRenderers() 方式 ← **当前生产路径**
 *   2. 异步组件 — 消费层显式 defineAsyncComponent(loader) 后写入 registry
 *   3. 自动扫描 — virtual:spark-components 插件自动生成 import.meta.glob 结果
 *
 * 架构说明：
 *   Core      — 首屏必需：数据容器 / 非数据容器 / 布局 / 核心字段 / Passthrough（同步注册）
 *   Extended  — 扩展组件：随内置注册表同步挂载
 *
 * Passthrough 组件由 barrel (`non-data-components/index`) 统一创建，
 * 此文件仅导入实例，不再本地调用 `createPassthrough()`。
 *
 * 内置组件全部由 registerAllRenderers() 显式注册；应用层的
 * virtual:spark-components 只负责业务扩展组件。
 */
import { Spark } from '../system/spark.js'

// ── 数据容器 ──
import {
  RendererTable, RendererForm, RendererDetail, RendererTree, RendererList,
} from './containers/data-views/index.js'

// ── 命名区域 ──
import {
  RendererFilter, RendererEditor, RendererHeader, RendererFooter, RendererTail,
  RendererFieldScope,
} from './containers/index.js'

// ── 非数据容器 + 布局 + Passthrough ──
import {
  RendererSection, RendererToolbar, RendererTabs, RendererTabPane, RendererCollapse,
  RendererCollapseItem, RendererDialog, RendererDrawer, RendererSteps, RendererStepItem, RendererButton, RendererLink,
  RendererCard, RendererSpace, RendererDivider, RendererDropdown,
  RendererTooltip, RendererPopover, RendererPopconfirm, RendererPageHeader,
  RendererTour, RendererAnchor, RendererAnchorLink,
  RendererButtonGroup, RendererContainer, RendererMain, RendererAside,
  RendererLayoutHeader, RendererLayoutFooter, RendererRow, RendererCol,
  RendererAffix, RendererBacktop, RendererScrollbar,
  RendererCarousel, RendererCarouselItem, RendererWatermark,
} from './containers/layout/index.js'

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
  DisplayText, DisplayTag, DisplayPagination, DisplayStatistic, DisplayImage,
  DisplayProgress, DisplayBadge, DisplayAvatar,
} from './display/data-components/index.js'
import {
  DisplayAlert,
  DisplayCalendar,
  DisplayCountdown,
  DisplayIcon,
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

// ── 支持组件 ──
import { SparkCodeEditor, SparkJsonEditor } from './editors/index.js'

// ═══════════════════════════════════════════════════════════════════════════════
// 注册表
// ═══════════════════════════════════════════════════════════════════════════════

type RegisteredComponent = Parameters<typeof Spark.register>[1]
type RegistrationEntry = readonly [string, RegisteredComponent]

/**
 * 同步注册清单：核心组件集合
 *
 * 这些组件在启动时直接导入并注册，以确保首屏路径稳定。
 */
const CORE_COMPONENTS: RegistrationEntry[] = [
  // 数据容器
  ['r-table', RendererTable],
  ['r-form', RendererForm],
  ['r-detail', RendererDetail],
  ['r-tree', RendererTree],
  ['r-list', RendererList],
  // 区域子组件
  ['r-field-scope', RendererFieldScope],
  ['r-filter', RendererFilter],
  ['r-editor', RendererEditor],
  ['r-header', RendererHeader],
  ['r-footer', RendererFooter],
  ['r-tail', RendererTail],
  // 核心非数据容器
  ['r-section', RendererSection],
  ['r-toolbar', RendererToolbar],
  ['r-tabs', RendererTabs],
  ['r-tab-pane', RendererTabPane],
  ['r-collapse', RendererCollapse],
  ['r-collapse-item', RendererCollapseItem],
  ['r-dialog', RendererDialog],
  ['r-drawer', RendererDrawer],
  ['r-steps', RendererSteps],
  ['r-step', RendererStepItem],
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
  ['display-image', DisplayImage],
  ['display-calendar', DisplayCalendar],
  ['display-countdown', DisplayCountdown],
  ['display-icon', DisplayIcon],
  // 非数据字段
  ['r-column-group', FieldContextRenderer],
  ['r-row-fragment', FieldContextRenderer],
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

/** 扩展组件：随内置注册表同步注册。 */
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
  // Core — 核心 + Passthrough
  for (const [type, component] of CORE_COMPONENTS) {
    Spark.register(type, component)
  }

  // Extended
  for (const [type, component] of EXTENDED_COMPONENTS) {
    Spark.register(type, component)
  }
}
