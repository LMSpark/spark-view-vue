/**
 * SPARK 组件系统 - 公共 API
 *
 * @packageDocumentation
 */

// ── 1. System 层（命名空间 / 插件 / 注册表） ──
export { Spark } from './system/index.js'
export type {
  ComponentLoader,
  GlobModules,
  RegisterContext,
  SparkSystem
} from './system/index.js'

// ── 2. Core 层（基础 composable / 类型 / 能力键） ──
export { useSparkComponent, useSparkConsume } from './core/index.js'
export type { UseSparkComponentReturn, UseSparkCapabilityReaderReturn, UseSparkComponentOptions, SparkNodeInput } from './core/index.js'

// ── 3. Vue 插件 + 注册表 ──
export { createSparkPlugin, createComponentRegistry, getGlobalRegistry } from './system/index.js'
export type { SparkPluginOptions } from './system/index.js'

// ── 5. 核心类型 ──
export type {
  CapabilityName,
  SparkCapabilityContext,
  SparkNode,
  SparkNodeChildren,
  // Dock 描述符（新模型）
  DockDescriptor,
  DockToolbar,
  DockActions,
  DockFilterItem,
  DockFilter,
  ContainerDocks,
  ComponentDefinition,
  ComponentRegistry,
  LoggerApi
} from './core/index.js'
export type { DefaultBehaviorControl } from './internal/defaultBehaviorControl.js'

// ── 6. DI Keys + SparkNode 结构常量 ──
export {
  SPARK_REGISTRY_KEY,
  SPARK_NODE_STRUCT_KEYS,
  DEFAULT_DOCK,
  normalizeSparkNode,
  nodeId,
  nodeDock,
  nodeOrder,
  getDockedChildren,
} from './core/index.js'

// ── 6b. 数据 + Renderer 能力键 ──
export {
  PAGE_DATASET,
  DATA_SOURCE,
  DATA_ROW,
  PAGE_COMPONENT_REGISTRY,
  MODULE_CONTEXT,
} from './core/index.js'
export type {
  PageComponentRegistry,
  PageComponentInstanceEntry,
  PageComponentApiEntry,
  ModuleContextCapability,
} from './core/index.js'
export type { RendererTableApi } from './components/containers/data-components/RendererTable/types.js'
export type { RendererFormApi } from './components/containers/data-components/RendererForm/types.js'
export type { RendererDetailApi } from './components/containers/data-components/RendererDetail/types.js'
export type { RendererTreeApi } from './components/containers/data-components/RendererTree/types.js'
export type { RendererListApi } from './components/containers/data-components/RendererList/types.js'
export type { RendererDialogApi } from './components/containers/non-data-components/RendererDialog/types.js'
export type { RendererDrawerApi } from './components/containers/non-data-components/RendererDrawer/types.js'
export type { RendererTabsApi } from './components/containers/non-data-components/RendererTabs/types.js'
export type { RendererCollapseApi } from './components/containers/non-data-components/RendererCollapse/types.js'
export type { RendererStepsApi } from './components/containers/non-data-components/RendererSteps/types.js'
export type { RendererSectionApi } from './components/containers/non-data-components/RendererSection/types.js'

// ── 7. 页面渲染引擎 ──
export {
  SparkPageRenderer,
} from './page/index.js'
export {
  SparkComponentRenderer,
} from './components/index.js'
export * as componentComposables from './components/composables.js'
export * as containerComposables from './components/containers/composables.js'
export * as containerDataComponents from './components/containers/data-components/index.js'
export * as containerNonDataComponents from './components/containers/non-data-components/index.js'
export * as containerDataComponentComposables from './components/containers/data-components/composables/index.js'
export * as containerNonDataComponentComposables from './components/containers/non-data-components/composables/index.js'
export * as containerDataComponentSupport from './components/containers/data-components/support/index.js'
export * as containerDataUi from './components/containers/data-components/index.js'
export * as containerNonDataUi from './components/containers/non-data-components/index.js'
export * as containerDataUiComposables from './components/containers/data-components/composables/index.js'
export * as containerNonDataUiComposables from './components/containers/non-data-components/composables/index.js'
export * as containerActionComposables from './components/containers/actions/index.js'
export * as containerContextComposables from './components/containers/context/index.js'
export * as containerDataComposables from './components/containers/data/index.js'
export * as containerLayoutComposables from './components/containers/layout/index.js'
export * as fieldComposables from './components/fields/composables.js'
export * as fieldDataComponents from './components/fields/data-components/index.js'
export * as fieldNonDataComponents from './components/fields/non-data-components/index.js'
export * as fieldDataComponentComposables from './components/fields/data-components/composables/index.js'
export * as fieldNonDataComponentComposables from './components/fields/non-data-components/composables/index.js'
export * as fieldDataComponentSupport from './components/fields/data-components/support/index.js'
export * as fieldDataUi from './components/fields/data-components/index.js'
export * as fieldNonDataUi from './components/fields/non-data-components/index.js'
export * as fieldDataUiComposables from './components/fields/data-components/composables/index.js'
export * as fieldNonDataUiComposables from './components/fields/non-data-components/composables/index.js'
export * as fieldContextComposables from './components/fields/context/index.js'
export * as fieldOptionComposables from './components/fields/options/index.js'
export * as fieldActionComposables from './components/fields/actions/index.js'

export type {
  UsePageDataSetOptions,
  UsePageDataSetReturn,
} from './page/index.js'

export type {
  PageContext,
  PageConfig,
  PageRendererProps,
} from './page/index.js'

// ── 8. 内置 Renderer 容器 + 字段组件 ──
export {
  // 容器
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
  RendererFieldScope,
  RendererListItemScope,
  // 字段
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
  FieldContextRenderer,
  FieldColumnGroup,
  FieldTreeNodeSummary,
  // 注册
  registerAllRenderers,
  // Composable
  useFieldPermission,
} from './components/index.js'
