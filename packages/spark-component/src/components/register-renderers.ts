/**
 * 一键注册所有内置 Renderer 容器 + 字段组件到 SPARK 注册表。
 *
 * 架构：全部按需 `() => import()` 动态加载，Spark.register 检测到函数自动包装
 * defineAsyncComponent。首屏不再静态导入任何组件模块，由 Vite 按页面实际用量拆 chunk。
 *
 * Passthrough 组件（工厂生成）通过 barrel index 的命名导出按需引用。
 *
 * display-image / display-calendar / display-countdown / display-icon / ai-studio-panel
 * 由 virtual:spark-components 自动扫描注册（文件名 = 注册名），无需在此重复。
 */
import { Spark } from '../system/spark.js'

type AsyncEntry = readonly [string, () => Promise<{ default: unknown }>]

/** 通过 barrel 命名导出的异步加载辅助 */
const fromBarrel = <T>(
  loader: () => Promise<T>,
  key: keyof T,
): (() => Promise<{ default: unknown }>) =>
  () => loader().then(m => ({ default: m[key] as unknown }))

// ── barrel 异步工厂 ──
const dataContainers = () => import('./containers/data-components/index.js')
const docks = () => import('./containers/docks/index.js')
const nonDataContainers = () => import('./containers/non-data-components/index.js')
const dataFields = () => import('./fields/data-components/index.js')
const nonDataFields = () => import('./fields/non-data-components/index.js')
const dataDisplay = () => import('./display/data-components/index.js')
const nonDataDisplay = () => import('./display/non-data-components/index.js')

const ALL_COMPONENTS: AsyncEntry[] = [
  // ── 数据容器 ──
  ['r-table',   fromBarrel(dataContainers, 'RendererTable')],
  ['r-form',    fromBarrel(dataContainers, 'RendererForm')],
  ['r-detail',  fromBarrel(dataContainers, 'RendererDetail')],
  ['r-tree',    fromBarrel(dataContainers, 'RendererTree')],
  ['r-list',    fromBarrel(dataContainers, 'RendererList')],

  // ── Dock ──
  ['r-actions', fromBarrel(docks, 'DockActions')],
  ['r-filter',  fromBarrel(docks, 'DockFilter')],
  ['r-editor',  fromBarrel(docks, 'DockEditor')],
  ['r-header',  fromBarrel(docks, 'DockHeader')],
  ['r-footer',  fromBarrel(docks, 'DockFooter')],
  ['r-tail',    fromBarrel(docks, 'DockTail')],

  // ── 内置操作 ──
  ['builtin-action', () => import('./containers/BuiltinActionButton.vue')],

  // ── 非数据容器 ──
  ['r-section',  fromBarrel(nonDataContainers, 'RendererSection')],
  ['r-block',    fromBarrel(nonDataContainers, 'RendererSection')],
  ['r-toolbar',  fromBarrel(nonDataContainers, 'RendererToolbar')],
  ['r-menu',     fromBarrel(nonDataContainers, 'RendererToolbar')],
  ['r-tabs',     fromBarrel(nonDataContainers, 'RendererTabs')],
  ['r-collapse', fromBarrel(nonDataContainers, 'RendererCollapse')],
  ['r-dialog',   fromBarrel(nonDataContainers, 'RendererDialog')],
  ['r-drawer',   fromBarrel(nonDataContainers, 'RendererDrawer')],
  ['r-steps',    fromBarrel(nonDataContainers, 'RendererSteps')],
  ['r-button',   fromBarrel(nonDataContainers, 'RendererButton')],
  ['r-link',     fromBarrel(nonDataContainers, 'RendererLink')],
  ['r-popconfirm',  fromBarrel(nonDataContainers, 'RendererPopconfirm')],
  ['r-page-header', fromBarrel(nonDataContainers, 'RendererPageHeader')],
  ['r-tour',        fromBarrel(nonDataContainers, 'RendererTour')],
  ['r-anchor',      fromBarrel(nonDataContainers, 'RendererAnchor')],
  ['r-anchor-link', fromBarrel(nonDataContainers, 'RendererAnchorLink')],

  // ── 布局 ──
  ['r-card',     fromBarrel(nonDataContainers, 'RendererCard')],
  ['r-space',    fromBarrel(nonDataContainers, 'RendererSpace')],
  ['r-divider',  fromBarrel(nonDataContainers, 'RendererDivider')],
  ['r-dropdown', fromBarrel(nonDataContainers, 'RendererDropdown')],
  ['r-tooltip',  fromBarrel(nonDataContainers, 'RendererTooltip')],
  ['r-popover',  fromBarrel(nonDataContainers, 'RendererPopover')],

  // ── Passthrough（barrel 工厂实例）──
  ['r-button-group',   fromBarrel(nonDataContainers, 'RendererButtonGroup')],
  ['r-container',      fromBarrel(nonDataContainers, 'RendererContainer')],
  ['r-main',           fromBarrel(nonDataContainers, 'RendererMain')],
  ['r-aside',          fromBarrel(nonDataContainers, 'RendererAside')],
  ['r-layout-header',  fromBarrel(nonDataContainers, 'RendererLayoutHeader')],
  ['r-layout-footer',  fromBarrel(nonDataContainers, 'RendererLayoutFooter')],
  ['r-row',            fromBarrel(nonDataContainers, 'RendererRow')],
  ['r-col',            fromBarrel(nonDataContainers, 'RendererCol')],
  ['r-affix',          fromBarrel(nonDataContainers, 'RendererAffix')],
  ['r-backtop',        fromBarrel(nonDataContainers, 'RendererBacktop')],
  ['r-scrollbar',      fromBarrel(nonDataContainers, 'RendererScrollbar')],
  ['r-carousel',       fromBarrel(nonDataContainers, 'RendererCarousel')],
  ['r-carousel-item',  fromBarrel(nonDataContainers, 'RendererCarouselItem')],
  ['r-watermark',      fromBarrel(nonDataContainers, 'RendererWatermark')],

  // ── 核心字段 ──
  ['r-text',           fromBarrel(dataFields, 'FieldText')],
  ['r-textarea',       fromBarrel(dataFields, 'FieldTextarea')],
  ['r-number',         fromBarrel(dataFields, 'FieldNumber')],
  ['r-date',           fromBarrel(dataFields, 'FieldDate')],
  ['r-select',         fromBarrel(dataFields, 'FieldSelect')],
  ['r-multi-select',   fromBarrel(dataFields, 'FieldMultiSelect')],
  ['r-radio',          fromBarrel(dataFields, 'FieldRadio')],
  ['r-checkbox',       fromBarrel(dataFields, 'FieldCheckbox')],
  ['r-checkbox-group', fromBarrel(dataFields, 'FieldCheckboxGroup')],
  ['r-switch',         fromBarrel(dataFields, 'FieldSwitch')],

  // ── 扩展字段 ──
  ['r-html-editor',    () => import('./fields/data-components/FieldHtmlEditor.vue')],
  ['r-slider',         () => import('./fields/data-components/FieldSlider.vue')],
  ['r-rate',           () => import('./fields/data-components/FieldRate.vue')],
  ['r-color',          () => import('./fields/data-components/FieldColor.vue')],
  ['r-icon',           () => import('./fields/data-components/FieldIcon.vue')],
  ['r-image',          () => import('./fields/data-components/FieldImage.vue')],
  ['r-file-path',      () => import('./fields/data-components/FieldFilePath.vue')],
  ['r-file-browser',   () => import('./fields/data-components/FieldFileBrowser.vue')],
  ['r-upload',         () => import('./fields/data-components/FieldUpload.vue')],
  ['r-entity-picker',  () => import('./fields/data-components/FieldEntityPicker.vue')],
  ['r-user-picker',    () => import('./fields/data-components/FieldUserPicker.vue')],
  ['r-dept-picker',    () => import('./fields/data-components/FieldDeptPicker.vue')],
  ['r-product-picker', () => import('./fields/data-components/FieldProductPicker.vue')],
  ['r-cascader',       () => import('./fields/data-components/FieldCascader.vue')],
  ['r-tree-select',    () => import('./fields/data-components/FieldTreeSelect.vue')],
  ['r-transfer',       () => import('./fields/data-components/FieldTransfer.vue')],
  ['r-segmented',      () => import('./fields/data-components/FieldSegmented.vue')],
  ['r-check-tag',      () => import('./fields/data-components/FieldCheckTag.vue')],
  ['r-mention',        () => import('./fields/data-components/FieldMention.vue')],
  ['r-time-picker',    () => import('./fields/data-components/FieldTimePicker.vue')],
  ['r-time-select',    () => import('./fields/data-components/FieldTimeSelect.vue')],
  ['r-autocomplete',   () => import('./fields/data-components/FieldAutocomplete.vue')],

  // ── 非数据字段 ──
  ['r-column-group',      fromBarrel(nonDataFields, 'FieldContextRenderer')],
  ['r-tree-node-summary', fromBarrel(nonDataFields, 'FieldTreeNodeSummary')],

  // ── 核心展示 ──
  ['r-text-display', fromBarrel(dataDisplay, 'DisplayText')],
  ['r-tag',          fromBarrel(dataDisplay, 'DisplayTag')],
  ['r-pagination',   fromBarrel(dataDisplay, 'DisplayPagination')],
  ['r-statistic',    fromBarrel(dataDisplay, 'DisplayStatistic')],
  ['r-alert',        fromBarrel(nonDataDisplay, 'DisplayAlert')],

  // ── 扩展展示 ──
  ['r-progress',          fromBarrel(dataDisplay, 'DisplayProgress')],
  ['r-badge',             fromBarrel(dataDisplay, 'DisplayBadge')],
  ['r-avatar',            fromBarrel(dataDisplay, 'DisplayAvatar')],
  ['r-descriptions',      () => import('./display/non-data-components/DisplayDescriptions.vue')],
  ['r-descriptions-item', () => import('./display/non-data-components/DisplayDescriptionsItem.vue')],
  ['r-timeline',          () => import('./display/non-data-components/DisplayTimeline.vue')],
  ['r-timeline-item',     () => import('./display/non-data-components/DisplayTimelineItem.vue')],
  ['r-empty',             () => import('./display/non-data-components/DisplayEmpty.vue')],
  ['r-result',            () => import('./display/non-data-components/DisplayResult.vue')],
  ['r-breadcrumb',        () => import('./display/non-data-components/DisplayBreadcrumb.vue')],
  ['r-breadcrumb-item',   () => import('./display/non-data-components/DisplayBreadcrumbItem.vue')],
  ['r-skeleton',          () => import('./display/non-data-components/DisplaySkeleton.vue')],

  // ── 支持 ──
  ['code-editor', () => import('./support/SparkCodeEditor.vue')],
  ['json-editor', () => import('./support/SparkJsonEditor.vue')],
]

// ═══════════════════════════════════════════════════════════════════════════════
// 公共 API
// ═══════════════════════════════════════════════════════════════════════════════

export function registerAllRenderers(): void {
  for (const [type, loader] of ALL_COMPONENTS) {
    Spark.register(type, loader)
  }
}
