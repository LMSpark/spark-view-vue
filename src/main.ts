/**
 * SPARK 主应用入口
 * 
 * 🎯 设计理念：
 * - 100% 声明式配置，0 实现逻辑
 * - 配置即文档，所有配置都有类型约束
 * - SparkApp.start() 自动处理所有初始化流程
 * 
 * 🔧 技术栈：
 * - Vue 3.5 + TypeScript
 * - Element Plus + VXE Table + form-create
 * - SPARK 组件系统 + 动态路由系统
 * 
 * 📦 架构层次（由 SparkApp.start 自动完成）：
 * - L1: @spark-view/spark-app - 应用基础设施层
 * - L2: @spark-view/spark-page-config - 页面配置编排层
 * - L4-L6: @spark-view/spark-component - 组件核心层
 */

import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import formCreate from '@form-create/element-ui'
import VXETable from 'vxe-table'
import 'vxe-table/lib/style.css'

// Syncfusion 样式（使用本地 npm 包）
import '@syncfusion/ej2-base/styles/material.css'
import '@syncfusion/ej2-vue-grids/styles/material.css'

// SPARK 架构包
import { SparkApp, createLogger } from '@spark-view/spark-app'

// 创建应用日志
const logger = createLogger('main')

// 主应用组件
import { createApp } from 'vue'
import App from './App.vue'
import ErrorFallback from './components/ErrorFallback.vue'
import './style.css'

// ============================================================================
// 应用配置（纯声明式，0 逻辑）
// ============================================================================

/**
 * 启动 SPARK 应用
 * 
 * SparkApp.start() 自动完成：
 * 1. 创建 Vue 应用实例
 * 2. 创建 Vue Router 实例
 * 3. 安装 UI 插件（Element Plus, VXE Table, form-create）
 * 4. 初始化 SPARK 组件系统（Manager + Registry）
 * 5. 创建页面配置加载器
 * 6. 注册动态路由
 * 7. 执行 Bootstrap 流程
 * 8. 挂载应用到 DOM
 */
SparkApp.start({
  // === 应用根组件 ===
  rootComponent: App,
  
  // === 路由配置 ===
  routerMode: 'history',              // 使用 HTML5 History 模式
  mountTarget: '#app',                // 挂载点
  
  // === UI 插件 ===
  plugins: [
    ElementPlus,                      // Element Plus UI 组件库
    VXETable,                         // 高性能表格组件
    formCreate                        // 动态表单生成器
  ],
  
  // === SPARK 组件系统配置（L4-L6）===
  spark: {
    enabled: true                     // 启用 SPARK 组件系统
  },
  
  // === 页面配置系统（L2）===
  pageConfig: {
    source: 'local',                  // 使用本地配置（SPA 模式）
    apiBaseUrl: '/api',               // API 基础路径
    localPrefix: '/pages-config',     // 本地配置文件路径前缀
    enableCache: true,                // 启用配置缓存
    homePath: '/home'                 // 首页路径
  },
  
  // === 应用基础配置 ===
  config: {
    apiBaseUrl: '/api',               // API 基础路径
    logLevel: 'debug' as const,       // 日志级别
    enableMock: import.meta.env.DEV,  // Mock 开关（开发环境启用）
    version: '1.0.0',                 // 应用版本
    features: {
      enableAI: false,                // AI 功能（未启用）
      enableExport: true,             // 导出功能（已启用）
      enableOffline: false            // 离线模式（未启用）
    }
  },
  
  // === 生命周期钩子 ===
  
  // 启动前钩子
  onBeforeStart: async () => {
    logger.info('🚀 SPARK 应用启动中...')
  },
  
  // 挂载前钩子
  beforeMount: async (context) => {
    logger.info('✅ 应用准备挂载', { context })
    
    // 注册静态 Vue 组件路由（非配置页面）
    const { router } = context
    
    // 导入 Vue 组件页面
    const Dashboard = (await import('./views/Dashboard.vue')).default
    const About = (await import('./views/About.vue')).default
    const Settings = (await import('./views/Settings.vue')).default
    const CapabilityDemo = (await import('./views/CapabilityDemo.vue')).default
    const CapabilitySystemDemo = (await import('./views/CapabilitySystemDemo.vue')).default
    
    // 注册能力演示组件
    await import('./components/demo/register')
    
    // 注册静态路由
    router.addRoute({
      path: '/dashboard',
      name: 'dashboard',
      component: Dashboard,
      meta: {
        title: '管理仪表板',
        icon: '🏠',
        type: 'vue-component'
      }
    })
    
    router.addRoute({
      path: '/capability-demo',
      name: 'capability-demo',
      component: CapabilityDemo,
      meta: {
        title: '能力管理演示',
        icon: '🎯',
        type: 'vue-component'
      }
    })
    
    router.addRoute({
      path: '/capability-system-demo',
      name: 'capability-system-demo',
      component: CapabilitySystemDemo,
      meta: {
        title: '三层级能力演示',
        icon: '🔗',
        type: 'vue-component'
      }
    })
    
    router.addRoute({
      path: '/about', 
      name: 'about',
      component: About,
      meta: {
        title: '关于系统',
        icon: 'ℹ️',
        type: 'vue-component'
      }
    })
    
    router.addRoute({
      path: '/settings',
      name: 'settings', 
      component: Settings,
      meta: {
        title: '系统设置',
        icon: '⚙️',
        type: 'vue-component'
      }
    })
    
    logger.info('✅ 静态 Vue 组件路由注册完成')
  },
  
  // 挂载后钩子
  afterMount: async (context) => {
    logger.info('✅ 应用启动完成', { context })
    
    // 统计路由信息
    const allRoutes = context.router.getRoutes()
    const vueRoutes = allRoutes.filter(r => r.meta?.type === 'vue-component')
    const configRoutes = allRoutes.filter(r => r.meta?.type !== 'vue-component')
    
    logger.info('📊 路由统计', {
      总路由数: allRoutes.length,
      Vue组件页面: vueRoutes.length, 
      配置页面: configRoutes.length
    })
    
    logger.info('🎉 混合渲染系统启动完成!')
    logger.info('📄 Vue 组件页面:', { paths: vueRoutes.map(r => r.path) })
    logger.info('⚙️ 配置页面:', { paths: configRoutes.map(r => r.path) })
  },
  
  // === 错误处理 ===
  onStartError: async (error) => {
    logger.error('❌ 应用启动失败', error instanceof Error ? error : { error })
    
    // TODO: 错误上报到监控系统
    // await reportError(error)
    
    // 显示错误降级页面
    const errorApp = createApp(ErrorFallback, { 
      error: error instanceof Error ? error : new Error(String(error))
    })
    errorApp.mount('#app')
  }
})
