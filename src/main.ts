/**
 * 主应用入口 - 使用 SPARK 6层架构
 * 
 * L1: @spark-view/spark-app - 基础设施层
 * L2: @spark-view/spark-page-config - 业务编排层
 * L3: @spark-view/spark-renderer - 模型层
 * L4-L6: @spark-view/spark-core - 组件核心
 */

import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import formCreate from '@form-create/element-ui'
import VXETable from 'vxe-table'
import 'vxe-table/lib/style.css'

// SPARK 架构包
import { SparkApp } from '@spark-view/spark-app'
import { SparkPageConfig } from '@spark-view/spark-page-config'
import { Spark } from '@spark-view/spark-core'

// 主应用组件
import App from './App.vue'
import DynamicPage from './views/DynamicPage.vue'
import './style.css'

/**
 * 应用配置
 */
const appConfig = {
  apiBaseUrl: '/api',
  logLevel: 'debug' as const,
  enableMock: import.meta.env.DEV,
  version: '1.0.0',
  features: {
    enableAI: false,
    enableDataAnalysis: true
  }
}

/**
 * 初始化应用
 */
async function initApp() {
  // 1. 创建 Vue 应用实例
  const app = createApp(App)
  
  // 2. 创建路由实例
  const router = createRouter({
    history: createWebHistory(),
    routes: []
  })
  
  // 3. 注册第三方库
  app.use(ElementPlus)
  app.use(VXETable)
  app.use(formCreate)
  
  // 4. 初始化 SPARK 核心
  const sparkManager = Spark.createComponentManager()
  const sparkRegistry = Spark.createComponentRegistry()
  app.use(Spark.createVuePlugin({ manager: sparkManager, registry: sparkRegistry }))
  
  // 5. 创建 L2 配置加载器
  const configLoader = SparkPageConfig.createConfigLoader({
    basePath: '/pages-config',
    enableCache: true
  })
  
  // 6. 创建 L2 动态路由管理器
  const dynamicRouter = SparkPageConfig.createDynamicRouter({
    router,
    configLoader,
    pageComponent: DynamicPage
  })
  
  // 7. 注册动态路由
  await dynamicRouter.registerRoutes()
  
  // 8. 添加根路径重定向
  router.addRoute({
    path: '/',
    redirect: '/home'
  })
  
  // 9. 使用 L1 Bootstrap 初始化应用
  try {
    await SparkApp.bootstrap({
      app,
      router,
      config: appConfig,
      beforeMount: async (context) => {
        console.log('🚀 [SPARK] 应用启动中...', context)
      },
      afterMount: async (context) => {
        console.log('✅ [SPARK] 应用启动完成', context)
      }
    })
    
    console.log('✅ [SPARK] 系统初始化完成')
  } catch (error) {
    console.error('❌ [SPARK] 系统初始化失败', error)
    // 即使失败也挂载应用（降级处理）
    app.use(router)
    app.mount('#app')
  }
}

// 启动应用
initApp().catch(error => {
  console.error('❌ [SPARK] 应用启动失败', error)
})
