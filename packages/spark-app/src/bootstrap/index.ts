/**
 * Application Bootstrap
 * 应用初始化流水线
 */

import type { App as VueApp } from 'vue'
import type { Router as VueRouter } from 'vue-router'
import type { BootstrapOptions, AppContext, AppConfig } from '../types'
import { createAppContext, provideAppContext } from '../context/AppContext'
import { setupRouterGuards } from '../router/guards'
import { setupErrorHandler } from '../error/handler'
import { Spark } from '@spark-view/spark-core'

/**
 * 应用初始化流水线
 */
export async function bootstrap(options: BootstrapOptions): Promise<void> {
  const { app, router, config, beforeMount, afterMount, authenticate } = options

  try {
    // 阶段 1: 配置加载
    logPhase('CONFIG', '加载应用配置')
    const appConfig = await loadConfig(config)

    // 阶段 2: 用户鉴权
    logPhase('AUTH', '用户鉴权')
    const authResult = authenticate ? await authenticate() : await defaultAuthenticate(appConfig)
    
    if (!authResult) {
      throw new Error('Authentication failed')
    }

    // 创建 AppContext
    const appContext = createAppContext({
      user: authResult.user,
      tenant: authResult.tenant,
      env: authResult.env,
      config: appConfig as unknown as Record<string, unknown>
    })

    // 阶段 3: 注入全局服务
    logPhase('SERVICES', '初始化核心服务')
    const sparkManager = Spark.createComponentManager()
    
    app.provide('sparkManager', sparkManager)
    provideAppContext(app, appContext)

    // 阶段 4: 设置路由守卫
    logPhase('ROUTER', '配置路由守卫')
    setupRouterGuards(router, {
      loginPath: '/login',
      forbiddenPath: '/forbidden',
      enablePreload: true
    })

    // 设置错误处理
    setupErrorHandler(app, {
      enableFallback: true
    })

    // 阶段 5: 挂载前钩子
    if (beforeMount) {
      await beforeMount(appContext)
    }

    // 阶段 6: 挂载应用
    logPhase('MOUNT', '挂载应用')
    app.use(router)
    await router.isReady()
    app.mount('#app')

    // 阶段 7: 挂载后钩子
    logPhase('COMPLETE', '应用启动完成')
    if (afterMount) {
      await afterMount(appContext)
    }

    console.log('✅ SPARK 应用启动成功', {
      version: appConfig.version,
      user: appContext.user.username,
      tenant: appContext.tenant.tenantName
    })
  } catch (error) {
    console.error('❌ 应用启动失败', error)
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
  console.log(`🚀 [${phase}] ${message}`)
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
