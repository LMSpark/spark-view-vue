/* eslint-disable no-console */
/**
 * 使用示例 - SSR/API 模式
 * 
 * @fileoverview Examples are allowed to use console for demonstration
 */

import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { SparkPageConfig } from '@spark-view/spark-page-config'
import { SparkApp } from '@spark-view/spark-app'
import App from './App.vue'
import DynamicPage from './views/DynamicPage.vue'

// 创建 Vue 应用
const app = createApp(App)

// ========== 应用层初始化 ==========

// 创建配置加载器（远程模式）
const configLoader = SparkPageConfig.createLoader({
  source: 'remote',
  apiBaseUrl: import.meta.env.VITE_API_URL || '/api',
  enableCache: true,
  cacheExpiry: 10 * 60 * 1000, // 生产环境缓存10分钟
  timeout: 5000
})

// 创建路由
const router = createRouter({
  history: createWebHistory(),
  routes: []
})

// ========== Bootstrap 初始化流水线 ==========

await SparkApp.bootstrap({
  app,
  router,
  
  async onConfig() {
    // 阶段1: 加载配置
    console.log('加载配置...')
  },
  
  async onAuth() {
    // 阶段2: 用户认证
    console.log('用户认证...')
    const user = await fetchCurrentUser()
    return { user }
  },
  
  async onServices(context) {
    // 阶段3: 初始化服务
    console.log('初始化服务...')
    
    // 注册动态路由（带权限过滤）
    const dynamicRouter = SparkPageConfig.createRouter({
      router,
      configLoader,
      pageComponent: DynamicPage,
      
      beforeRegister: async (routes) => {
        // 根据用户权限过滤路由
        return routes.filter(route => {
          if (!route.meta?.permissions) return true
          return route.meta.permissions.every(p => 
            context.user?.permissions?.includes(p)
          )
        })
      }
    })
    
    await dynamicRouter.registerRoutes()
    
    // 返回服务实例
    return { configLoader, dynamicRouter }
  },
  
  async onRouter() {
    // 阶段4: 路由守卫
    SparkApp.setupRouterGuards(router, {
      requiresAuth: true,
      checkPermissions: true
    })
  },
  
  onMount() {
    // 阶段5: 挂载应用
    console.log('应用启动完成')
  }
})

// ========== 配置热更新（WebSocket） ==========

const ws = new WebSocket('ws://localhost:3000/ws')

ws.onmessage = async (event) => {
  const message = JSON.parse(event.data)
  
  if (message.type === 'config-update') {
    const { resource, pageId } = message.data
    
    if (resource === 'routes') {
      // 刷新所有路由
      await dynamicRouter.refreshRoutes()
      console.log('✅ 路由配置已更新')
    } else if (resource === 'page' && pageId) {
      // 清除特定页面缓存
      configLoader.clearCache(`page:${pageId}`)
      console.log(`✅ 页面配置已更新: ${pageId}`)
      
      // 如果当前正在查看该页面，触发重新加载
      if (router.currentRoute.value.meta.pageId === pageId) {
        await router.replace(router.currentRoute.value.fullPath)
      }
    }
  }
}

// ========== 工具函数 ==========

async function fetchCurrentUser() {
  const response = await fetch('/api/auth/me')
  return response.json()
}

// ========== 导出配置加载器（供组件使用） ==========

export { configLoader, dynamicRouter }
