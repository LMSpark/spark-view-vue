/**
 * @spark-view/spark-page-config
 * 
 * SPARK 页面配置层 - L2 业务编排层
 * 支持本地/远程配置加载、动态路由注册、配置缓存和验证
 */

// 类型导出
export type {
  RuleConfig,
  PageDataConfig,
  PageScriptConfig,
  PageCssConfig,
  PageConfigFiles,
  PageConfig,
  ConfigLoaderOptions,
  ConfigLoadResult,
  ConfigLoader,
  ValidationError,
  ConfigVersion
} from './types'

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

// 验证器
export {
  validateRuleConfig,
  validatePageDataConfig,
  validateRules
} from './validator'

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
