/**
 * Page-design 模块 barrel 入口。
 *
 * 汇总导出 PageDesign module-semantic 业务注册、五类 action 元数据、
 * prompt 组装类和动作分类器。
 */

export {
  PageDesignEditActionClassifier,
} from './prompts/edit-action-classifier'

export {
  PageDesignEditRuntimePrompt,
} from './prompts/edit-runtime-prompt'

export { PageDesignEditFlowPrompts } from './prompts/edit-flow-prompts'

export {
  PAGE_DESIGN_MODULE_ID,
  createPageDesignBusinessRegistration,
} from './page-design-module'

export { LIFECYCLE_ACTIONS } from './modules/lifecycle-tool-catalog'

export { TEXT_MODEL_ACTIONS } from './modules/text-model-tool-catalog'

export { NODE_TREE_ACTIONS } from './modules/node-tree-tool-catalog'

export { PAYLOAD_CATALOG_ACTIONS } from './modules/payload-catalog-tool-catalog'

export { DATASET_ACTIONS, DATASET_MUTATING_ACTION_NAMES } from './modules/dataset-tool-catalog'

export type {
  PageDesignModuleKindId,
  PageDesignModuleOptions,
  PageDesignRuntimeContext,
} from './page-design-module'

export type {
  EditLifecycleFunctionFailureMode,
  EditLifecycleFunctionId,
} from './modules/lifecycle-tool-catalog'

export type {
  SparkNodeTreeToolFailureMode,
  SparkNodeTreeToolFunctionId,
} from './modules/node-tree-tool-catalog'

export type {
  PayloadCatalogFunctionFailureMode,
  PayloadCatalogFunctionId,
} from './modules/payload-catalog-tool-catalog'

export type {
  TextModelFunctionFailureMode,
  TextModelFunctionFileKey,
  TextModelFunctionId,
} from './modules/text-model-tool-catalog'

export {
  createNodeTreeModuleKind,
} from './module-semantic'
export type {
  NodeTreeModuleKindOptions,
} from './module-semantic'

