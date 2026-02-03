/* eslint-disable no-console */
/**
 * 使用示例 - SPA 模式
 * 
 * @fileoverview Examples are allowed to use console for demonstration
 */

import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { SparkPageConfig } from '@spark-view/spark-page-config'
import App from './App.vue'
import DynamicPage from './views/DynamicPage.vue'

// 创建 Vue 应用
const app = createApp(App)

// 创建路由
const router = createRouter({
  history: createWebHistory(),
  routes: [
    // 静态路由
    {
      path: '/login',
      name: 'login',
      component: () => import('./views/Login.vue')
    }
  ]
})

// ========== 配置加载器 ==========

// 方式1：SPA 本地模式
const configLoader = SparkPageConfig.createLoader({
  source: 'local',
  localPrefix: '/pages-config',
  enableCache: true,
  cacheExpiry: 5 * 60 * 1000
})

// 方式2：远程 API 模式
// const configLoader = SparkPageConfig.createLoader({
//   source: 'remote',
//   apiBaseUrl: '/api',
//   enableCache: true
// })

// 方式3：混合模式（推荐生产环境）
// const configLoader = SparkPageConfig.createLoader({
//   source: 'hybrid',
//   apiBaseUrl: '/api',
//   localPrefix: '/pages-config',
//   timeout: 3000
// })

// ========== 动态路由注册 ==========

// 简单方式
await SparkPageConfig.setupRoutes(router, configLoader, DynamicPage)

// 高级方式（权限过滤）
// const dynamicRouter = SparkPageConfig.createRouter({
//   router,
//   configLoader,
//   pageComponent: DynamicPage,
//   beforeRegister: async (routes) => {
//     // 过滤无权限路由
//     const user = getCurrentUser()
//     return routes.filter(route => {
//       if (!route.meta?.permissions) return true
//       return route.meta.permissions.every(p => user.permissions.includes(p))
//     })
//   },
//   afterRegister: (routes) => {
//     console.log('已注册', routes.length, '个路由')
//   }
// })
// await dynamicRouter.registerRoutes()

// ========== 配置验证（开发环境） ==========

if (import.meta.env.DEV) {
  const result = await configLoader.loadRoutes()
  if (result.success && result.data) {
    const errorMap = SparkPageConfig.validate.routes(result.data)
    if (errorMap.size > 0) {
      console.error('路由配置验证失败:')
      errorMap.forEach((errors, path) => {
        console.error(`  ${path}:`, errors)
      })
    }
  }
}

// 挂载应用
app.use(router)
app.mount('#app')

// ========== 配置热更新（可选） ==========

if (import.meta.hot) {
  import.meta.hot.on('page-config-update', async ({ pageId }) => {
    configLoader.clearCache(`page:${pageId}`)
    console.log('页面配置已更新:', pageId)
  })
}
