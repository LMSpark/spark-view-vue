/**
 * SPARK 组件系统 - 公共 API
 *
 * @packageDocumentation
 */

// ── 1. 命名空间 ──
export { Spark } from './spark.js'
export type {
  ComponentLoader,
  GlobModules,
  RegisterContext,
  SparkSystem
} from './spark.js'

// ── 2. 组件开发 Composable ──
export { useSparkComponent } from './composables/useSparkComponent.js'
export type { UseSparkComponentReturn } from './composables/useSparkComponent.js'

// ── 3. Vue 插件 ──
export { createSparkPlugin } from './plugins/SparkPlugin.js'
export type { SparkPluginOptions } from './plugins/SparkPlugin.js'

// ── 4. 注册表 ──
export { createComponentRegistry, getGlobalRegistry } from './registry/ComponentRegistry.js'

// ── 5. 核心类型 ──
export type {
  CapabilityName,
  ComponentConfig,
  ComponentContext,
  ComponentDefinition,
  ComponentRegistry,
  LoggerApi
} from './core/types.js'

// ── 6. DI Keys ──
export { SPARK_REGISTRY_KEY, SPARK_PARENT_CONTEXT_KEY } from './core/types.js'

// ── 6b. 数据 + Renderer 能力键 ──
export {
  PAGE_DATASET,
  DATA_SOURCE,
  FIELD_CONTEXT,
  CONTEXT_DATA,
  TABLE_API,
  PAGE_COMPONENT_REGISTRY,
} from './capability-keys.js'
export type {
  FieldContext,
  RendererTableApi,
  PageComponentRegistry,
  PageComponentInstanceEntry,
  PageComponentApiEntry,
} from './capability-keys.js'

// ── 7. 页面渲染引擎 ──
export {
  usePageDataSet,
  SparkPageRenderer,
  SparkComponentRenderer,
  bindDataToRules
} from './renderer/index.js'

export type {
  UsePageDataSetOptions,
  UsePageDataSetReturn,
} from './renderer/index.js'

export type {
  BindRule,
  PageContext,
  PageConfig,
  PageRendererProps,
  RuleBindingOptions,
} from './renderer/index.js'

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
  RendererFieldScope,
  RendererListItemScope,
  RendererTreeNodeScope,
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
  FieldColumnGroup,
  FieldContextRenderer,
  // 注册
  registerAllRenderers,
  // Composable
  useFormDetailContainer,
  useContainerDataSource,
  useFieldPermission,
  useFieldContext,
  useFieldOptions,
} from './renderer/index.js'
