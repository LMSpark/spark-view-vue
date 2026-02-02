/**
 * SparkApp Namespace
 * L1 应用基础设施层 - 统一命名空间
 * 
 * 职责：提供应用层核心功能
 * - bootstrap: 应用初始化流水线
 * - context: 应用上下文管理（用户、租户、权限）
 * - router: 路由守卫
 * - error: 错误处理
 * - config: 配置加载
 * 
 * 原则：L1 不依赖 L2/L4-L6，保持依赖方向正确
 */

import { bootstrap } from './bootstrap'
import { start } from './start'
import { setupRouterGuards } from './router/guards'
import { setupErrorHandler } from './error/handler'
import { loadConfig } from './config'
import { createAppContext, useAppContext } from './context/AppContext'

/**
 * SparkApp 命名空间
 * 
 * 使用说明：
 * main.ts 显式导入需要的层，保持依赖清晰
 * 
 * @example
 * ```ts
 * // main.ts - 显式导入各层
 * import { SparkApp } from '@spark-view/spark-app'        // L1
 * import { SparkPageConfig } from '@spark-view/spark-page-config' // L2
 * import { Spark } from '@spark-view/spark-core'          // L4-L6
 * 
 * // 使用 L1 功能
 * await SparkApp.bootstrap({ app, router, config })
 * 
 * // 使用 L2 功能
 * const loader = SparkPageConfig.createConfigLoader()
 * 
 * // 使用 L4-L6 功能
 * const manager = Spark.createComponentManager()
 * ```
 */
export const SparkApp = {
  /**
   * 启动应用（高级 API - 推荐）
   * 
   * 自动完成：
   * - 创建 Vue 应用和 Router
   * - 执行 Bootstrap 流程
   * - 错误降级处理
   * - 应用挂载
   * 
   * 完全声明式，main.ts 只需配置
   */
  start,

  /**
   * 应用初始化流水线（中级 API）
   * 
   * 需要手动创建 app 和 router
   * 
   * 自动处理：
   * - 用户认证
   * - 创建 AppContext
   * - 路由守卫
   * - 错误处理
   * - 应用挂载
   */
  bootstrap,

  /**
   * 设置路由守卫
   * 
   * 功能：
   * - 认证守卫
   * - 权限检查
   * - 预加载
   */
  setupRouterGuards,

  /**
   * 设置错误处理
   * 
   * 功能：
   * - 全局错误捕获
   * - 错误边界
   * - 降级处理
   */
  setupErrorHandler,

  /**
   * 加载配置
   * 
   * 支持：
   * - 本地配置
   * - 远程配置
   * - 配置合并
   */
  loadConfig,

  /**
   * 创建应用上下文
   * 
   * 包含：
   * - 用户信息
   * - 租户信息
   * - 权限管理
   * - 环境信息
   */
  createAppContext,

  /**
   * 使用应用上下文（组合式 API）
   * 
   * 用于组件内访问：
   * - context.user
   * - context.tenant
   * - context.hasPermission()
   * - context.hasRole()
   */
  useAppContext
}

export default SparkApp
