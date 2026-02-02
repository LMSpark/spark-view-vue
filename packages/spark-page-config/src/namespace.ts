/**
 * SparkPageConfig 命名空间 - 统一 API
 */

import { createConfigLoader } from './loader'
import { createDynamicRouter, setupDynamicRoutes } from './router'
import {
  validateRouteConfig,
  validateRuleConfig,
  validatePageDataConfig,
  validateRoutes,
  validateRules
} from './validator'

import type { ConfigLoader } from './types'

/**
 * SparkPageConfig 命名空间
 */
export const SparkPageConfig = {
  /**
   * 配置加载器
   */
  createLoader: createConfigLoader,
  
  /**
   * 动态路由
   */
  createRouter: createDynamicRouter,
  setupRoutes: setupDynamicRoutes,
  
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
