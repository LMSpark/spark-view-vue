/**
 * SparkPageConfig 命名空间 - 统一 API
 */

import { createConfigLoader } from './loader'
import {
  validateRuleConfig,
  validatePageDataConfig,
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
    rule: validateRuleConfig,
    pageData: validatePageDataConfig,
    rules: validateRules
  }
}

/**
 * 默认导出
 */
export default SparkPageConfig
