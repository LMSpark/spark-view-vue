/**
 * 一键注册所有内置 Renderer 容器 + 字段组件到 SPARK 注册表。
 *
 * 设计目标：
 * 1. 按“容器 / 展示 / Dock / 字段 / 支持组件”分类维护
 * 2. 用注册清单批量注册，减少手工散点重复
 * 3. 统一从分类 index 导入，避免深路径碎片化
 */
import { Spark } from '../system/spark.js'

import {
  RendererTable,
  RendererForm,
  RendererDetail,
  RendererTree,
  RendererList,
} from './containers/data-components/index.js'

import {
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
} from './containers/non-data-components/index.js'

import { default as BuiltinActionButton } from './containers/BuiltinActionButton.vue'

import {
  DockActions,
  DockFilter,
  DockEditor,
  DockHeader,
  DockFooter,
  DockTail,
} from './containers/docks/index.js'

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
} from './fields/data-components/index.js'

import {
  FieldContextRenderer,
  FieldTreeNodeSummary,
} from './fields/non-data-components/index.js'

import SparkCodeEditor from './support/SparkCodeEditor.vue'
import SparkJsonEditor from './support/SparkJsonEditor.vue'

type RegisteredComponent = Parameters<typeof Spark.register>[1]
type RegistrationEntry = readonly [string, RegisteredComponent]

const CONTAINER_COMPONENTS: RegistrationEntry[] = [
  ['r-table', RendererTable],
  ['r-form', RendererForm],
  ['r-detail', RendererDetail],
  ['r-tree', RendererTree],
  ['r-list', RendererList],
  ['r-tabs', RendererTabs],
  ['r-collapse', RendererCollapse],
  ['r-dialog', RendererDialog],
  ['r-drawer', RendererDrawer],
  ['r-steps', RendererSteps],
  ['r-section', RendererSection],
  ['r-block', RendererSection],
  ['r-toolbar', RendererToolbar],
  ['r-menu', RendererToolbar],
  ['r-row', RendererRow],
  ['r-col', RendererCol],
  ['r-card', RendererCard],
  ['r-space', RendererSpace],
  ['r-divider', RendererDivider],
  ['r-button', RendererButton],
  ['r-button-group', RendererButtonGroup],
  ['r-link', RendererLink],
  ['r-page-header', RendererPageHeader],
  ['r-dropdown', RendererDropdown],
  ['r-tooltip', RendererTooltip],
  ['r-popover', RendererPopover],
  ['r-popconfirm', RendererPopconfirm],
  ['r-backtop', RendererBacktop],
  ['r-carousel', RendererCarousel],
  ['r-carousel-item', RendererCarouselItem],
  ['r-watermark', RendererWatermark],
  ['r-affix', RendererAffix],
  ['r-scrollbar', RendererScrollbar],
  ['r-tour', RendererTour],
  ['r-anchor', RendererAnchor],
  ['r-anchor-link', RendererAnchorLink],
  ['r-container', RendererContainer],
  ['r-aside', RendererAside],
  ['r-main', RendererMain],
  ['r-layout-header', RendererLayoutHeader],
  ['r-layout-footer', RendererLayoutFooter],
  ['builtin-action', BuiltinActionButton],
]

const DISPLAY_COMPONENTS: RegistrationEntry[] = [
  ['r-statistic', DisplayStatistic],
  ['r-progress', DisplayProgress],
  ['r-tag', DisplayTag],
  ['r-badge', DisplayBadge],
  ['r-avatar', DisplayAvatar],
  ['r-text-display', DisplayText],
  ['r-pagination', DisplayPagination],
  ['r-descriptions', DisplayDescriptions],
  ['r-descriptions-item', DisplayDescriptionsItem],
  ['r-timeline', DisplayTimeline],
  ['r-timeline-item', DisplayTimelineItem],
  ['r-alert', DisplayAlert],
  ['r-empty', DisplayEmpty],
  ['r-result', DisplayResult],
  ['r-breadcrumb', DisplayBreadcrumb],
  ['r-breadcrumb-item', DisplayBreadcrumbItem],
  ['r-skeleton', DisplaySkeleton],
  ['display-image', DisplayImage],
  ['display-calendar', DisplayCalendar],
  ['display-countdown', DisplayCountdown],
  ['display-icon', DisplayIcon],
]

const DOCK_COMPONENTS: RegistrationEntry[] = [
  ['r-actions', DockActions],
  ['r-filter', DockFilter],
  ['r-editor', DockEditor],
  ['r-header', DockHeader],
  ['r-footer', DockFooter],
  ['r-tail', DockTail],
]

const FIELD_COMPONENTS: RegistrationEntry[] = [
  ['r-text', FieldText],
  ['r-textarea', FieldTextarea],
  ['r-html-editor', FieldHtmlEditor],
  ['r-number', FieldNumber],
  ['r-date', FieldDate],
  ['r-select', FieldSelect],
  ['r-multi-select', FieldMultiSelect],
  ['r-radio', FieldRadio],
  ['r-checkbox', FieldCheckbox],
  ['r-checkbox-group', FieldCheckboxGroup],
  ['r-switch', FieldSwitch],
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
  ['r-column-group', FieldContextRenderer],
  ['r-tree-node-summary', FieldTreeNodeSummary],
]

const SUPPORT_COMPONENTS: RegistrationEntry[] = [
  ['code-editor', SparkCodeEditor],
  ['json-editor', SparkJsonEditor],
]

export function registerAllRenderers(): void {
  const registrationGroups: readonly RegistrationEntry[][] = [
    CONTAINER_COMPONENTS,
    DISPLAY_COMPONENTS,
    DOCK_COMPONENTS,
    FIELD_COMPONENTS,
    SUPPORT_COMPONENTS,
  ]

  for (const group of registrationGroups) {
    for (const [type, component] of group) {
      Spark.register(type, component)
    }
  }
}
