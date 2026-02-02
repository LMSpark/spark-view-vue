/**
 * SparkApp Namespace
 * 统一命名空间 API
 */

import { bootstrap } from './bootstrap'
import { setupRouterGuards } from './router/guards'
import { setupErrorHandler } from './error/handler'
import { loadConfig } from './config'
import { createAppContext, useAppContext } from './context/AppContext'

/**
 * SparkApp 命名空间
 */
export const SparkApp = {
  /**
   * 应用初始化
   */
  bootstrap,

  /**
   * 路由守卫设置
   */
  setupRouterGuards,

  /**
   * 错误处理设置
   */
  setupErrorHandler,

  /**
   * 配置加载
   */
  loadConfig,

  /**
   * 创建应用上下文
   */
  createAppContext,

  /**
   * 使用应用上下文（组合式 API）
   */
  useAppContext
}

export default SparkApp
