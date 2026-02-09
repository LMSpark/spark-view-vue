/**
 * @fileoverview 应用启动引导模块 - SPARK 应用的初始化流水线
 * @packageDocumentation
 *
 * 本模块提供了完整的应用启动流程，包含配置加载、认证初始化、
 * 服务注册、路由配置等关键步骤。采用流水线设计模式，确保
 * 各个启动阶段的有序执行和错误处理。
 *
 * 主要特性：
 * - 阶段化启动：清晰的初始化步骤和日志记录
 * - 灵活配置：支持自定义认证、路由和服务配置
 * - 错误处理：完善的异常捕获和错误传播
 * - 环境适配：自动适配开发和生产环境
 *
 * @example
 * ```typescript
 * import { bootstrap } from './bootstrap'
 *
 * // 基础启动
 * await bootstrap({
 *   app: createApp(App),
 *   router: createRouter(routes),
 *   config: { apiBaseUrl: '/api' }
 * })
 *
 * // 完整配置启动
 * await bootstrap({
 *   app: createApp(App),
 *   router: createRouter(routes),
 *   config: { apiBaseUrl: '/api', enableMock: true },
 *   auth: {
 *     loginComponent: LoginView,
 *     loginPath: '/auth/login'
 *   },
 *   beforeMount: async (context) => {
 *     console.log('应用即将挂载', context.user)
 *   },
 *   afterMount: async (context) => {
 *     console.log('应用挂载完成')
 *   }
 * })
 * ```
 *
 * @author SPARK Team
 * @version 1.0.0
 * @since 2024
 */

import type { App as _App } from 'vue'
import type { Router as _Router } from 'vue-router'
import type { BootstrapOptions, AppContext, AppConfig } from '../types'
import { setupRouterGuards } from '../router/guards'
import { setupErrorHandler } from '../error/handler'
import { createLogger } from '../logger'
import { loadConfig } from '../config'
import { authService } from '../auth'

/**
 * =============================================================================
 * 常量和配置
 * =============================================================================
 */

/**
 * 引导过程日志记录器
 * 使用专门的 logger 实例，避免与其他模块的日志混淆
 */
const bootstrapLogger = createLogger('bootstrap')

/**
 * =============================================================================
 * 主要功能函数
 * =============================================================================
 */

/**
 * 应用启动引导函数
 *
 * 执行完整的应用初始化流水线，包含以下阶段：
 * 1. 配置加载 - 加载应用配置文件
 * 2. 认证初始化 - 设置认证服务和路由
 * 3. 用户鉴权 - 验证用户身份和权限
 * 4. 服务注册 - 通过 SPARK 能力系统提供应用服务
 * 5. 路由守卫 - 配置路由访问控制
 * 6. 挂载前钩子 - 执行自定义初始化逻辑
 * 7. 应用挂载 - 挂载 Vue 应用实例
 * 8. 挂载后钩子 - 执行清理和后续逻辑
 *
 * @param options - 启动配置选项
 * @throws {Error} 当认证失败或初始化过程中发生错误时抛出
 *
 * @example
 * ```typescript
 * await bootstrap({
 *   app: createApp(App),
 *   router: createRouter(routes),
 *   config: { apiBaseUrl: '/api/v1' },
 *   auth: {
 *     loginComponent: LoginComponent,
 *     enableMock: process.env.NODE_ENV === 'development'
 *   }
 * })
 * ```
 */
export async function bootstrap(options: BootstrapOptions): Promise<void> {
  const { app, router, config, beforeMount, afterMount, auth } = options

  try {
    // =========================================================================
    // 阶段 1: 配置加载
    // =========================================================================
    logPhase('CONFIG', '加载应用配置')
    const appConfig = await loadConfig(config)

    // =========================================================================
    // 阶段 2: 初始化认证服务
    // =========================================================================
    if (auth) {
      logPhase('AUTH-INIT', '初始化认证服务')
      authService.initialize({
        ...auth,
        apiBaseUrl: auth.apiBaseUrl ?? appConfig.apiBaseUrl,
        enableMock: auth.enableMock ?? appConfig.enableMock
      })

      // 注册登录路由（如果提供了 loginComponent）
      if (auth.loginComponent) {
        const loginPath = auth.loginPath ?? '/login'
        router.addRoute({
          path: loginPath,
          name: 'login',
          component: auth.loginComponent,
          meta: { public: true, title: '登录' }
        })
        bootstrapLogger.debug('登录路由已注册', { path: loginPath })
      }
    }

    // =========================================================================
    // 阶段 3: 用户鉴权
    // =========================================================================
    logPhase('AUTH', '用户鉴权')
    let appContext: AppContext | null

    if (auth) {
      // 使用 AuthService 进行认证
      const result = await authService.checkAuth()
      if (result) {
        appContext = {
          user: result.user,
          tenant: result.tenant,
          env: result.env,
          config: appConfig as unknown as Record<string, unknown>,
          initializedAt: new Date().toISOString()
        }
      } else {
        appContext = null
      }
    } else {
      // 使用默认认证逻辑
      appContext = await defaultAuthenticate(appConfig)
    }

    if (!appContext) {
      throw new Error('Authentication failed')
    }

    // =========================================================================
    // 阶段 4: SPARK 组件系统和服务注册
    // =========================================================================
    // 注意：通过 SparkApp.start() 启动时，Spark.createPlugin() 已在 bootstrap() 之前安装
    // SPARK_REGISTRY_KEY 由插件自动提供，组件通过 inject(SPARK_REGISTRY_KEY) 获取

    // ⚠️ DI 架构已统一到管道 B（SPARK 能力系统）
    // - 不再通过 Vue provide/inject 提供应用服务
    // - 业务代码应使用 APP_SERVICES 能力获取 router/logger/auth 等服务
    // - 参考：consume(APP_SERVICES) 或直接使用 useRouter() / Logger('module')

    logPhase('SERVICES', '应用服务通过 APP_SERVICES 能力提供')

    // =========================================================================
    // 阶段 5: 设置路由守卫
    // =========================================================================
    logPhase('ROUTER', '配置路由守卫')
    setupRouterGuards(router, {
      loginPath: auth?.loginPath ?? '/login',
      forbiddenPath: '/forbidden'
    }, appContext)

    // 设置全局错误处理
    setupErrorHandler(app, {
      enableFallback: true
    })

    // =========================================================================
    // 阶段 6: 挂载前钩子
    // =========================================================================
    if (beforeMount) {
      // 创建扩展的 Bootstrap Context，包含 app 和 router 实例
      const bootstrapContext = {
        ...appContext,
        app,
        router
      }
      await beforeMount(bootstrapContext)
    }

    // =========================================================================
    // 阶段 7: 挂载应用
    // =========================================================================
    logPhase('MOUNT', '挂载应用')
    app.use(router)
    await router.isReady()
    app.mount('#app')

    // =========================================================================
    // 阶段 8: 挂载后钩子
    // =========================================================================
    logPhase('COMPLETE', '应用启动完成')
    if (afterMount) {
      // 创建扩展的 Bootstrap Context，包含 app 和 router 实例
      const bootstrapContext = {
        ...appContext,
        app,
        router
      }
      await afterMount(bootstrapContext)
    }

    // 记录启动成功信息
    bootstrapLogger.info('SPARK 应用启动成功', {
      version: appConfig.version,
      user: appContext.user.username,
      tenant: appContext.tenant.tenantName
    })
  } catch (error) {
    bootstrapLogger.error('应用启动失败', error as Error)
    // 不在框架层处理错误展示，由调用方（start.ts 或 main.ts）决定如何处理
    throw error
  }
}

/**
 * =============================================================================
 * 辅助函数
 * =============================================================================
 */

/**
 * 默认鉴权函数
 *
 * 在未配置认证服务时使用的默认认证逻辑。
 * 开发环境使用 Mock 用户，生产环境尝试从后端获取用户信息。
 *
 * @param config - 应用配置
 * @returns 应用上下文或 null（认证失败）
 *
 * @private
 */
async function defaultAuthenticate(config: AppConfig): Promise<AppContext | null> {
  // 开发环境：使用 Mock 用户数据
  if (config.enableMock) {
    return {
      user: {
        userId: 'dev-user-001',
        username: 'developer',
        displayName: '开发者',
        roles: ['admin', 'developer'],
        permissions: ['*'] // 所有权限
      },
      tenant: {
        tenantId: 'default',
        tenantName: '默认租户'
      },
      env: {
        mode: 'development',
        apiBaseUrl: config.apiBaseUrl,
        version: config.version ?? '0.1.0'
      },
      config: {},
      initializedAt: new Date().toISOString()
    }
  }

  // 生产环境：从后端 API 获取用户信息
  try {
    const response = await fetch('/api/auth/me')
    if (response.ok) {
      return await response.json() as AppContext
    }
  } catch {
    // 网络错误或认证失败，静默处理
  }

  return null
}

/**
 * 记录初始化阶段日志
 *
 * 为每个初始化阶段记录结构化的日志信息，
 * 便于跟踪启动进度和排查问题。
 *
 * @param phase - 阶段标识符（如 'CONFIG', 'AUTH'）
 * @param message - 阶段描述信息
 *
 * @private
 */
function logPhase(phase: string, message: string): void {
  bootstrapLogger.info(`[${phase}] ${message}`)
}
