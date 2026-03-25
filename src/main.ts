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
 * - Element Plus + VXE Table
 * - SPARK 组件系统 + 动态路由系统
 * 
 * 📦 架构层次（由 SparkApp.start 自动完成）：
 * - L1: @spark-view/spark-app - 应用基础设施层
 * - L2: @spark-view/spark-page-config - 页面配置编排层
 * - L4-L6: @spark-view/spark-component - 组件核心层
 * 
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
import type { LogTransport } from '@spark-view/spark-app'
import { addLogTransport } from '@spark-view/spark-utils'
import { onDebugRouteRequest } from '@spark-view/spark-utils'
import type { DebugRouteRequestEvent } from '@spark-view/spark-utils'
import type { LogTransport as UtilsLogTransport } from '@spark-view/spark-utils'

// 创建启动日志（临时用于启动流程）
import { createLogger } from '@spark-view/spark-app'
const startupLogger = createLogger('main')

// AI 闭环：late-binding pageId（路由就绪后由 afterMount 注入）
let _currentPageId: string | undefined

// AI 闭环：浏览器会话级 ID（页面刷新后重新生成，用于追踪一次对话周期）
const _sessionId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// 配置加载器
import { loadAppConfig } from '@spark-view/spark-app'

// 主应用组件
import { createApp } from 'vue'
import type { Router } from 'vue-router'
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
  // 租户作用域路由：/t/{tenantId}/{projectId}/xxx -> xxx
  const scopedMatch = /^\/t\/[^/]+\/[^/]+(?:\/(.+))?$/.exec(path)
  const raw = scopedMatch ? (scopedMatch[1] ?? '') : path.replace(/^\/+/, '')
  const trimmed = raw.replace(/^\/+/, '').replace(/\/+$/, '')
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
    
    // ━━ 1.5 全链路 Logger 贯穿（APP 层唯一注册点） ━━━━━━━━━━━━━━━━━━━━━━━
    //
    // 三条日志链路统一汇入同一组 transport：
    //   A) spark-utils  Logger()  → addLogTransport()   — FileLoader / bindRules / PageRenderer
    //   B) spark-app    AppLogger → addGlobalTransport() — error handler / warnHandler / startupLogger
    //   C) APP_SERVICES.logger    → 实际是 Logger('PageRenderer')，走链路 A
    //
    // collectorTransport 同时注册到 A + B，确保无论走哪条链路都能被 AI Loop 收集。
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // ⚡ AI 闭环 collectorTransport — 在 SparkApp.start 之前同步注册
    // 页面首次渲染（beforeMount 阶段注册路由后 router.isReady() 触发）产生的 JSON 解析错误等
    // 必须在渲染发生前就能被捕获，所以 transport 注册越早越好。
    interface BufferedLog { level: string; message: string; meta?: Record<string, unknown> | undefined; timestamp: number; pageId?: string | undefined }
    let _loopCollector: { push(entry: BufferedLog): void } | null = null
    const _bufferedLogs: BufferedLog[] = []

    /** 清除 meta 中不可序列化的值（Vue Proxy / 循环引用） */
    function safeMeta(raw?: Record<string, unknown>): Record<string, unknown> | undefined {
      if (raw === undefined) return undefined
      try {
        JSON.stringify(raw)
        return raw
      } catch {
        const safe: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(raw)) {
          if (v === undefined || v === null || typeof v !== 'object') { safe[k] = v; continue }
          try { safe[k] = JSON.parse(JSON.stringify(v)) }
          catch { safe[k] = '[circular]' }
        }
        return safe
      }
    }

    const collectorTransport: LogTransport & UtilsLogTransport = {
      send(level, message, meta) {
        const entry: BufferedLog = { level, message, meta: safeMeta(meta), timestamp: Date.now(), pageId: _currentPageId }
        if (_loopCollector) {
          _loopCollector.push(entry)
        } else {
          _bufferedLogs.push(entry)
        }
      },
    }

    // 链路 A：spark-utils Logger（原生 transport，结构化 message+meta，无损传递）
    addLogTransport(collectorTransport)
    // 链路 B：spark-app AppLogger（error handler / warnHandler 等）
    addGlobalTransport(collectorTransport)

    const auditRemoteLogsEnabled = import.meta.env['VITE_AUDIT_REMOTE_LOGS'] === 'true'
    if (appConfig.logger.enableRemote === true && auditRemoteLogsEnabled) {
      const remoteTransport = configureRemoteLogger({
        endpoint: appConfig.logger.remoteEndpoint ?? '/api/logs',
        minLevel: appConfig.logger.minRemoteLevel ?? 'debug',
        batchSize: appConfig.logger.batchSize ?? 50,
        flushInterval: appConfig.logger.flushInterval ?? 5000,
        getPageId: () => _currentPageId,
        sessionId: _sessionId,
      })
      // 远程日志同样双注册，确保全链路上报
      addLogTransport(remoteTransport as unknown as UtilsLogTransport)
      // remoteTransport 已通过 configureRemoteLogger 注册到 spark-app _globalTransports

      startupLogger.info('📡 远程日志已启用（全链路）', {
        endpoint: appConfig.logger.remoteEndpoint,
        minLevel: appConfig.logger.minRemoteLevel ?? 'debug',
      })
    } else {
      startupLogger.info('📋 日志模式：本地诊断（远程审计未启用）', {
        configEnableRemote: appConfig.logger.enableRemote === true,
        auditFlag: auditRemoteLogsEnabled,
      })
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
      // Element Plus 暗黑模式 CSS 变量（html.dark 时自动覆盖）
      await import('element-plus/theme-chalk/dark/css-vars.css')
    }
    const vxeConfig = appConfig.plugins['vxe-table']
    if (vxeConfig === true || (typeof vxeConfig === 'object' && vxeConfig.enabled === true)) {
      await import('vxe-table/lib/style.css')
    }
    
    startupLogger.info(`✅ 已加载 ${plugins.length} 个插件`)
    
    // 4. 构建 Vue 组件页面映射（统一定义在 vue-page-map.ts，单一维护点）
    startupLogger.info('📄 构建 Vue 组件页面映射...')
    const { buildComponentMap, buildPreAuthNavTree, getPlatformPaths } = await import('./config/vue-page-map')
    const componentMap = await buildComponentMap()

    // 登录前导航树 — 从 VUE_PAGE_MAP scope='platform' 自动派生
    const preAuthNavTree = buildPreAuthNavTree()
    // 平台级路径集合 — 路由守卫用（未登录时只允许这些路径）
    const platformPaths = getPlatformPaths()
    startupLogger.info(`✅ componentMap: ${Object.keys(componentMap).length} 个组件, preAuthNav: ${preAuthNavTree.children.length} 个节点, platformPaths: ${platformPaths.size} 个`)
    
    // 5. 导入 auth 工具
    const { getUser, isAuthenticated, switchProject } = await import('./services/auth')
    const { createAuthHeaders, http: appHttpClient } = await import('./services/http')
    const { getPageApi, getNavApi } = await import('./services/api-paths')
    const { getNavHomePath } = await import('@spark-view/spark-app')

    type DebugBridgeState = {
      installed: boolean
      offRoute?: (() => void) | undefined
    }

    const DEBUG_BRIDGE_KEY = '__SPARK_DEBUG_BRIDGE_STATE__'

    function normalizeScopedPath(path: string): string {
      if (path === '/') return '/'
      return path.replace(/\/{2,}/g, '/').replace(/\/+$/, '')
    }

    function resolveDebugTargetPath(event: DebugRouteRequestEvent): string | null {
      const rawPath = typeof event.path === 'string' && event.path.trim().length > 0
        ? event.path.trim()
        : null
      const rawPageId = typeof event.pageId === 'string' && event.pageId.trim().length > 0
        ? event.pageId.trim()
        : null

      let target = rawPath ?? (rawPageId ? (rawPageId.startsWith('/') ? rawPageId : `/${rawPageId}`) : null)
      if (target === null) return null
      if (!target.startsWith('/')) target = `/${target}`

      if (target.startsWith('/t/')) return normalizeScopedPath(target)

      if (!isAuthenticated()) {
        return normalizeScopedPath(target)
      }

      const user = getUser()
      const tenantId = typeof event.tenantId === 'string' && event.tenantId.trim().length > 0
        ? event.tenantId.trim()
        : (user?.tenantId ?? 'default')
      const projectId = typeof event.projectId === 'string' && event.projectId.trim().length > 0
        ? event.projectId.trim()
        : (user?.defaultProjectId ?? 'homepage')
      const scopePrefix = `/t/${encodeURIComponent(tenantId)}/${encodeURIComponent(projectId)}`

      if (target === '/') return normalizeScopedPath(`${scopePrefix}${getNavHomePath()}`)
      return normalizeScopedPath(`${scopePrefix}${target}`)
    }

    async function reportDebugRouteResult(payload: Record<string, unknown>): Promise<void> {
      try {
        await appHttpClient.post('/api/ai/debug/route-result', payload)
      } catch (error) {
        startupLogger.warn('上报 debug-route-result 失败', { error: String(error) })
      }
    }

    function installDebugCommandBridge(router: Router): void {
      const w = window as unknown as Record<string, unknown>
      const existing = w[DEBUG_BRIDGE_KEY] as DebugBridgeState | undefined
      if (existing?.installed) return

      const offRoute = onDebugRouteRequest(async (event) => {
        const requestId = typeof event.requestId === 'string' && event.requestId.trim().length > 0
          ? event.requestId
          : `route-${Date.now()}`
        const currentPath = router.currentRoute.value.path
        const targetPath = resolveDebugTargetPath(event)

        if (targetPath === null) {
          await reportDebugRouteResult({
            requestId,
            status: 'ignored',
            message: 'missing path/pageId',
            reason: event.reason,
            currentPath,
            pageId: extractPageId(currentPath),
            timestamp: Date.now(),
          })
          return
        }

        try {
          if (event.replace === true) {
            await router.replace(targetPath)
          } else {
            await router.push(targetPath)
          }
          const finalPath = router.currentRoute.value.path
          await reportDebugRouteResult({
            requestId,
            status: 'success',
            reason: event.reason,
            targetPath,
            currentPath: finalPath,
            pageId: extractPageId(finalPath),
            timestamp: Date.now(),
          })
        } catch (error) {
          const message = String(error)
          const finalPath = router.currentRoute.value.path
          if (message.includes('Avoided redundant navigation')) {
            await reportDebugRouteResult({
              requestId,
              status: 'success',
              reason: event.reason,
              targetPath,
              currentPath: finalPath,
              pageId: extractPageId(finalPath),
              message: 'redundant navigation treated as success',
              timestamp: Date.now(),
            })
            return
          }
          await reportDebugRouteResult({
            requestId,
            status: 'error',
            reason: event.reason,
            targetPath,
            currentPath: finalPath,
            pageId: extractPageId(finalPath),
            message,
            timestamp: Date.now(),
          })
        }
      })

      w[DEBUG_BRIDGE_KEY] = { installed: true, offRoute } as DebugBridgeState
      startupLogger.info('🛰️ 调试指令桥接已启用（route）')
    }

    // 5.1 URL → localStorage 项目上下文预同步
    // 浏览器地址栏输入跨项目 URL 时，在 registerRoutes() 加载导航树之前
    // 将 URL 中的 projectId 写入 localStorage，确保后续 API 调用使用正确的项目上下文
    {
      const urlMatch = /^\/t\/([^/]+)\/([^/]+)/.exec(window.location.pathname)
      const urlProjectId = urlMatch?.[2]
      if (urlProjectId && isAuthenticated()) {
        const user = getUser()
        if (user && urlMatch[1] === user.tenantId && urlProjectId !== user.defaultProjectId) {
          startupLogger.info(`📌 URL 项目上下文预同步: ${user.defaultProjectId} → ${urlProjectId}`)
          switchProject(urlProjectId)
        }
      }
    }

    // 6. 启动 SPARK 应用
    startupLogger.info('🚀 启动 SPARK 应用...')
    const AppPageRendererBridge = (await import('./AppPageRendererBridge.vue')).default
    
    await SparkApp.start({
      // === 应用根组件 ===
      rootComponent: App,
      
      // === 路由配置（从 JSON 加载）===
      routerMode: appConfig.router.mode,
      mountTarget: appConfig.mountTarget,
      
      // === UI 插件（动态加载）===
      plugins,

      // === CSS 主题（light / dark / auto 三模式） ===
      theme: true,
      
      // === SPARK 组件系统配置（从 JSON 加载）===
      spark: {
        ...appConfig.spark
        // SparkApp 会自动导入 virtual:spark-components
        // 不需要手动传递 registerComponents
      },
      
      // === 页面配置系统（路由从 DB 动态加载）===
      pageConfig: {
        ...appConfig.pageConfig,
        pageComponent: AppPageRendererBridge,
        componentMap,
        // 动态注入认证 / 租户请求头（FileLoader 使用 axios，不经过 fetch 拦截器）
        getHeaders: createAuthHeaders,
        isAuthenticated,
        tenantPathPrefix: '/t/:tenantId/:projectId',
        preAuthNavTree,
        // 导航树作为路由唯一来源 — DynamicRouter 从导航树派生路由
        loadNavigation: async () => {
          const { http: httpClient } = await import('./services/http')
          const data = await httpClient.get<{ childPlacement?: string; children?: unknown[]; homePath?: string }>(getNavApi())
          return {
            childPlacement: (data.childPlacement ?? 'header') as 'header' | 'sidebar',
            children: Array.isArray(data.children) ? data.children : [],
            ...(data.homePath ? { homePath: data.homePath } : {}),
          }
        },
      },
      
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

        // ── AI 闭环：尽早注入 pageId 上下文 ──
        // mount 阶段渲染页面时产生的错误需要正确的 pageId 标记，
        // 必须在 app.mount() 之前设置，否则 collectorTransport 记录的 pageId 为 undefined
        _currentPageId = extractPageId(router.currentRoute.value.path)
        router.afterEach((to) => {
          _currentPageId = extractPageId(to.path)
        })

        // ── 认证路由守卫（租户隔离） ──
        // platformPaths 从 VUE_PAGE_MAP scope='platform' 自动派生，消除硬编码
        router.beforeEach((to) => {
          const platformHomePath = preAuthNavTree.homePath ?? '/'
          if (!isAuthenticated()) {
            // 未登录：停留在平台域（平台首页/登录页/平台公开页）
            if (to.path.startsWith('/t/')) return platformHomePath
            return platformPaths.has(to.path) ? undefined : platformHomePath
          }
          const u = getUser()
          const tenantId = u?.tenantId ?? 'default'
          const projectId = u?.defaultProjectId ?? 'homepage'
          const scopePrefix = `/t/${tenantId}/${projectId}`
          // 已登录：进入租户主应用首页（平台域统一收口到首页）
          if (!to.path.startsWith('/t/')) return `${scopePrefix}${getNavHomePath()}`

          // 租户路径：验证 URL 中的 tenantId/projectId 与当前用户一致
          const urlScopeMatch = /^\/t\/([^/]+)\/([^/]+)/.exec(to.path)
          if (urlScopeMatch) {
            const urlTenantId = urlScopeMatch[1]
            const urlProjectId = urlScopeMatch[2]
            if (urlTenantId !== tenantId) {
              // 租户不匹配 → 重定向到当前租户首页
              const rest = to.path.slice(`/t/${urlTenantId}/${urlProjectId}`.length)
              return `${scopePrefix}${rest || getNavHomePath()}`
            }
            if (urlProjectId && urlProjectId !== projectId) {
              // 同租户不同项目 → 切换项目上下文，具体导航刷新由项目切换服务负责
              switchProject(urlProjectId)
            }
          }
          return undefined
        })

        startupLogger.info('✅ 应用准备挂载')
        
        // 🎨 注册 Renderer 智能组件
        const {
          RendererTable,
          RendererForm,
          RendererDetail,
          RendererTree,
          RendererList,
          RendererTabs,
          RendererCollapse,
          RendererDialog,
          RendererDrawer,
          RendererSteps,
          RendererSection,
          FieldTextarea,
          FieldHtmlEditor,
          FieldText,
          FieldNumber,
          FieldDate,
          FieldSelect,
          FieldMultiSelect,
          FieldRadio,
          FieldCheckbox,
          FieldCheckboxGroup,
          FieldSwitch,
          FieldSlider,
          FieldRate,
          FieldColor,
          FieldIcon,
          FieldImage,
          FieldFilePath,
          FieldFileBrowser,
          FieldUpload,
          FieldEntityPicker,
          FieldUserPicker,
          FieldDeptPicker,
          FieldProductPicker,
          FieldCascader,
          FieldTreeSelect,
          FieldTransfer,
          ModuleContextBadge,
        } = await import('./components/renderer-components')
        
        app.component('r-table', RendererTable)
        app.component('r-form', RendererForm)
        app.component('r-detail', RendererDetail)
        app.component('r-tree', RendererTree)
        app.component('r-list', RendererList)
        app.component('r-tabs', RendererTabs)
        app.component('r-collapse', RendererCollapse)
        app.component('r-dialog', RendererDialog)
        app.component('r-drawer', RendererDrawer)
        app.component('r-steps', RendererSteps)
        app.component('r-section', RendererSection)
        app.component('r-block', RendererSection)
        app.component('r-text', FieldText)
        app.component('r-textarea', FieldTextarea)
        app.component('r-html-editor', FieldHtmlEditor)
        app.component('r-number', FieldNumber)
        app.component('r-date', FieldDate)
        app.component('r-select', FieldSelect)
        app.component('r-multi-select', FieldMultiSelect)
        app.component('r-radio', FieldRadio)
        app.component('r-checkbox', FieldCheckbox)
        app.component('r-checkbox-group', FieldCheckboxGroup)
        app.component('r-switch', FieldSwitch)
        app.component('r-slider', FieldSlider)
        app.component('r-rate', FieldRate)
        app.component('r-color', FieldColor)
        app.component('r-icon', FieldIcon)
        app.component('r-image', FieldImage)
        app.component('r-file-path', FieldFilePath)
        app.component('r-file-browser', FieldFileBrowser)
        app.component('r-upload', FieldUpload)
        app.component('r-entity-picker', FieldEntityPicker)
        app.component('r-user-picker', FieldUserPicker)
        app.component('r-dept-picker', FieldDeptPicker)
        app.component('r-product-picker', FieldProductPicker)
        app.component('r-cascader', FieldCascader)
        app.component('r-tree-select', FieldTreeSelect)
        app.component('r-transfer', FieldTransfer)
        app.component('r-module-context-badge', ModuleContextBadge)
        
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

        // Vue 组件路由由 DynamicRouter 从导航树统一派生
        // componentMap 映射 vue-component 路径 → 组件

        // 🤖 注册 AI Studio 组件（SPARK registry + Vue 全局组件）
        const { initAiStudio } = await import('./views/app/ai-studio/initialize')
        initAiStudio()
        const AiStudioPanel = (await import('./views/app/ai-studio/AiStudioPanel.vue')).default
        app.component('ai-studio', AiStudioPanel)
        startupLogger.info('✅ AI Studio 组件注册完成')
      },
      
      // 挂载后钩子
      afterMount: (context) => {
        startupLogger.info('✅ 应用启动完成')
        
        // _currentPageId + router.afterEach 已在 beforeMount 中设置
        const { router } = context

        // 调试 SSE 指令桥接（后端发 debug-route-request 即可驱动前端切页并回执）
        installDebugCommandBridge(router)
        
        // ── AI 闭环：初始化 AI Loop 服务（可选） ──
        if (appConfig.config.features.enableAI === true) {
          // 暴露给 App.vue 的 AiChatPanel 条件渲染
          ;(window as unknown as Record<string, unknown>)['__SPARK_ENABLE_AI'] = true

          // collectorTransport 已在 1.5 节提前注册到两个 Logger 体系，
          // 此处只需异步加载 AI Loop 模块并连接缓冲区。
          Promise.all([
            import('@spark-view/spark-ai'),
            import('virtual:spark-skill-catalog').catch(() => null),
          ]).then(([{ initAILoop, setupHotReload, setConfigLoader, triggerPageRefresh, configureAILoopHttp }, skillMod]) => {
            // 生成 Skill Catalog Markdown（构建时从 @skill 注解采集）
            const skillCatalog = skillMod?.buildSkillPrompt('## SPARK Skill 目录', 'compact')

            // 配置 AI Loop HTTP 客户端的认证头和租户作用域
            configureAILoopHttp({
              getHeaders: createAuthHeaders,
              getPageApiUrl: getPageApi,
              getNavApiUrl: getNavApi,
            })

            const loop = initAILoop({
              aiEndpoint: appConfig.config.features.aiEndpoint ?? '/api/ai/chat',
              ...(skillCatalog !== undefined ? { skillCatalog } : {}),
              onFilesUpdated: (pageId) => {
                startupLogger.info('AI 已更新页面文件', { pageId })
              },
              onError: (err) => {
                startupLogger.error('AI Loop 错误', err)
              },
            })

            // 注册 configLoader 到 ai-loop（使 clearPageCache 能同时清除 memCache）
            const configRoute = router.getRoutes().find(
              r => r.meta['pageId'] !== null && r.meta['pageId'] !== undefined && r.meta['type'] !== 'system-page'
            )
            if (configRoute) {
              const routeProps = configRoute.props['default'] as Record<string, unknown> | undefined
              const loader = routeProps?.['configLoader'] as { clearCache(key?: string): void } | undefined
              if (loader) setConfigLoader(loader)
            }

            // 将缓冲区中的日志刷入 AI Loop collector，然后切换为直连
            for (const entry of _bufferedLogs) {
              loop.collector.push(entry)
            }
            _bufferedLogs.length = 0
            _loopCollector = loop.collector

            // SSE 监听：AI 写入文件后自动清缓存 + 页面组件重建
            // 通过 pageRefreshKey 递增让 router-view 内的组件重建，路由不变，AI 面板不受影响
            setupHotReload(
              () => _currentPageId ?? '',
              () => { triggerPageRefresh() },
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
        const vueRoutes = allRoutes.filter(r => r.meta['type'] === 'system-page')
        const configRoutes = allRoutes.filter(r => r.meta['type'] !== 'system-page')
        
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