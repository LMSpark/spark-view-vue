/**
 * @spark-view/spark-page-config
 * 
 * SPARK 页面配置层 - L2 业务编排层
 * 支持本地/远程配置加载、动态路由注册、配置缓存和验证
 */

// 类型导出
export type {
  RouteConfig,
  RuleConfig,
  PageDataConfig,
  PageScriptConfig,
  PageCssConfig,
  PageConfig,
  ConfigLoaderOptions,
  ConfigLoadResult,
  ConfigLoader,
  DynamicRouterOptions,
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
  parseCss
} from './loader'

// 动态路由
export {
  DynamicRouter,
  createDynamicRouter,
  setupDynamicRoutes
} from './router'

// 验证器
export {
  validateRouteConfig,
  validateRuleConfig,
  validatePageDataConfig,
  validateRoutes,
  validateRules
} from './validator'

// 命名空间 API
export { SparkPageConfig } from './namespace'
