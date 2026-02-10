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
 * 
 * ⚡ 性能优化：
 * - Syncfusion 样式按需加载（路由级懒加载，首屏减少 ~800 KB）
 * - 使用 useSyncfusionLoader 在使用时动态加载，不影响主入口
 */

// SPARK 架构包
import { SparkApp, registerBuiltinPlugins, PluginManager } from '@spark-view/spark-app'

// 创建启动日志（临时用于启动流程）
import { createLogger } from '@spark-view/spark-app'
const startupLogger = createLogger('main')

// 配置加载器
import { loadAppConfig } from './config/loader'

// 主应用组件
import { createApp } from 'vue'
import App from './App.vue'
import ErrorFallback from './components/ErrorFallback.vue'
import './style.css'

// ============================================================================
// 应用启动入口（配置从 JSON 加载）
// ============================================================================

/**
 * 启动应用
 * 
 * 流程：
 * 1. 识别租户（URL 参数、子域名、localStorage）
 * 2. 加载配置（默认配置 + 租户配置）
 * 3. 动态导入 UI 插件
 * 4. 启动 SPARK 应用
 */
async function startApp() {
  try {
    startupLogger.info('⏳ 正在加载应用配置...')
    
    // 1. 加载配置（支持多租户）
    const appConfig = await loadAppConfig()
    
    startupLogger.info('✅ 配置加载完成', {
      tenant: appConfig.tenant?.tenantName ?? '默认',
      version: appConfig.config.version
    })
    
    // 2. 注册内置插件加载器
    registerBuiltinPlugins()
    
    // 3. 动态加载插件（根据配置）
    startupLogger.info('🔌 正在加载 UI 插件...')
    const pluginInstances = await PluginManager.loadPlugins(appConfig.plugins)
    const plugins = pluginInstances.map(p => p.plugin)
    
    // 加载插件样式
    if (appConfig.plugins['element-plus']) {
      await import('element-plus/dist/index.css')
    }
    if (appConfig.plugins['vxe-table']) {
      await import('vxe-table/lib/style.css')
    }
    
    startupLogger.info(`✅ 已加载 ${plugins.length} 个插件`)
    
    // 4. 启动 SPARK 应用
    startupLogger.info('🚀 启动 SPARK 应用...')
    
    await SparkApp.start({
      // === 应用根组件 ===
      rootComponent: App,
      
      // === 路由配置（从 JSON 加载）===
      routerMode: appConfig.router.mode,
      mountTarget: appConfig.mountTarget,
      
      // === UI 插件（动态加载）===
      plugins,
      
      // === SPARK 组件系统配置（从iSON 加载）===
      spark: {
        ...appConfig.spark
        // SparkApp 会自动导入 virtual:spark-components
        // 不需要手动传递 registerComponents
      },
      
      // === 页面配置系统（从 JSON 加载）===
      pageConfig: appConfig.pageConfig,
      
      // === 应用基础配置（从 JSON 加载）===
      config: appConfig.config,
      
      // === Logger 配置（从 JSON 加载）===
      logger: appConfig.logger,
      
      // === 生命周期钩子 ===
      
      // 启动前钩子
      onBeforeStart: async () => {
        startupLogger.info('🚀 SPARK 应用启动中...')
      },
      
      // 挂载前钩子
      beforeMount: async (context) => {
        const { router, app } = context
        
        startupLogger.info('✅ 应用准备挂载')
        
        // 🎨 注册 Renderer 智能组件
        const {
          RendererTable,
          RendererForm,
          RendererDetail,
          FieldText,
          FieldNumber,
          FieldDate
        } = await import('@spark-view/spark-renderer/components')
        
        app.component('r-table', RendererTable)
        app.component('r-form', RendererForm)
        app.component('r-detail', RendererDetail)
        app.component('r-text', FieldText)
        app.component('r-number', FieldNumber)
        app.component('r-date', FieldDate)
        
        // 注册静态 Vue 组件路由（非配置页面）
        
        // 导入 Vue 组件页面
        const Dashboard = (await import('./views/Dashboard.vue')).default
        const About = (await import('./views/About.vue')).default
        const Settings = (await import('./views/Settings.vue')).default
        const CapabilityDemo = (await import('./views/CapabilityDemo.vue')).default
        const ComponentRendererDemo = (await import('./views/ComponentRendererDemo.vue')).default
        const TenantConfigDemo = (await import('./views/TenantConfigDemo.vue')).default
        
        // 注册能力演示组件（SparkApp 已自动处理编译时注册）
        // 如果需要运行时动态注册，可在此处添加
        
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
          path: '/component-renderer',
          name: 'component-renderer',
          component: ComponentRendererDemo,
          meta: {
            title: '组件渲染器演示',
            icon: '🎨',
            type: 'vue-component'
          }
        })
        
        router.addRoute({
          path: '/tenant-config',
          name: 'tenant-config',
          component: TenantConfigDemo,
          meta: {
            title: '多租户配置',
            icon: '🏢',
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
        
        startupLogger.info('✅ 静态 Vue 组件路由注册完成')
      },
      
      // 挂载后钩子
      afterMount: async (context) => {
        startupLogger.info('✅ 应用启动完成')
        
        // 统计路由信息
        const allRoutes = context.router.getRoutes()
        const vueRoutes = allRoutes.filter(r => r.meta?.type === 'vue-component')
        const configRoutes = allRoutes.filter(r => r.meta?.type !== 'vue-component')
        
        startupLogger.info('📊 路由统计', {
          总路由数: allRoutes.length,
          Vue组件页面: vueRoutes.length, 
          配置页面: configRoutes.length
        })
        
        startupLogger.info('🎉 混合渲染系统启动完成!')
        startupLogger.info('📄 Vue 组件页面:', { paths: vueRoutes.map(r => r.path) })
        startupLogger.info('⚙️ 配置页面:', { paths: configRoutes.map(r => r.path) })
      },
      
      // === 错误处理 ===
      onStartError: async (error) => {
        startupLogger.error('❌ 应用启动失败', error instanceof Error ? error : { error })
        
        // TODO: 错误上报到监控系统
        // await reportError(error)
        
        // 显示错误降级页面
        const errorApp = createApp(ErrorFallback, { 
          error: error instanceof Error ? error : new Error(String(error))
        })
        errorApp.mount('#app')
      }
    })
  } catch (error) {
    startupLogger.error('❌ 应用启动失败', error instanceof Error ? error : { error })
    
    // 配置加载失败时的降级处理
    const errorApp = createApp(ErrorFallback, { 
      error: error instanceof Error ? error : new Error('配置加载失败')
    })
    errorApp.mount('#app')
  }
}

// 启动应用
void startApp()