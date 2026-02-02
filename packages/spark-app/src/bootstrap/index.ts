/**
 * Application Bootstrap
 * 应用初始化流水线
 */

import type { App as _App } from 'vue'
import type { Router as _Router } from 'vue-router'
import type { BootstrapOptions, AppContext, AppConfig } from '../types'
import { provideAppContext } from '../context/AppContext'
import { setupRouterGuards } from '../router/guards'
import { setupErrorHandler } from '../error/handler'
import { createLogger } from '../logger'
import { Spark } from '@spark-view/spark-core'
import { container } from '../di/container'
import { authService } from '../auth'

const bootstrapLogger = createLogger('bootstrap')

/**
 * 应用初始化流水线
 */
export async function bootstrap(options: BootstrapOptions): Promise<void> {
  const { app, router, config, beforeMount, afterMount, authenticate, auth } = options

  try {
    // 阶段 1: 配置加载
    logPhase('CONFIG', '加载应用配置')
    const appConfig = await loadConfig(config)

    // 阶段 2: 初始化认证服务（如果提供了 auth 配置）
    if (auth) {
      logPhase('AUTH-INIT', '初始化认证服务')
      authService.initialize({
        ...auth,
        apiBaseUrl: auth.apiBaseUrl || appConfig.apiBaseUrl,
        enableMock: auth.enableMock ?? appConfig.enableMock
      })
      
      // 注册登录路由（如果提供了 loginComponent）
      if (auth.loginComponent) {
        const loginPath = auth.loginPath || '/login'
        router.addRoute({
          path: loginPath,
          name: 'login',
          component: auth.loginComponent as any,
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
    } else if (authenticate) {
      // 向后兼容：使用旧的 authenticate 函数
      appContext = await authenticate()
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
      CONFIG_LOADER_KEY,
      SPARK_MANAGER_KEY,
      SPARK_REGISTRY_KEY,
      AUTH_SERVICE_KEY
    } = await import('../constants')
    
    // 提供核心服务
    const sparkManager = Spark.createComponentManager()
    app.provide(APP_CONTEXT_KEY, appContext)
    app.provide(ROUTER_KEY, router)
    app.provide(LOGGER_KEY, createLogger('app'))
    app.provide(SPARK_MANAGER_KEY, sparkManager)
    
    // 提供可选服务
    if (container.has('ConfigLoader')) {
      app.provide(CONFIG_LOADER_KEY, container.resolve('ConfigLoader'))
    }
    if (container.has('SparkRegistry')) {
      app.provide(SPARK_REGISTRY_KEY, container.resolve('SparkRegistry'))
    }
    if (auth) {
      app.provide(AUTH_SERVICE_KEY, authService)
    }
    
    // 向后兼容：保留旧的字符串 key
    app.provide('sparkManager', sparkManager)
    provideAppContext(app, appContext)
    if (auth) {
      app.provide('authService', authService)
    }

    // 阶段 5: 设置路由守卫
    logPhase('ROUTER', '配置路由守卫')
    setupRouterGuards(router, {
      loginPath: auth?.loginPath || '/login',
      forbiddenPath: '/forbidden',
      enablePreload: true
    })

    // 设置错误处理
    setupErrorHandler(app, {
      enableFallback: true
    })

    // 阶段 6: 挂载前钩子
    if (beforeMount) {
      await beforeMount(appContext)
    }

    // 阶段 7: 挂载应用
    logPhase('MOUNT', '挂载应用')
    app.use(router as any)
    await router.isReady()
    app.mount('#app')

    // 阶段 8: 挂载后钩子
    logPhase('COMPLETE', '应用启动完成')
    if (afterMount) {
      await afterMount(appContext)
    }

    bootstrapLogger.info('SPARK 应用启动成功', {
      version: appConfig.version,
      user: appContext.user.username,
      tenant: appContext.tenant.tenantName
    })
  } catch (error) {
    bootstrapLogger.error('应用启动失败', error as Error)
    showBootstrapError(error as Error)
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
        version: config.version || '0.1.0'
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

/**
 * 显示启动错误
 */
function showBootstrapError(error: Error): void {
  if (typeof document === 'undefined') return
  
  const appElement = document.getElementById('app')
  if (appElement) {
    appElement.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 20px;
        text-align: center;
        background: #f5f5f5;
      ">
        <div style="
          max-width: 500px;
          padding: 40px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        ">
          <h1 style="color: #cc0000; margin-bottom: 20px;">应用启动失败</h1>
          <p style="color: #666; margin-bottom: 20px;">${error.message}</p>
          <button 
            onclick="location.reload()" 
            style="
              padding: 10px 20px;
              background: #1890ff;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 14px;
            "
          >
            重新加载
          </button>
        </div>
      </div>
    `
  }
}
