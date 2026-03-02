/**
 * 动态路由注册器 - 支持 SPA 动态路由
 *
 * 迁移自 spark-page-config/router，职责上属于应用引导层（spark-app），
 * spark-page-config 只保留纯 TS 的配置加载/解析能力。
 */

import type { Router, RouteRecordRaw } from 'vue-router'
import type { Component } from 'vue'
import type { RouteConfig, ConfigLoader } from '@spark-view/spark-page-config'
import { Logger, SharedErrorCodes, getSharedErrorMessage } from '@spark-view/spark-utils'

const routerLogger = Logger('SparkApp:DynamicRouter')

const ErrorCodes = SharedErrorCodes
const getErrorMessage = getSharedErrorMessage

/**
 * 动态路由注册选项
 */
export interface DynamicRouterOptions {
  /** Vue Router 实例 */
  router: Router

  /** 配置加载器 */
  configLoader: ConfigLoader

  /**
   * 动态页面组件（必需）
   * 用于渲染配置化页面
   *
   * @example
   * ```typescript
   * import { PageRenderer } from '@spark-view/spark-component'
   * const options = { router, configLoader, pageComponent: PageRenderer }
   * ```
   */
  pageComponent: Component

  /** 路由注册前钩子（可转换/过滤路由） */
  beforeRegister?: (routes: RouteConfig[]) => RouteConfig[] | Promise<RouteConfig[]>

  /** 路由注册后钩子（仅通知） */
  afterRegister?: (routes: RouteRecordRaw[]) => void
}

/**
 * 动态路由管理器
 */
export class DynamicRouter {
  private router: Router
  private configLoader: ConfigLoader
  private pageComponent: Component
  private registeredRoutes: Set<string> = new Set()
  private beforeRegister?: DynamicRouterOptions['beforeRegister']
  private afterRegister?: DynamicRouterOptions['afterRegister']

  constructor(options: DynamicRouterOptions) {
    this.router = options.router
    this.configLoader = options.configLoader

    if (!options.pageComponent) {
      throw new Error('DynamicRouter: pageComponent 是必需的，请提供有效的 Vue 组件')
    }

    this.pageComponent = options.pageComponent
    this.beforeRegister = options.beforeRegister
    this.afterRegister = options.afterRegister
  }

  /** 注册所有路由 */
  async registerRoutes(): Promise<void> {
    routerLogger.info('开始注册动态路由')

    const result = await this.configLoader.loadRoutes()

    if (!result.success || !result.data) {
      const errorMsg = getErrorMessage(ErrorCodes.ROUTE_INVALID)
      routerLogger.error('路由加载失败', { error: result.error })
      throw new Error(`${errorMsg}: ${result.error}`)
    }

    let routes = result.data

    if (this.beforeRegister) {
      routerLogger.debug('执行 beforeRegister 钩子')
      routes = await this.beforeRegister(routes)
    }

    for (const route of routes) {
      await this.registerRoute(route)
    }

    if (this.afterRegister) {
      routerLogger.debug('执行 afterRegister 钩子')
      this.afterRegister(this.router.getRoutes() as RouteRecordRaw[])
    }

    routerLogger.info('动态路由注册完成', { count: routes.length })
  }

  /** 注册单个路由 */
  async registerRoute(config: RouteConfig): Promise<void> {
    if (this.registeredRoutes.has(config.path)) {
      routerLogger.debug('路由已注册，跳过', { path: config.path })
      return
    }

    const route: RouteRecordRaw = {
      path: config.path,
      name: config.name,
      component: this.pageComponent,
      props: { configLoader: this.configLoader },
      meta: { ...config.meta, pageId: config.pageId }
    }

    this.router.addRoute(route)
    this.registeredRoutes.add(config.path)
    routerLogger.debug('路由已注册', { path: config.path, name: config.name })
  }

  /** 移除路由 */
  removeRoute(name: string): void {
    this.router.removeRoute(name)
    this.registeredRoutes.delete(name)
    routerLogger.debug('路由已移除', { name })
  }

  /** 刷新路由（重新加载配置） */
  async refreshRoutes(): Promise<void> {
    routerLogger.info('刷新动态路由')

    this.configLoader.clearCache('routes')

    for (const path of this.registeredRoutes) {
      const route = this.router.getRoutes().find(r => r.path === path)
      if (route?.name) {
        this.router.removeRoute(route.name)
      }
    }
    this.registeredRoutes.clear()

    await this.registerRoutes()
    routerLogger.info('路由刷新完成')
  }

  /** 获取已注册路由列表 */
  getRegisteredRoutes(): string[] {
    return Array.from(this.registeredRoutes)
  }
}

/** 创建动态路由管理器 */
export function createDynamicRouter(options: DynamicRouterOptions): DynamicRouter {
  return new DynamicRouter(options)
}

/** 设置动态路由（便捷函数） */
export async function setupDynamicRoutes(
  router: Router,
  configLoader: ConfigLoader,
  pageComponent: Component
): Promise<DynamicRouter> {
  const dynamicRouter = createDynamicRouter({ router, configLoader, pageComponent })
  await dynamicRouter.registerRoutes()
  return dynamicRouter
}
