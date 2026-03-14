/**
 * 动态路由注册器 - 支持 SPA 动态路由
 *
 * 迁移自 spark-page-config/router，职责上属于应用引导层（spark-app），
 * spark-page-config 只保留纯 TS 的配置加载/解析能力。
 */

import type { Router, RouteRecordRaw, RouteRecordNormalized } from 'vue-router'
import type { Component } from 'vue'
import type { RouteConfig, ConfigLoader } from '@spark-view/spark-page-config'
import { Logger, createRequest } from '@spark-view/spark-utils'
import type { Request } from '@spark-view/spark-utils'

const routerLogger = Logger('SparkApp:DynamicRouter')

/**
 * 静态 Vue 组件路由声明
 */
export interface StaticRouteDeclaration {
  /** 路由路径 */
  path: string
  /** 路由名称 */
  name: string
  /** pageId（用于后端注册） */
  pageId: string
  /** 页面标题 */
  title: string
  /** 页面图标 */
  icon: string
  /** Vue 组件 */
  component: Component
}

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

  /**
   * @deprecated 使用 componentMap 替代。staticRoutes 会同步路由到后端，
   * 新架构中路由完全由后端 DB 管理，前端只需 componentMap 解析 vue-component。
   */
  staticRoutes?: StaticRouteDeclaration[]

  /**
   * vue-component 路径 → Vue 组件映射。
   * 当 DB 返回 pageType='vue-component' 的路由时，使用此映射解析组件。
   * 路由元数据（path/name/title/icon）完全由后端 DB 管理，前端不同步。
   */
  componentMap?: Record<string, Component>

  /** 后端 API 基础路径（默认空字符串） */
  apiBaseUrl?: string

  /** 路由注册前钩子（可转换/过滤路由） */
  beforeRegister?: (routes: RouteConfig[]) => RouteConfig[] | Promise<RouteConfig[]>

  /** 路由注册后钩子（仅通知） */
  afterRegister?: (routes: RouteRecordNormalized[]) => void

  /** 动态请求头回调（每次请求时调用，注入 auth/tenant headers） */
  getHeaders?: () => Record<string, string>

  /**
   * 租户路径前缀（如 '/t/:tenantId'）。
   * 设置后，config 页面路由自动加此前缀，使所有业务路由统一在租户 URL 下。
   * vue-component 路由不受影响（DB 中已含完整路径）。
   */
  tenantPathPrefix?: string
}

/**
 * 动态路由管理器
 */
export class DynamicRouter {
  private router: Router
  private configLoader: ConfigLoader
  private pageComponent: Component
  private registeredRoutes: Set<string> = new Set()
  /** path → Component 映射（vue-component 路由使用） */
  private staticComponentMap: Map<string, Component> = new Map()
  /** 静态路由声明（用于同步到后端） */
  private staticDeclarations: StaticRouteDeclaration[]
  private apiBaseUrl: string
  /** 共享 axios 请求实例（统一通道，自动注入 auth/tenant headers） */
  private request: Request
  private beforeRegister?: DynamicRouterOptions['beforeRegister']
  private afterRegister?: DynamicRouterOptions['afterRegister']
  /** 租户路径前缀（如 '/t/:tenantId'），config 路由自动加此前缀 */
  private tenantPathPrefix: string

  constructor(options: DynamicRouterOptions) {
    this.router = options.router
    this.configLoader = options.configLoader

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- pageComponent 结构可缺失
    if (options.pageComponent === undefined || options.pageComponent === null) {
      throw new Error('DynamicRouter: pageComponent 是必需的，请提供有效的 Vue 组件')
    }

    this.pageComponent = options.pageComponent
    this.staticDeclarations = options.staticRoutes ?? []
    this.apiBaseUrl = options.apiBaseUrl ?? ''
    this.beforeRegister = options.beforeRegister
    this.afterRegister = options.afterRegister
    this.tenantPathPrefix = options.tenantPathPrefix ?? ''

    // 创建共享 Request 实例（统一 axios 通道）
    this.request = createRequest({
      baseURL: this.apiBaseUrl,
      timeout: 10_000,
    })
    if (options.getHeaders) {
      const getHeaders = options.getHeaders
      this.request.interceptors.request.use({
        onRequest: (config) => {
          config.headers = { ...config.headers, ...getHeaders() }
          return config
        }
      })
    }

    // 构建 path → Component 映射（componentMap 优先，兼容旧 staticRoutes）
    if (options.componentMap) {
      for (const [path, comp] of Object.entries(options.componentMap)) {
        this.staticComponentMap.set(path, comp)
      }
    }
    for (const decl of this.staticDeclarations) {
      if (!this.staticComponentMap.has(decl.path)) {
        this.staticComponentMap.set(decl.path, decl.component)
      }
    }
  }

  /** 注册所有路由 */
  async registerRoutes(): Promise<void> {
    routerLogger.info('开始注册动态路由')

    const result = await this.configLoader.loadRoutes()

    if (!result.success || !result.data) {
      routerLogger.warn('动态路由加载失败，将使用静态路由兜底', { error: result.error })
      return
    }

    let routes = result.data

    if (this.beforeRegister) {
      routerLogger.debug('执行 beforeRegister 钩子')
      routes = await this.beforeRegister(routes)
    }

    for (const route of routes) {
      this.registerRoute(route)
    }

    if (this.afterRegister) {
      routerLogger.debug('执行 afterRegister 钩子')
      this.afterRegister(this.router.getRoutes())
    }

    routerLogger.info('动态路由注册完成', { count: routes.length })
  }

  /** 注册单个路由（根据 meta.pageType 选择 Vue 组件或 PageRenderer） */
  registerRoute(config: RouteConfig): void {
    if (this.registeredRoutes.has(config.path)) {
      routerLogger.debug('路由已注册，跳过', { path: config.path })
      return
    }

    const pageType = config.meta?.['pageType'] as string | undefined

    // 统一计算注册路径（含租户前缀）
    let routePath = config.path
    if (this.tenantPathPrefix && !routePath.startsWith(this.tenantPathPrefix)) {
      routePath = this.tenantPathPrefix + routePath
    }

    // componentMap 始终以相对路径为 key（如 /dev），
    // 而后端 config.path 可能带租户前缀（如 /t/:tenantId/dev）或不带，
    // 因此需要剥离前缀后再查找。
    const relativePath = this.tenantPathPrefix && config.path.startsWith(this.tenantPathPrefix)
      ? config.path.slice(this.tenantPathPrefix.length)
      : config.path

    // vue-component 路由：使用预注册的 Vue 组件
    // 前端 componentMap 为权威来源——即使后端 pageType 未标记 'vue-component'，
    // 只要 componentMap 中有该路径的组件映射，就按 vue-component 处理。
    const hasComponent = this.staticComponentMap.has(relativePath)
    if (pageType === 'vue-component' || hasComponent) {
      const component = this.staticComponentMap.get(relativePath)
      if (!component) {
        routerLogger.warn('vue-component 路由缺少组件映射，跳过', { path: config.path })
        return
      }
      const route: RouteRecordRaw = {
        path: routePath,
        name: config.name,
        component,
        meta: { ...config.meta, pageId: config.pageId, type: 'vue-component' }
      }
      this.router.addRoute(route)
      this.registeredRoutes.add(config.path)
      routerLogger.debug('Vue 组件路由已注册', { path: routePath, name: config.name })
      return
    }
    const route: RouteRecordRaw = {
      path: routePath,
      name: config.name,
      component: this.pageComponent,
      props: { configLoader: this.configLoader },
      meta: { ...config.meta, pageId: config.pageId }
    }

    this.router.addRoute(route)
    this.registeredRoutes.add(config.path)
    routerLogger.debug('配置页面路由已注册', { path: routePath, name: config.name })
  }

  /**
   * 同步静态路由到后端数据库（幂等）。
   * 将 staticRoutes 声明推送到 POST {apiBaseUrl}/pages-config/__sync-routes，
   * 使后端成为路由信息的单一来源。
   */
  async syncStaticRoutesToBackend(): Promise<void> {
    if (this.staticDeclarations.length === 0) return

    const payload = this.staticDeclarations.map(d => ({
      pageId: d.pageId,
      path: d.path,
      name: d.name,
      title: d.title,
      icon: d.icon,
    }))

    try {
      const result = await this.request.post<Record<string, unknown>>(
        '/pages-config/__sync-routes',
        payload,
      )
      routerLogger.info('静态路由已同步到后端', {
        created: result['created'],
        updated: result['updated'],
      })
    } catch (e) {
      routerLogger.warn('静态路由同步失败（不影响路由注册）', { error: String(e) })
    }
  }

  /** 移除路由 */
  removeRoute(name: string): void {
    this.router.removeRoute(name)
    this.registeredRoutes.delete(name)
    routerLogger.debug('路由已移除', { name })
  }

  /** 刷新路由（重新加载配置，保留静态组件映射） */
  async refreshRoutes(): Promise<void> {
    routerLogger.info('刷新动态路由')

    this.configLoader.clearCache('routes')

    for (const path of this.registeredRoutes) {
      const route = this.router.getRoutes().find(r => r.path === path)
      if (route?.name !== undefined) {
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
