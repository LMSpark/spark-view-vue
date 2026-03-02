/**
 * SparkPageConfig 命名空间 - 统一 API
 */

import { createConfigLoader } from './loader'
import {
  validateRouteConfig,
  validateRuleConfig,
  validatePageDataConfig,
  validateRoutes,
  validateRules
} from './validator'

// ConfigLoader type is defined but exported via createConfigLoader function

/**
 * SparkPageConfig 命名空间
 */
export const SparkPageConfig = {
  /**
   * 配置加载器
   */
  createLoader: createConfigLoader,
  createConfigLoader, // 别名，便于使用
  
  /**
   * 验证器
   */
  validate: {
    route: validateRouteConfig,
    rule: validateRuleConfig,
    pageData: validatePageDataConfig,
    routes: validateRoutes,
    rules: validateRules
  }
}

/**
 * 默认导出
 */
export default SparkPageConfig
