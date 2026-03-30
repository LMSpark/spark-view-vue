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
export { useSparkComponent, useSparkConsume, useSparkPageComponent, useSparkHost, useSparkHostScope, resolveSparkHost, resolveSparkHostType } from './core/index.js'
export type {
  UseSparkComponentReturn,
  UseSparkPageComponentReturn,
  UseSparkCapabilityReaderReturn,
  UseSparkComponentOptions,
  SparkNodeInput,
  SparkHostResolverOptions,
  ResolvedSparkHost,
  UseSparkHostReturn,
  UseSparkHostScopeReturn,
} from './core/index.js'

// ── 3. Vue 插件 + 注册表 ──
export { createSparkPlugin, createComponentRegistry, getGlobalRegistry } from './system/index.js'
export type { SparkPluginOptions } from './system/index.js'

// ── 3.5 权限渲染 API ──
export * as permission from './permission/index.js'
export type { IFieldRenderConfig, IFieldRenderState, IFieldRenderHelper, PermissionActionContext } from './permission/index.js'

// ── 4. 核心类型 ──
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
export type { CancellableControl } from './internal/cancellable-control.js'

// ── 5. DI Keys + SparkNode 结构常量 ──
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

// ── 6. 数据 + Renderer 能力键 ──
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
  SparkChild,
  SparkChildrenBridge,
  ElTableColumns,
  SparkComponentRenderer,
  SparkTableColumns,
} from './components/index.js'
export * as componentComposables from './components/composables.js'
export * as containerComposables from './components/containers/composables.js'
export * as containerDataComponents from './components/containers/data-components/index.js'
export * as containerNonDataComponents from './components/containers/non-data-components/index.js'
export * as containerDataComponentComposables from './components/containers/data-components/composables/index.js'
export * as containerNonDataComponentComposables from './components/containers/non-data-components/composables/index.js'
export * as containerDataComponentSupport from './components/containers/data-components/support/index.js'
export * as fieldComposables from './components/fields/composables.js'
export * as fieldDataComponents from './components/fields/data-components/index.js'
export * as fieldNonDataComponents from './components/fields/non-data-components/index.js'
export * as fieldDataComponentComposables from './components/fields/data-components/composables/index.js'
export * as fieldNonDataComponentComposables from './components/fields/non-data-components/composables/index.js'
export * as fieldDataComponentSupport from './components/fields/data-components/support/index.js'

export type {
  UsePageDataSetOptions,
  UsePageDataSetReturn,
} from './page/index.js'

export type {
  PageContext,
  PageConfig,
  PageRendererProps,
} from './page/index.js'

// ── 8. 内置 Renderer 容器 + 字段组件（注册） ──
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
  BuiltinActionButton,
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
