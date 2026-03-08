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
 * 
 * 💾 缓存分级过期策略：
 * - 默认级别定义：0=永不过期, 1=3天, 2=7天, 3=15天(默认), 4=30天
 * - 可在 createFileLoader 配置 expirationTiers 自定义级别
 * - 可在 load 时指定 expirationLevel 为单个文件设置级别
 * - 示例：
 *   ```ts
 *   // 全局配置
 *   createFileLoader({ 
 *     defaultExpirationLevel: 3,  // 默认15天
 *     expirationTiers: [
 *       { level: 0, maxAge: Infinity, description: '永不过期' },
 *       { level: 1, maxAge: 3 * 24 * 60 * 60 * 1000 }
 *     ]
 *   })
 *   
 *   // 单文件配置
 *   loader.load('/home/pagedata.json', { expirationLevel: 0 })  // 永不过期
 *   loader.load('/admin/rule.json', { expirationLevel: 1 })     // 3天过期
 *   ```
 */

// SPARK 架构包
import { SparkApp, registerBuiltinPlugins, PluginManager, configureRemoteLogger, addGlobalTransport } from '@spark-view/spark-app'
import type { LogLevel as AppLogLevel, LogTransport } from '@spark-view/spark-app'
import { setLoggerHook } from '@spark-view/spark-utils'

// 创建启动日志（临时用于启动流程）
import { createLogger } from '@spark-view/spark-app'
const startupLogger = createLogger('main')

// AI 闭环：late-binding pageId（路由就绪后由 afterMount 注入）
let _currentPageId: string | undefined

// AI 闭环：浏览器会话级 ID（页面刷新后重新生成，用于追踪一次对话周期）
const _sessionId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

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
 * 从路由 path 提取 pageId（去除前导 `/`）
 * 例：'/order-list' → 'order-list', '/admin/users' → 'admin/users'
 */
function extractPageId(path: string): string | undefined {
  const trimmed = path.replace(/^\/+/, '')
  return trimmed.length > 0 ? trimmed : undefined
}

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
    // 🔧 清除损坏的缓存（旧版 toJSON 问题 / 前缀迁移兼容）
    if (typeof localStorage !== 'undefined') {
      const badKeys = Object.keys(localStorage).filter(k => {
        // spark_page_ 是页面配置 FileLoader 的实际前缀；spark_file_ 是旧版误用的前缀
        const isPageCache = k.startsWith('spark_page_') || k.startsWith('spark_file_')
        if (!isPageCache) return false
        try {
          const cached = localStorage.getItem(k)
          if (cached === null) return false
          const parsed: unknown = JSON.parse(cached)
          if (parsed === null || typeof parsed !== 'object') return true  // 格式不合法
          const obj = parsed as { data?: unknown }
          // :raw 槽位必须存字符串（原始文件内容），非字符串说明旧版把对象存进去了
          if (k.endsWith(':raw') && typeof obj.data !== 'string') return true
        } catch { return true /* JSON.parse 失败 → 强制清除 */ }
        return false
      })
      
      if (badKeys.length > 0) {
        startupLogger.warn(`🔧 检测到 ${badKeys.length} 个损坏的缓存项，正在清除...`)
        badKeys.forEach(k => {
          startupLogger.debug('清除缓存', { key: k })
          localStorage.removeItem(k)
        })
        startupLogger.info('✅ 缓存已清除')
      }
    }
    
    startupLogger.info('⏳ 正在加载应用配置...')
    
    // 1. 加载配置（支持多租户）
    const appConfig = await loadAppConfig()
    
    startupLogger.info('✅ 配置加载完成', {
      tenant: appConfig.tenant?.tenantName ?? '默认',
      version: appConfig.config.version
    })
    
    // 1.5 根据配置决定日志模式：本地 or 上传到服务端
    if (appConfig.logger.enableRemote === true) {
      const remoteTransport = configureRemoteLogger({
        endpoint: appConfig.logger.remoteEndpoint ?? '/api/logs',
        minLevel: appConfig.logger.minRemoteLevel ?? 'debug',
        batchSize: appConfig.logger.batchSize ?? 50,
        flushInterval: appConfig.logger.flushInterval ?? 5000,
        getPageId: () => _currentPageId,
        sessionId: _sessionId,
      })

      // 收口 spark-utils Logger（如 pageLogger / configLogger 等）：
      // 将其日志也转发到远程传输器，实现全链路覆盖。
      setLoggerHook((level: AppLogLevel, prefix: string | undefined, args: unknown[]) => {
        const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
        void remoteTransport.send(level, prefix ? `${prefix} ${message}` : message)
      })

      startupLogger.info('📡 远程日志已启用（全链路）', {
        endpoint: appConfig.logger.remoteEndpoint,
        minLevel: appConfig.logger.minRemoteLevel ?? 'debug',
      })
    } else {
      startupLogger.info('📋 日志模式：仅本地控制台')
    }
    
    // 2. 注册内置插件加载器
    registerBuiltinPlugins()
    
    // 3. 动态加载插件（根据配置）
    startupLogger.info('🔌 正在加载 UI 插件...')
    const pluginInstances = await PluginManager.loadPlugins(appConfig.plugins)
    const plugins = pluginInstances.map(p => p.plugin)
    
    // 加载插件样式
    const epConfig = appConfig.plugins['element-plus']
    if (epConfig === true || (typeof epConfig === 'object' && epConfig.enabled === true)) {
      await import('element-plus/dist/index.css')
    }
    const vxeConfig = appConfig.plugins['vxe-table']
    if (vxeConfig === true || (typeof vxeConfig === 'object' && vxeConfig.enabled === true)) {
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
      
      // === 生命周期钩子 ===
      
      // 启动前钩子
      onBeforeStart: () => {
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
          RendererTree,
          FieldText,
          FieldNumber,
          FieldDate
        } = await import('./components/renderer-components')
        
        app.component('r-table', RendererTable)
        app.component('r-form', RendererForm)
        app.component('r-detail', RendererDetail)
        app.component('r-tree', RendererTree)
        app.component('r-text', FieldText)
        app.component('r-number', FieldNumber)
        app.component('r-date', FieldDate)
        
        // 示例：使用包提供的运行时自动注册工具
        // 这段代码演示了在项目根的 `src/main.ts` 中直接调用
        // `setupAutoRegister` 来扫描并注册所有 Vue 组件。
        //
        // 如果你不需要自定义选项，可以把它放在 `onBeforeStart`
        // 或者 `beforeMount` 钩子里，SparkApp.start 会在此之后进行
        // 路由/页面配置等初始化。
        const { setupAutoRegister } = await import('@spark-view/spark-app')
        await setupAutoRegister(app, {
          // patterns: ['./src/components/**/*.vue'],
          // exclude: ['**/demo/**']
        })

        // 注册静态 Vue 组件路由（非配置页面）
        
        // 导入 Vue 组件页面
        const Dashboard = (await import('./views/Dashboard.vue')).default
        const About = (await import('./views/About.vue')).default
        const Settings = (await import('./views/Settings.vue')).default
        const CapabilityDemo = (await import('./views/CapabilityDemo.vue')).default
        const TenantConfigDemo = (await import('./views/TenantConfigDemo.vue')).default
        
        // 验证组件导入成功
        const components = {
          Dashboard,
          About,
          Settings,
          CapabilityDemo,
          TenantConfigDemo
        }
        
        for (const [name, component] of Object.entries(components)) {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- 防御性检查：确保动态导入成功
          if (!component) {
            startupLogger.error(`❌ 组件导入失败: ${name}`)
            throw new Error(`组件导入失败: ${name}`)
          }
        }
        
        startupLogger.info('✅ 所有静态组件导入成功')
        
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

        // 🤖 注册 AI Studio 组件（SPARK registry + Vue 全局组件）
        const { initAiStudio } = await import('./features/ai-studio/initialize')
        initAiStudio()
        const AiStudioPanel = (await import('./features/ai-studio/AiStudioPanel.vue')).default
        app.component('ai-studio', AiStudioPanel)
        startupLogger.info('✅ AI Studio 组件注册完成')
      },
      
      // 挂载后钩子
      afterMount: (context) => {
        startupLogger.info('✅ 应用启动完成')
        
        // ── AI 闭环：注入 pageId 上下文 ──
        // 路由切换时实时更新 _currentPageId，Logger 自动携带
        const { router } = context
        _currentPageId = extractPageId(router.currentRoute.value.path)
        router.afterEach((to) => {
          _currentPageId = extractPageId(to.path)
        })
        
        // ── AI 闭环：初始化 AI Loop 服务（可选） ──
        if (appConfig.config.features.enableAI === true) {
          import('./services/ai-loop').then(({ initAILoop, setupHotReload }) => {
            const loop = initAILoop({
              aiEndpoint: appConfig.config.features.aiEndpoint ?? '/api/ai/chat',
              onFilesUpdated: (pageId) => {
                startupLogger.info('AI 已更新页面文件', { pageId })
              },
              onError: (err) => {
                startupLogger.error('AI Loop 错误', err)
              },
            })

            // 将 AI Loop 的日志收集器注册为全局传输器消费端
            const collectorTransport: LogTransport = {
              send(level, message, meta) {
                loop.collector.push({
                  level,
                  message,
                  meta,
                  timestamp: Date.now(),
                  pageId: _currentPageId,
                })
              },
            }
            addGlobalTransport(collectorTransport)

            // SSE 监听：AI 写入文件后自动清缓存 + 热重载当前页面
            setupHotReload(
              () => _currentPageId ?? '',
              () => { window.location.reload() },
            )

            // 浏览器控制台快捷入口：window.__aiLoop
            if (import.meta.env.DEV) {
              const w = window as unknown as Record<string, unknown>
              w['__aiLoop'] = {
                /** 生成新页面：__aiLoop.generate('my-page', '订单列表') */
                generate: (pageId: string, prompt: string) => loop.generate(pageId, prompt),
                /** 迭代修改：__aiLoop.iterate('my-page', '表格没数据') */
                iterate: (pageId: string, feedback?: string) => loop.iterate(pageId, feedback),
                /** 查看收集的日志 */
                logs: (pageId?: string) => loop.collector.peek(pageId),
                /** 当前会话 ID */
                sessionId: loop.sessionId,
              }
              startupLogger.info('💡 控制台可用：window.__aiLoop.generate(pageId, prompt)')
            }

            startupLogger.info('🤖 AI Loop 已初始化', { sessionId: loop.sessionId })
          }).catch((err: unknown) => {
            startupLogger.warn('AI Loop 加载失败', { error: String(err) })
          })
        }
        
        // 统计路由信息
        const allRoutes = context.router.getRoutes()
        const vueRoutes = allRoutes.filter(r => r.meta['type'] === 'vue-component')
        const configRoutes = allRoutes.filter(r => r.meta['type'] !== 'vue-component')
        
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
      onStartError: (error) => {
        startupLogger.error('❌ 应用启动失败', error instanceof Error ? error : { error })
        
        // TODO: 错误上报到监控系统
        // await reportError(error)
        
        // 检查 #app 是否已经有挂载的应用
        const appElement = document.querySelector('#app')
        if (appElement?.innerHTML) {
          startupLogger.warn('⚠️ 检测到已挂载的应用，跳过错误页面渲染')
          return
        }
        
        // 显示错误降级页面
        const errorApp = createApp(ErrorFallback, { 
          error: error instanceof Error ? error : new Error(String(error))
        })
        errorApp.mount('#app')
      }
    })
  } catch (error) {
    startupLogger.error('❌ 应用启动失败', error instanceof Error ? error : { error })
    
    // 检查 #app 是否已经有挂载的应用
    const appElement = document.querySelector('#app')
    if (appElement?.innerHTML) {
      startupLogger.warn('⚠️ 检测到已挂载的应用，跳过错误页面渲染')
      return
    }
    
    // 配置加载失败时的降级处理
    const errorApp = createApp(ErrorFallback, { 
      error: error instanceof Error ? error : new Error('配置加载失败')
    })
    errorApp.mount('#app')
  }
}

// 启动应用
void startApp()