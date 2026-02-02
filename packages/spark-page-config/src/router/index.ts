/**
 * 动态路由注册器 - 支持 SPA 动态路由
 */

import type { Router, RouteRecordRaw } from 'vue-router'
import type { Component } from 'vue'
import type { RouteConfig, DynamicRouterOptions, ConfigLoader } from '../types'
import { routerLogger, ErrorCodes, getErrorMessage } from '@spark-view/spark-app'

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
    this.pageComponent = options.pageComponent ?? (() => null) as unknown as Component
    this.beforeRegister = options.beforeRegister
    this.afterRegister = options.afterRegister
  }

  /**
   * 注册所有路由
   */
  async registerRoutes(): Promise<void> {
    routerLogger.info('开始注册动态路由') // 使用 L1 Logger
    
    const result = await this.configLoader.loadRoutes()

    if (!result.success || !result.data) {
      const errorMsg = getErrorMessage(ErrorCodes.ROUTE_INVALID) // 使用 L1 错误码
      routerLogger.error('路由加载失败', { error: result.error }) // 使用 L1 Logger
      throw new Error(`${errorMsg}: ${result.error}`)
    }

    let routes = result.data
    
    // 执行 beforeRegister 钩子（权限过滤）
    if (this.beforeRegister) {
      routerLogger.debug('执行 beforeRegister 钩子') // 使用 L1 Logger
      routes = await this.beforeRegister(routes)
    }
    
    for (const route of routes) {
      await this.registerRoute(route)
    }
    
    // 执行 afterRegister 钩子
    if (this.afterRegister) {
      routerLogger.debug('执行 afterRegister 钩子') // 使用 L1 Logger
      this.afterRegister(this.router.getRoutes())
    }
    
    routerLogger.success('动态路由注册完成', { count: routes.length }) // 使用 L1 Logger
  }

  /**
   * 注册单个路由
   */
  async registerRoute(config: RouteConfig): Promise<void> {
    if (this.registeredRoutes.has(config.path)) {
      routerLogger.debug('路由已注册，跳过', { path: config.path }) // 使用 L1 Logger
      return // 已注册
    }

    const route: RouteRecordRaw = {
      path: config.path,
      name: config.name,
      component: this.pageComponent,
      meta: {
        ...config.meta,
        pageId: config.pageId
      }
    }

    this.router.addRoute(route)
    this.registeredRoutes.add(config.path)
    routerLogger.debug('路由已注册', { path: config.path, name: config.name }) // 使用 L1 Logger
  }

  /**
   * 移除路由
   */
  removeRoute(name: string): void {
    this.router.removeRoute(name)
    this.registeredRoutes.delete(name)
    routerLogger.debug('路由已移除', { name }) // 使用 L1 Logger
  }

  /**
   * 刷新路由（重新加载配置）
   */
  async refreshRoutes(): Promise<void> {
    routerLogger.info('刷新动态路由') // 使用 L1 Logger
    
    // 清除缓存
    this.configLoader.clearCache('routes')
    
    // 清除已注册路由
    this.registeredRoutes.forEach(path => {
      const route = this.router.getRoutes().find(r => r.path === path)
      if (route?.name) {
        this.router.removeRoute(route.name)
      }
    })
    this.registeredRoutes.clear()

    // 重新注册
    await this.registerRoutes()
    
    routerLogger.success('路由刷新完成') // 使用 L1 Logger
  }

  /**
   * 获取已注册路由列表
   */
  getRegisteredRoutes(): string[] {
    return Array.from(this.registeredRoutes)
  }
}

/**
 * 创建动态路由管理器
 */
export function createDynamicRouter(options: DynamicRouterOptions): DynamicRouter {
  return new DynamicRouter(options)
}

/**
 * 设置动态路由（便捷函数）
 */
export async function setupDynamicRoutes(
  router: Router,
  configLoader: ConfigLoader,
  pageComponent: Component
): Promise<DynamicRouter> {
  const dynamicRouter = createDynamicRouter({
    router,
    configLoader,
    pageComponent
  })

  await dynamicRouter.registerRoutes()
  
  return dynamicRouter
}
