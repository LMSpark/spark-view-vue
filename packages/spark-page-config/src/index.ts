/**
 * @spark-view/spark-page-config
 * 
 * SPARK 页面配置层 - L2 业务编排层
 * 支持本地/远程配置加载、动态路由注册、配置缓存和验证
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
  PageConfigFileApiOptions,
  PageConfigFileVersionSummary,
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
// 框架无关的页面脚本上下文类型：IPageRoute、IScriptContext
export type {
  IPageRoute,
  IScriptContext,
  IPageServiceInScript,
  IModuleContextInScript,
  IModuleContextItemInScript,
} from './script-context-types'
