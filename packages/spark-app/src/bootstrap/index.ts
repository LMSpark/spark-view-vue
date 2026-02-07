/**
 * Application Bootstrap
 * 应用初始化流水线
 */

import type { App as _App } from 'vue'
import type { Router as _Router } from 'vue-router'
import type { BootstrapOptions, AppContext, AppConfig } from '../types'
import { setupRouterGuards } from '../router/guards'
import { setupErrorHandler } from '../error/handler'
import { createLogger } from '../logger'
import { authService } from '../auth'

const bootstrapLogger = createLogger('bootstrap')

/**
 * 应用初始化流水线
 */
export async function bootstrap(options: BootstrapOptions): Promise<void> {
  const { app, router, config, beforeMount, afterMount, auth } = options

  try {
    // 阶段 1: 配置加载
    logPhase('CONFIG', '加载应用配置')
    const appConfig = await loadConfig(config)

    // 阶段 2: 初始化认证服务（如果提供了 auth 配置）
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

    // 阶段 3: 用户鉴权
    logPhase('AUTH', '用户鉴权')
    let appContext: AppContext | null
    
    if (auth) {
      // 使用 AuthService
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
      // 默认认证
      appContext = await defaultAuthenticate(appConfig)
    }
    
    if (!appContext) {
      throw new Error('Authentication failed')
    }

    // 阶段 4: 注入全局服务（使用类型安全的 InjectionKey）
    logPhase('SERVICES', '初始化核心服务')
    
    const {
      APP_CONTEXT_KEY,
      ROUTER_KEY,
      LOGGER_KEY,
      AUTH_SERVICE_KEY
    } = await import('../constants')
    
    // 提供核心服务
    // SPARK Manager 应该在 start() 中已创建
    // 注意：通过 SparkApp.start() 启动时，插件已在 bootstrap() 之前安装
    // 这里不再检查 Manager 是否存在，因为：
    // 1. SparkApp.start() 会在调用 bootstrap() 前安装插件
    // 2. 直接调用 bootstrap() 的旧方式会在组件使用时通过 inject 获取
    // 3. 检查 app._context.provides 依赖 Vue 内部实现，不够可靠
    
    app.provide(APP_CONTEXT_KEY, appContext)
    app.provide(ROUTER_KEY, router)
    app.provide(LOGGER_KEY, createLogger('app'))
    
    // 提供认证服务（如果启用）
    if (auth) {
      app.provide(AUTH_SERVICE_KEY, authService)
    }
    
    // 注意：sparkManager 的字符串 key 已在上面处理，不需要重复提供

    // 阶段 5: 设置路由守卫
    logPhase('ROUTER', '配置路由守卫')
    setupRouterGuards(router, {
      loginPath: auth?.loginPath ?? '/login',
      forbiddenPath: '/forbidden'
    })

    // 设置错误处理
    setupErrorHandler(app, {
      enableFallback: true
    })

    // 阶段 6: 挂载前钩子
    if (beforeMount) {
      // 创建扩展的 Bootstrap Context
      const bootstrapContext = {
        ...appContext,
        app,
        router
      }
      await beforeMount(bootstrapContext)
    }

    // 阶段 7: 挂载应用
    logPhase('MOUNT', '挂载应用')
    app.use(router)
    await router.isReady()
    app.mount('#app')

    // 阶段 8: 挂载后钩子
    logPhase('COMPLETE', '应用启动完成')
    if (afterMount) {
      // 创建扩展的 Bootstrap Context
      const bootstrapContext = {
        ...appContext,
        app,
        router
      }
      await afterMount(bootstrapContext)
    }

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
 * 加载配置
 */
async function loadConfig(config: AppConfig): Promise<AppConfig> {
  // 尝试加载远程配置
  try {
    const response = await fetch('/api/config')
    if (response.ok) {
      const remoteConfig = await response.json() as Partial<AppConfig>
      return { ...config, ...remoteConfig }
    }
  } catch {
    // 使用本地配置
  }
  
  return config
}

/**
 * 默认鉴权函数（开发环境使用）
 */
async function defaultAuthenticate(config: AppConfig): Promise<AppContext | null> {
  // 开发环境：使用 Mock 用户
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

  // 生产环境：从后端获取用户信息
  try {
    const response = await fetch('/api/auth/me')
    if (response.ok) {
      return await response.json()
    }
  } catch {
    // 鉴权失败
  }

  return null
}

/**
 * 记录初始化阶段
 */
function logPhase(phase: string, message: string): void {
  bootstrapLogger.info(`[${phase}] ${message}`)
}
