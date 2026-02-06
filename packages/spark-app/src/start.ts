/**
 * SparkApp.start() - 最高层级 API
 * 
 * 完全声明式启动应用，无需手动创建 app/router
 */

import { createApp, type Component, type Plugin } from 'vue'
import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'
import type { BootstrapOptions } from './types'
import { bootstrap } from './bootstrap'
import { createLogger } from './logger'

const startLogger = createLogger('start')

/**
 * SPARK 组件系统配置
 */
export interface SparkOptions {
  /** 是否启用 SPARK 组件系统（默认 true） */
  enabled?: boolean
}

/**
 * 页面配置系统配置
 */
export interface PageConfigOptions {
  /** 配置来源 */
  source: 'local' | 'remote' | 'hybrid'
  /** API 基础路径 */
  apiBaseUrl: string
  /** 本地配置前缀 */
  localPrefix: string
  /** 是否启用缓存 */
  enableCache?: boolean
  /** 缓存过期时间 */
  cacheExpiry?: number
  /** 请求超时时间 */
  timeout?: number
  /** 页面组件（默认使用 PageRenderer） */
  pageComponent?: Component
  /** 首页路径 */
  homePath: string
  /** 注册前钩子（可以转换路由） */
  beforeRegister?: (routes: unknown[]) => unknown[] | Promise<unknown[]>
  /** 注册后钩子（仅通知） */
  afterRegister?: (routes: unknown[]) => void | Promise<void>
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
    onBeforeStart,
    onStartError,
    fallbackComponent,
    ...bootstrapOptions
  } = options

  try {
    // 启动前钩子
    if (onBeforeStart) {
      startLogger.debug('执行启动前钩子...')
      await onBeforeStart()
    }

    // 1. 创建 Vue 应用实例
    startLogger.debug('创建 Vue 应用...')
    const app = createApp(rootComponent)

    // 过滤 form-create + Element Plus 的已知兼容性警告
    app.config.warnHandler = (msg) => {
      // 忽略插槽在渲染函数外调用的警告（form-create + Element Plus 已知问题）
      const ignoredWarnings = [
        'Slot "default" invoked outside of the render function',
        'invoked outside of the render function'
      ]
      
      if (ignoredWarnings.some(warning => msg.includes(warning))) {
        return // 静默忽略
      }
      
      // 其他警告正常输出到控制台
      console.warn(`[Vue warn]: ${msg}`)
    }

    // 2. 安装 UI 插件
    if (plugins && plugins.length > 0) {
      startLogger.debug(`安装 ${plugins.length} 个 UI 插件...`)
      plugins.forEach(plugin => app.use(plugin))
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
      const { Spark } = await import('@spark-view/spark-component')
      // 使用默认全局单例（不传参数）
      app.use(Spark.createVuePlugin())
    }

    // 5. 配置动态路由系统
    if (pageConfig) {
      startLogger.debug('配置动态路由系统...')
      const { SparkPageConfig } = await import('@spark-view/spark-page-config')
      
      const configLoader = SparkPageConfig.createConfigLoader({
        source: pageConfig.source,
        apiBaseUrl: pageConfig.apiBaseUrl,
        localPrefix: pageConfig.localPrefix,
        enableCache: pageConfig.enableCache,
        cacheExpiry: pageConfig.cacheExpiry,
        timeout: pageConfig.timeout
      })
      
      // 默认使用 PageRenderer 组件
      let pageComponent = pageConfig.pageComponent
      if (!pageComponent) {
        const { PageRenderer } = await import('@spark-view/spark-renderer')
        pageComponent = PageRenderer
      }
      
      const dynamicRouter = SparkPageConfig.createDynamicRouter({
        router,
        configLoader,
        pageComponent,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        beforeRegister: pageConfig.beforeRegister as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        afterRegister: pageConfig.afterRegister as any
      })
      
      await dynamicRouter.registerRoutes()
      router.addRoute({ path: '/', redirect: pageConfig.homePath })
    }

    // 6. 执行 Bootstrap 流程
    startLogger.info('启动 Bootstrap 流程...')
    await bootstrap({
      ...bootstrapOptions,
      app,
      router
    })

    startLogger.success('应用启动成功')
  } catch (error) {
    const err = error as Error
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
