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
  /** 页面组件 */
  pageComponent: Component
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
  
  /** 启动失败钩子 */
  onStartError?: (error: Error) => void | Promise<void>
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
    if (spark?.enabled !== false) {
      startLogger.debug('安装 SPARK 组件系统...')
      const { Spark } = await import('@spark-view/spark-core')
      const manager = Spark.createComponentManager()
      const registry = Spark.createComponentRegistry()
      app.use(Spark.createVuePlugin({ manager, registry }))
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
      
      const dynamicRouter = SparkPageConfig.createDynamicRouter({
        router,
        configLoader,
        pageComponent: pageConfig.pageComponent,
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
    } else {
      // 默认降级：显示错误页面
      startLogger.warn('使用默认降级处理...')
      const fallbackApp = createApp({
        template: `
          <div style="
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            font-family: system-ui, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          ">
            <div style="text-align: center; max-width: 500px; padding: 2rem;">
              <h1 style="font-size: 3rem; margin-bottom: 1rem;">⚠️</h1>
              <h2 style="margin-bottom: 1rem;">应用启动失败</h2>
              <p style="opacity: 0.9; margin-bottom: 2rem;">${err.message}</p>
              <button 
                onclick="location.reload()"
                style="
                  padding: 0.75rem 2rem;
                  background: white;
                  color: #667eea;
                  border: none;
                  border-radius: 0.5rem;
                  font-size: 1rem;
                  cursor: pointer;
                  font-weight: 600;
                "
              >
                重新加载
              </button>
            </div>
          </div>
        `
      })
      fallbackApp.mount(mountTarget)
    }

    throw error
  }
}
