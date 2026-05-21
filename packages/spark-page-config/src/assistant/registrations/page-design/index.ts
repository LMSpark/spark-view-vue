/**
 * Page-design 模块 barrel 入口。
 *
 * 汇总导出 PageDesignModule（主模块）、五大子模块（lifecycle / textModel / nodeTree / dataset / knowledge）、
 * prompt 组装类（PageDesignEditRuntimePrompt / PageDesignEditFlowPrompts）和动作分类器（PageDesignEditActionClassifier）。
 */

export {
  PageDesignEditActionClassifier,
} from './prompts/edit-action-classifier'

export {
  PageDesignEditRuntimePrompt,
} from './prompts/edit-runtime-prompt'

export { PageDesignEditFlowPrompts } from './prompts/edit-flow-prompts'

export { PageDesignModule } from './page-design-module'

export { LifecycleModule } from './modules/lifecycle-tool-catalog'

export { TextModelModule } from './modules/text-model-tool-catalog'

export { NodeTreeModule } from './modules/node-tree-tool-catalog'

export { DatasetModule } from './modules/dataset-tool-catalog'

export type {
  PageDesignModuleId,
  PageDesignModuleOptions,
} from './page-design-module'

export type {
  DatasetCrudToolFunctionFailureMode,
} from './modules/dataset-tool-catalog'

export type {
  EditLifecycleFunctionFailureMode,
  EditLifecycleFunctionId,
} from './modules/lifecycle-tool-catalog'

export type {
  SparkNodeTreeToolFailureMode,
  SparkNodeTreeToolFunctionId,
} from './modules/node-tree-tool-catalog'

export type {
  TextModelFunctionFailureMode,
  TextModelFunctionFileKey,
  TextModelFunctionId,
} from './modules/text-model-tool-catalog'

export {
  NodeTreeModuleKind,
  NodeTreeCapability,
} from './module-semantic'
export type {
  NodeTreeCapabilityOptions,
} from './module-semantic'

