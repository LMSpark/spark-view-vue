/**
 * @spark-view/spark-page-config
 *
 * SPARK 页面配置层 - L2 业务编排层
 * 支持页面配置文件 API 加载、动态路由注册、配置缓存和验证
 */

// 类型导出
export type {
  SparkNode,
  SparkNodeChildren,
  RuleConfig,
  PageDataConfig,
  PageScriptConfig,
  PageCssConfig,
  PageConfigFiles,
  PageConfigFileName,
  PageConfigFileLoadOptions,
  PageConfig,
  ConfigLoaderOptions,
  ConfigLoadResult,
  ConfigLoader,
} from './types'

export {
  PAGE_CONFIG_FILE_NAMES,
} from './types'

export type {
  PageConfigCreatePageParams,
  PageConfigFileApiOptions,
  PageConfigFileVersionSummary,
  PageConfigPageSummary,
} from './files'

export {
  PageConfigFileApi,
} from './files'

export {
  SPARK_NODE_STRUCT_KEYS,
  normalizeSparkNode,
  nodeId,
  nodeInputProp,
  nodeInputProps,
  isSparkNode,
  getSparkNodeChildren,
} from './spark-node'

export type {
  SparkNodeTreeJsonInput,
  SparkNodeTreeRuleJsonInput,
  SparkNodeTreeRootParams,
  SparkNodeTreeFromJsonOptions,
  SparkNodeTreeLookupParams,
  SparkNodeTreeChildrenParams,
  SparkNodeTreeAddParams,
  SparkNodeTreeAddNodesParams,
  SparkNodeTreeMoveParams,
  SparkNodeTreeSetPropsParams,
  SparkNodeTreeSetPropsBatchItem,
  SparkNodeTreeSetPropsBatchParams,
  SparkNodeTreeReplaceParams,
  SparkNodeTreeReplaceNodesItem,
  SparkNodeTreeReplaceNodesParams,
  SparkNodeTreeRemoveParams,
  SparkNodeTreeRemoveNodesParams,
  SparkNodeTreeMethodKey,
  SparkNodeLocation,
  SparkNodeAddResult,
  SparkNodeAddNodesResult,
  SparkNodeMoveResult,
  SparkNodeSetPropsResult,
  SparkNodeSetPropsBatchResult,
  SparkNodeReplaceResult,
  SparkNodeReplaceNodesResult,
  SparkNodeRemoveResult,
  SparkNodeRemoveNodesResult,
  SparkNodeFindByTypeParams,
  SparkNodeFindByTypeMatch,
  SparkNodeFindByTypeResult,
} from './spark-node-tree'

export {
  SparkNodeTree,
  SPARK_PAGE_NODE_TYPE,
  SPARK_PAGE_ROOT_ID,
} from './spark-node-tree'

export * from './json-document'
export * from './documents'
export * from './page-design'
export * from './navigation'
export * from './page-edit'

// 配置加载器
export {
  PageConfigLoader,
  createConfigLoader,
  compileRule,
  normalizeRuleNode,
  parsePageData,
  parseScript,
  parseCss,
} from './loader'

// 命名空间 API
export { SparkPageConfig } from './namespace'

// ==================== 业务脚本 API 契约 ====================
// 框架无关的页面脚本上下文类型：PageRoute、ScriptContext
export type {
  PageRoute,
  ScriptContext,
  PageServiceInScript,
  ModuleContextInScript,
  ModuleContextItemInScript,
} from './script-context-types'
