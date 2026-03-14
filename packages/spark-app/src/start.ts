/**
 * SparkApp.start() - 最高层级 API
 * 
 * 完全声明式启动应用，无需手动创建 app/router
 */

import { createApp, type Component, type Plugin } from 'vue'
import { createRouter, createWebHistory, createWebHashHistory, type RouteRecordNormalized } from 'vue-router'
import type { RouteConfig, ConfigLoaderOptions } from '@spark-view/spark-page-config'
import { createDynamicRouter, type DynamicRouterOptions, type StaticRouteDeclaration } from './router/dynamic'
import type { BootstrapOptions } from './types'
import { bootstrap } from './bootstrap'
import { createLogger } from './logger'
import { createThemeService, type ThemeServiceOptions, type ThemeServiceReactive } from './theme'
import { toError } from '@spark-view/spark-utils'

const startLogger = createLogger('start')

/**
 * SPARK 组件系统配置
 */
export interface SparkOptions {
  /** 是否启用 SPARK 组件系统（默认 true） */
  enabled?: boolean
  
  /** 
   * 是否自动导入并执行编译时组件注册（默认 true）
   * 
   * SparkApp 会自动导入 virtual:spark-components 并执行注册函数。
   * 设置为 false 可禁用自动注册（用于自定义注册流程）。
   */
  autoRegister?: boolean
  
  /** 
   * @deprecated 不再需要手动传递 registerComponents
   * SparkApp 会自动导入 virtual:spark-components
   * 
   * 保留此字段仅用于向后兼容，将在下一个大版本中移除
   */
  registerComponents?: (...args: unknown[]) => { total: number; sync: number; async: number }
}

/**
 * 页面配置系统配置
 */
export interface PageConfigOptions {
  /** 配置来源 */
  source: 'local' | 'remote' | 'hybrid'
  /** API 基础路径 */
  apiBaseUrl: string
  /** 请求超时时间 */
  timeout?: number
  /** 动态请求头回调（每次请求时调用，注入租户上下文） */
  getHeaders?: () => Record<string, string>
  /** 页面组件（默认使用 PageRenderer） */
  pageComponent?: Component
  /** 首页路径 */
  homePath: string
  /**
   * 静态 Vue 组件路由声明。
   * 启动时同步到后端数据库，并在 routes.json 加载后用对应组件注册路由。
   */
  staticRoutes?: StaticRouteDeclaration[]
  /** 注册前钩子（可以转换路由） */
  beforeRegister?: ((routes: RouteConfig[]) => RouteConfig[] | Promise<RouteConfig[]>) | undefined
  /** 注册后钩子（仅通知） */
  afterRegister?: ((routes: RouteRecordNormalized[]) => void) | undefined
}

/**
 * 启动配置（扩展自 BootstrapOptions）
 */
export interface StartOptions extends Omit<BootstrapOptions, 'app' | 'router'> {
  /** 根组件 */
  rootComponent: Component
  
  /** 路由模式（默认 'history'） */
  routerMode?: 'history' | 'hash'
  
  /** 挂载点（默认 '#app'） */
  mountTarget?: string
  
  /** SPARK 组件系统配置 */
  spark?: SparkOptions
  
  /** 页面配置系统配置 */
  pageConfig?: PageConfigOptions
  
  /** UI 插件列表 */
  plugins?: Plugin[]
  
  /**
   * CSS 主题配置
   * 
   * - `true` — 启用主题（默认 auto 跟随系统）
   * - `ThemeServiceOptions` — 自定义初始模式 / 存储键
   * - `false` / 不传 — 不启用主题服务
   */
  theme?: boolean | ThemeServiceOptions
  
  /** 启动前钩子 */
  onBeforeStart?: () => void | Promise<void>
  
  /** 启动失败钩子（如果提供，将完全接管错误处理） */
  onStartError?: (error: Error) => void | Promise<void>
  
  /** 错误降级组件（用于默认错误处理） */
  fallbackComponent?: Component
}

/**
 * 启动 SPARK 应用
 * 
 * 最高层级 API，自动完成：
 * 1. 创建 Vue 应用实例
 * 2. 创建 Vue Router 实例
 * 3. 执行 Bootstrap 流程
 * 4. 错误降级处理
 * 5. 挂载应用
 * 
 * @example
 * ```typescript
 * import { SparkApp } from '@spark-view/spark-app'
 * import App from './App.vue'
 * 
 * SparkApp.start({
 *   rootComponent: App,
 *   config: APP_CONFIG,
 *   auth: AUTH_CONFIG,
 *   beforeMount: async (context) => {
 *     console.log('准备挂载', context.user)
 *   }
 * })
 * ```
 */
export async function start(options: StartOptions): Promise<void> {
  const {
    rootComponent,
    routerMode = 'history',
    mountTarget = '#app',
    spark,
    pageConfig,
    plugins,
    theme,
    onBeforeStart,
    onStartError,
    fallbackComponent,
    ...bootstrapOptions
  } = options

  /** 主题服务实例（启用后通过 context 暴露给钩子） */
  let themeService: ThemeServiceReactive | undefined

  try {
    // 启动前钩子
    if (onBeforeStart) {
      startLogger.debug('执行启动前钩子...')
      await onBeforeStart()
    }

    // 1. 创建 Vue 应用实例
    startLogger.debug('创建 Vue 应用...')
    const app = createApp(rootComponent)

    // 1.5 初始化主题服务（尽早创建，避免首屏闪烁）
    if (theme !== false && theme !== undefined) {
      const themeOpts = typeof theme === 'boolean' ? {} : theme
      themeService = createThemeService(themeOpts)
      startLogger.debug('主题服务已初始化', { mode: themeService.mode })
    }

    // 过滤 form-create + Element Plus 的已知兼容性警告
    app.config.warnHandler = (msg) => {
      // 忽略 form-create + Element Plus 插槽在渲染函数外调用的已知兼容性警告
      if (msg.includes('invoked outside of the render function')) {
        return
      }

      // 其他警告正常输出到控制台
      console.warn(`[Vue warn]: ${msg}`)
    }
    // 2. 安装 UI 插件
    if (plugins && plugins.length > 0) {
      startLogger.debug(`安装 ${plugins.length} 个 UI 插件...`)
      for (const plugin of plugins) app.use(plugin)
    }

    // 3. 创建 Vue Router 实例
    startLogger.debug('创建 Vue Router...')
    const history = routerMode === 'hash' 
      ? createWebHashHistory() 
      : createWebHistory()
    const router = createRouter({ history, routes: [] })

    // 4. 安装 SPARK 组件系统
    // 使用全局单例管理器，确保整个应用共享同一个组件实例集合
    if (spark?.enabled !== false) {
      startLogger.debug('安装 SPARK 组件系统...')
      const { createSparkPlugin } = await import('@spark-view/spark-component')
      // 使用默认全局单例（不传参数）
      app.use(createSparkPlugin())

      // 自动导入并执行编译时组件注册
      const shouldAutoRegister = spark?.autoRegister !== false
      
      if (shouldAutoRegister) {
        try {
          startLogger.debug('自动导入 virtual:spark-components...')
          // 动态导入虚拟模块（由 vite-plugin-spark-components 生成）
          type RegisterFn = (app: ReturnType<typeof createApp>) => { total: number; sync: number; async: number }
          const virtualModule = await import('virtual:spark-components')
          const { registerComponents } = virtualModule as unknown as { 
            registerComponents?: RegisterFn
          }
          
          if (typeof registerComponents === 'function') {
            startLogger.debug('执行自动组件注册...')
            const stats = registerComponents(app)
            startLogger.info(`自动注册完成: ${stats.total} 个组件 (同步: ${stats.sync}, 异步: ${stats.async})`)
          } else {
            startLogger.warn('virtual:spark-components 未导出 registerComponents 函数（可能使用 classic 模式）')
          }
        } catch (error) {
          const err = toError(error)
          startLogger.warn('无法导入 virtual:spark-components', { error: err.message })
          startLogger.info('可能原因：未配置 sparkComponentsPlugin 或使用 classic 模式')
        }
      }
      
      // 向后兼容：如果手动传递了 registerComponents（已废弃）
      if (spark?.registerComponents && !shouldAutoRegister) {
        startLogger.debug('[DEPRECATED] 执行手动传递的组件注册函数...')
        const stats = spark.registerComponents(app)
        startLogger.info(`手动注册完成: ${stats.total} 个组件 (同步: ${stats.sync}, 异步: ${stats.async})`)
      }
    }

    // 5. 配置动态路由系统
    if (pageConfig) {
      startLogger.debug('配置动态路由系统...')
      const { SparkPageConfig } = await import('@spark-view/spark-page-config')
      
      const configLoaderOptions: Partial<ConfigLoaderOptions> = {
        source: pageConfig.source,
        apiBaseUrl: pageConfig.apiBaseUrl
      }
      
      if (pageConfig.timeout !== undefined) configLoaderOptions.timeout = pageConfig.timeout
      if (pageConfig.getHeaders) configLoaderOptions.getHeaders = pageConfig.getHeaders
      
      const configLoader = SparkPageConfig.createConfigLoader(configLoaderOptions)
      
      // 默认使用 FCPageRenderer 组件（FC 技术路线页面渲染器）
      let pageComponent = pageConfig.pageComponent
      
      // 如果未提供 pageComponent，自动导入 FCPageRenderer
      if (!pageComponent) {
        startLogger.debug('未提供 pageComponent，自动导入 FCPageRenderer...')
        const { FCPageRenderer } = await import('@spark-view/spark-component')
        pageComponent = FCPageRenderer
        startLogger.debug('✅ FCPageRenderer 已导入')
      }
      
      const dynamicRouterOptions: DynamicRouterOptions = {
        router,
        configLoader,
        pageComponent, // FCPageRenderer 或用户提供的组件，if 块已确保非空
        ...(pageConfig.staticRoutes !== undefined && { staticRoutes: pageConfig.staticRoutes }),
        apiBaseUrl: pageConfig.apiBaseUrl,
        ...(pageConfig.getHeaders !== undefined && { getHeaders: pageConfig.getHeaders }),
        ...(pageConfig.beforeRegister !== undefined && { beforeRegister: pageConfig.beforeRegister }),
        ...(pageConfig.afterRegister !== undefined && { afterRegister: pageConfig.afterRegister })
      }

      const dynamicRouter = createDynamicRouter(dynamicRouterOptions)
      
      // 先同步静态路由到后端，再从后端加载所有路由（单一来源）
      await dynamicRouter.syncStaticRoutesToBackend()
      await dynamicRouter.registerRoutes()

      // 兜底：确保 staticRoutes 中的路由一定被注册（即便后端/缓存未返回）
      if (pageConfig.staticRoutes) {
        for (const sr of pageConfig.staticRoutes) {
          if (!router.hasRoute(sr.name)) {
            router.addRoute({
              path: sr.path,
              name: sr.name,
              component: sr.component,
              meta: { pageId: sr.pageId, type: 'vue-component', title: sr.title, icon: sr.icon },
            })
          }
        }
      }

      router.addRoute({ path: '/', redirect: pageConfig.homePath })

      // 注入到全局缓存管理（清缓存页面 + AI 热重载需要）
      const { setConfigLoader, setDynamicRouter } = await import('./ai/ai-loop')
      setConfigLoader(configLoader)
      setDynamicRouter(dynamicRouter)
    }

    // 6. 执行 Bootstrap 流程
    startLogger.info('启动 Bootstrap 流程...')
    await bootstrap({
      ...bootstrapOptions,
      mountTarget,
      app,
      router,
      ...(themeService ? { themeService } : {}),
    })

    startLogger.success('应用启动成功')
  } catch (error) {
    const err = toError(error)
    startLogger.error('应用启动失败', err)

    // 启动失败钩子
    if (onStartError) {
      await onStartError(err)
    } else if (fallbackComponent) {
      // 使用用户提供的降级组件
      startLogger.warn('使用自定义降级组件...')
      const fallbackApp = createApp(fallbackComponent, { error: err })
      fallbackApp.mount(mountTarget)
    }
    // 注意：如果既不提供 onStartError 也不提供 fallbackComponent
    // 则应用启动失败后会抛出错误，不会有任何 UI 提示
    // 建议：至少提供 fallbackComponent

    throw error
  }
}
