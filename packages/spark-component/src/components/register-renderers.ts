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
  RendererTable, RendererForm, RendererDetail, RendererTree, RendererList, RendererRowFragment,
} from './containers/data-components/index.js'

// ── 命名区域 ──
import {
  RendererActions, RendererFilter, RendererEditor, RendererHeader, RendererFooter, RendererTail,
} from './containers/index.js'

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
type RegistrationMeta = Record<string, unknown>
type RegistrationEntry = readonly [string, RegisteredComponent] | readonly [string, RegisteredComponent, RegistrationMeta]

/** 同步注册：核心 + Passthrough */
const CORE_COMPONENTS: RegistrationEntry[] = [
  // 数据容器（meta.childProps 声明可提升的子类型，绑定层据此将 children 中的匹配子节点提升为 props）
  ['r-table', RendererTable, { childProps: ['r-toolbar', 'r-actions', 'r-filter'] }],
  ['r-form', RendererForm, { childProps: ['r-toolbar'] }],
  ['r-detail', RendererDetail, { childProps: ['r-toolbar'] }],
  ['r-tree', RendererTree, { childProps: ['r-toolbar', 'r-actions', 'r-editor'] }],
  ['r-list', RendererList, { childProps: ['r-toolbar', 'r-actions'] }],
  ['r-row-fragment', RendererRowFragment],
  // 可提升子组件
  ['r-actions', RendererActions],
  ['r-filter', RendererFilter],
  ['r-editor', RendererEditor],
  ['r-header', RendererHeader],
  ['r-footer', RendererFooter],
  ['r-tail', RendererTail],
  // 内置操作
  ['builtin-action', BuiltinActionButton],
  // 核心非数据容器
  ['r-section', RendererSection, { childProps: ['r-header'] }],
  ['r-block', RendererSection, { childProps: ['r-header'] }],
  ['r-toolbar', RendererToolbar, { childProps: ['r-tail'] }],
  ['r-menu', RendererToolbar, { childProps: ['r-tail'] }],
  ['r-tabs', RendererTabs, { childProps: ['r-toolbar'] }],
  ['r-collapse', RendererCollapse, { childProps: ['r-toolbar'] }],
  ['r-dialog', RendererDialog, { childProps: ['r-header', 'r-footer'] }],
  ['r-drawer', RendererDrawer, { childProps: ['r-header', 'r-footer'] }],
  ['r-steps', RendererSteps, { childProps: ['r-toolbar'] }],
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
  // Sync — 核心 + Passthrough（含可选 meta）
  for (const entry of CORE_COMPONENTS) {
    const [type, component, meta] = entry
    Spark.register(type, component, meta)
  }
  // Async — Spark.register 检测到 function 自动包装 defineAsyncComponent
  for (const [type, loader] of ASYNC_COMPONENTS) {
    Spark.register(type, loader)
  }
}
