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
export { useSparkComponent, useSparkConsume, useSparkPageComponent, useSparkHostScope, resolvePlaceholderProps } from './core/index.js'
export type {
  UseSparkComponentReturn,
  UseSparkPageComponentReturn,
  UseSparkCapabilityReaderReturn,
  UseSparkComponentOptions,
  SparkNodeInput,
} from './core/index.js'

// ── 3. Vue 插件 + 注册表 ──
export { createSparkPlugin, createComponentRegistry, getGlobalRegistry } from './system/index.js'
export type { SparkPluginOptions } from './system/index.js'

// ── 3.5 权限渲染 API ──
export * as permission from './permission/index.js'
export type { IFieldRenderConfig, IFieldRenderState, PermissionActionContext } from './permission/index.js'

// ── 4. 核心类型 ──
export type {
  CapabilityName,
  SparkCapabilityContext,
  SparkNode,
  SparkNodeChildren,
  SparkNodeTreeRootParams,
  SparkNodeTreeLookupParams,
  SparkNodeTreeChildrenParams,
  SparkNodeTreeAddParams,
  SparkNodeTreeSetPropsParams,
  SparkNodeTreeReplaceParams,
  SparkNodeTreeRemoveParams,
  SparkNodeLocation,
  SparkNodeAddResult,
  SparkNodeSetPropsResult,
  SparkNodeReplaceResult,
  SparkNodeRemoveResult,
  FilterItemConfig,
  ComponentDefinition,
  ComponentRegistry,
  LoggerApi
} from './core/index.js'
export type { CancellableControl } from './internal/cancellable-control.js'

// ── 5. DI Keys + SparkNode 结构常量 ──
export {
  SPARK_REGISTRY_KEY,
  SPARK_NODE_STRUCT_KEYS,
  normalizeSparkNode,
  nodeId,
  nodeInputProp,
  nodeInputProps,
  isSparkNode,
  getSparkNodeChildren,
  SparkNodeTree,
} from './core/index.js'

// ── 6. 数据 + Renderer 能力键 ──
export {
  defineCapability,
  sparkProvide,
  sparkRemove,
  sparkConsume,
  APP_SERVICES,
  PAGE_SERVICE,
  PAGE_DATASET,
  DATA_SOURCE,
  DATA_ROW,
  PAGE_COMPONENT_REGISTRY,
  MODULE_CONTEXT,
  CSS_SCOPE,
  ACTION_CAPABILITY,
  HOST_FIELD_MODE,
  DEFAULT_PROVIDER_KEYS,
  findNearestCapabilityProvider,
  findNearestCapabilityProviderByKeys,
  consumeCapabilityFromProvider,
  createActionCapability,
} from './core/index.js'
export type {
  CapabilityKey,
  CapabilityTypeMap,
  ICapabilityContext,
  IAppServicesCapability,
  IPageServiceCapability,
  IThemeCapability,
  ThemeMode,
  IModuleContext,
  PageMessageType,
  PageDialogResult,
  IPageDialogOptions,
  IPageBrowseFilesOptions,
  IPageUploadFilesOptions,
  IPageSelectEntitiesOptions,
  PageSelectableValue,
  IPageSelectedEntity,
  IPageSelectedFile,
  IPageUploadedFile,
  IEventEmitter,
  PageComponentRegistry,
  PageComponentInstanceEntry,
  PageComponentApiEntry,
  ModuleContextCapability,
  PageCssScopeCapability,
  SparkActionCapability,
} from './core/index.js'
export type {
  RendererTableApi,
  RendererTreePath,
  RendererFormApi,
  RendererDetailApi,
  RendererTreeApi,
  RendererListApi,
  RendererDialogApi,
  RendererDrawerApi,
  RendererTabsApi,
  RendererCollapseApi,
  RendererStepsApi,
  RendererSectionApi,
  RTableProps,
  RFormProps,
  RDetailProps,
  RTreeProps,
  RListProps,
  ToolbarNode,
  RendererToolbarConfigProps,
  RendererToolbarProps,
  InlineAlign,
  InlineJustify,
  FilterNode,
  RendererFilterConfigProps,
  RendererFilterProps,
  ActionsNode,
  RendererActionsConfigProps,
  ActionsAlign,
  ActionsPosition,
  EditorNode,
  RendererEditorConfigProps,
  RendererEditorProps,
  HeaderNode,
  RendererHeaderConfigProps,
  RendererHeaderProps,
  FooterNode,
  RendererFooterConfigProps,
  RendererFooterProps,
  TailNode,
  RendererTailConfigProps,
  RendererTailProps,
  ToolbarPosition,
} from './components/containers/index.js'

// ── 7. 页面渲染引擎 ──
export {
  SparkPageRenderer,
} from './page/index.js'
// 组件层公共导出（容器 / 字段 / 展示 / 支持组件）
export * from './components/index.js'

export {
  usePageDataSet,
} from './page/index.js'
export type {
  UsePageDataSetOptions,
  UsePageDataSetReturn,
} from './page/index.js'

export type {
  PageContext,
  PageConfig,
} from './page/index.js'
