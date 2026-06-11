<!--
@module app:App
app 的 App 模块。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <!-- 登录页：无布局框架 -->
  <router-view v-if="isLoginPage" />

  <!-- 业务页：完整布局 -->
  <template v-else>
    <AppLayout
      :header-first="headerFirst"
      :show-header="true"
      :show-breadcrumb="mode === 'single'"
      :show-tab-bar="mode === 'multi'"
      :show-footer="showFooter"
      :show-sidebar="nav.regionVisibility.value.sidebar"
      :show-right-sidebar="false"
      :collapsed="sidebarCollapsed"
    >
      <template #sidebar>
        <AppSidebar
          :title="'SPARK'"
          :collapsed="sidebarCollapsed"
          :items="nav.regionItems.value.sidebar"
        />
      </template>

      <template #header>
        <AppHeader
          :title="headerTitle"
          :is-dark="isDark"
          :collapsed="sidebarCollapsed"
          :collapsible="nav.regionVisibility.value.sidebar"
          :username="currentUsername"
          :toolbar-items="nav.regionItems.value.toolbar"
          :user-menu-items="nav.regionItems.value.userMenu"
          @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
          @user-command="handleUserCommand"
        >
          <template #nav>
            <NavHeaderBar
              v-if="nav.regionVisibility.value.header"
              :items="nav.regionItems.value.header"
            />
          </template>
        </AppHeader>
      </template>

      <template #breadcrumb>
        <AppBreadcrumb>
          <template v-if="nav.moduleContext.value" #trailing>
            <NavContextSelector :state="nav.moduleContext.value" />
          </template>
        </AppBreadcrumb>
      </template>

      <template #tab-bar>
        <AppTabBar>
          <template v-if="nav.moduleContext.value" #trailing>
            <NavContextSelector :state="nav.moduleContext.value" />
          </template>
        </AppTabBar>
      </template>

      <router-view v-slot="{ Component }">
        <div v-if="contextGuard" class="app-context-guard">
          <div class="app-context-guard__badge">Context Required</div>
          <h2>{{ contextGuard.title }}</h2>
          <p>{{ contextGuard.message }}</p>
          <div class="app-context-guard__meta">
            <span>当前路径：{{ route.path }}</span>
            <span v-if="contextGuard.expectedPath">建议路径：{{ contextGuard.expectedPath }}</span>
          </div>
          <div class="app-context-guard__actions">
            <button type="button" class="app-context-guard__primary" @click="handleContextGuardPrimary">
              {{ contextGuard.primaryActionLabel }}
            </button>
            <button
              v-if="contextGuard.expectedPath"
              type="button"
              class="app-context-guard__secondary"
              @click="jumpToExpectedContext"
            >
              跳转到作用域路径
            </button>
          </div>
        </div>
        <keep-alive v-else-if="mode === 'multi'" :max="10">
          <component
            v-if="isSparkRendererRoute"
            :is="Component"
            :key="sparkRendererRouteKey"
          />
          <component v-else :is="Component" :key="route.path" />
        </keep-alive>
        <transition v-else name="fade" mode="out-in">
          <component
            v-if="!contextGuard && isSparkRendererRoute"
            :is="Component"
            :key="sparkRendererRouteKey"
          />
          <component v-else-if="!contextGuard" :is="Component" :key="route.fullPath" />
        </transition>
      </router-view>

      <template #footer>
        <AppFooter />
      </template>
    </AppLayout>

    <ThemeConfigurator
      v-model="showConfigurator"
      v-model:header-first="headerFirst"
      v-model:collapsed="sidebarCollapsed"
      v-model:show-footer="showFooter"
      :mode="mode"
      @update:mode="setMode"
    />

    <!-- page-ui host 是 APP 壳层能力，承载弹层、文件浏览和文件上传。 -->
    <AppPageUiHost />
  </template>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as SparkAppRuntime from '@spark-appworks/spark-app'
import { AI_AGENT_HOST } from '@spark-appworks/spark-ai/agent'
import type { ProjectModelData } from '@spark-appworks/spark-project-model'
import { PAGE_RUNTIME_SERVICES } from '@spark-appworks/spark-component'
import {
  MODULE_CONTEXT,
  useSparkComponent,
  type ModuleContext,
  type ModuleContextCapability,
} from '@spark-appworks/spark-component'
import {
  getToken,
  getUser,
  isAuthenticated,
  isPlatformAdminUser,
  markLogoutPending,
  switchProject,
} from '@/services/auth'
import { resetAppProjectWorkspace } from '@/services/project-workspace'
import {
  readAppProjectNavigationRoot,
  resetAppProjectModel,
  syncAppProjectModelFromNav,
} from '@/services/app-project-model'
import {
  registerShellNavRootListener,
  reloadAndSyncNavigation,
  syncCommittedNavigationFromRouter,
} from '@/services/navigation-sync'
import AppLayout from '@/layout/AppLayout.vue'
import AppHeader from '@/layout/AppHeader.vue'
import AppBreadcrumb from '@/layout/AppBreadcrumb.vue'
import AppFooter from '@/layout/AppFooter.vue'
import AppSidebar from '@/layout/AppSidebar.vue'
import AppTabBar from '@/layout/AppTabBar.vue'
import NavHeaderBar from '@/layout/NavHeaderBar.vue'
import NavContextSelector from '@/layout/NavContextSelector.vue'
import ThemeConfigurator from '@/layout/ThemeConfigurator.vue'
import { createAiHostRunBridge } from '@/services/ai-host-run-bridge'
import { appAiAgent } from '@/services/ai-host'
import { createAuthHeaders } from '@/services/http'
import { chainAiHostRunPrepare } from '@/services/ai-host-run-prepare'
import { preparePageDesignHostRun } from '@/services/page-design-host-run-provider'
import { prepareProjectPlanningHostRun } from '@/services/project-planning-host-run-provider'
import { runAiHostRunSmokeLauncherFromUrl } from '@/services/ai-host-run-smoke-launcher'
import { onPageConfigChange, type FileChangeEvent } from '@/services/sse-events'
import { PROJECT_SWITCH_KEY } from '@/services/project-switch'
import type { ProjectSwitchService } from '@/services/project-switch'
import { loadProjectUiSettings, saveProjectUiSettings } from '@/services/project-ui-settings'
import { buildTenantPath, buildTenantRootPath, parseTenantScope, stripTenantScope } from '@/services/tenant-scope'
import { getPublicPaths } from '@/registries/vue-page-registry'

const {
  AppPageUiHost,
  clearAllPageCache,
  appPageUiService,
  createNavigationActionRegistry,
  getPageCacheHandle,
  getNavHomePath,
  getNavTree,
  getPageCacheStats,
  NAVIGATION_ACTION_REGISTRY_KEY,
  refreshRoutes,
  setColorSchemeStorageScope,
  useColorScheme,
  useNavigation,
  useTabPages,
  useTheme,
} = SparkAppRuntime

const { sparkProvide } = useSparkComponent({ type: 'app-shell' })

const route = useRoute()
const router = useRouter()
const isLoginPage = computed(() => route.path === '/login' || route.path === '/')
const publicPaths = getPublicPaths()
const PLATFORM_PATH_PREFIX = '/platform'
const PLATFORM_HOME_PATH = '/platform/dashboard'
const currentUsername = computed(() => {
  const user = getUser()
  return user?.displayName ?? user?.username ?? '管理员'
})

function isPlatformWorkspacePath(path: string): boolean {
  return path === PLATFORM_PATH_PREFIX || path.startsWith(`${PLATFORM_PATH_PREFIX}/`)
}

function resolveActiveProjectId(): string {
  if (isPlatformWorkspacePath(route.path)) return 'platform'
  return parseTenantScope(route.path)?.projectId ?? getUser()?.defaultProjectId ?? 'homepage'
}

const activeProjectId = ref(resolveActiveProjectId())
const headerTitle = computed(() =>
  activeProjectId.value === 'platform'
    ? 'SPARK 平台管理'
    : activeProjectId.value === 'homepage' ? 'SPARK 应用工场' : `SPARK · ${activeProjectId.value}`
)
const theme = useTheme()
const isDark = computed(() => theme?.isDark ?? false)
const toggleTheme = () => theme?.toggle()
const sidebarCollapsed = ref(false)
const headerFirst = ref(false)
const showFooter = ref(true)
const showConfigurator = ref(false)
const { mode, setMode } = useTabPages()
useColorScheme()
const activeSettingsScope = ref<string | null>(null)
let isApplyingProjectUiSettings = false
let _stopPageConfigChange: (() => void) | null = null
let _stopAiHostRunBridge: (() => void) | null = null
const pageNodeRefreshRevision = ref(0)
const sparkRendererRouteKey = computed(() => {
  const base = mode.value === 'multi' ? route.path : route.fullPath
  return `${base}::page-node-${pageNodeRefreshRevision.value}`
})

function toTenantProjectSettingsScope(tenantId: string | undefined, projectId: string | undefined): string | null {
  if (!tenantId || !projectId) return null
  return `tenant:${tenantId}:project:${projectId}`
}

function resolveActiveSettingsScope(): string | null {
  if (isPlatformWorkspacePath(route.path)) return 'platform:platform'
  const scoped = parseTenantScope(route.path)
  if (scoped !== null) return toTenantProjectSettingsScope(scoped.tenantId, scoped.projectId)
  const user = getUser()
  return toTenantProjectSettingsScope(user?.tenantId, user?.defaultProjectId)
}

function resolveProjectSettingsScope(projectId: string): string | null {
  if (projectId === 'platform') return 'platform:platform'
  const user = getUser()
  return toTenantProjectSettingsScope(user?.tenantId, projectId)
}

function normalizeSettingsScope(scopeKey: string | null): string | null {
  if (typeof scopeKey !== 'string') return null
  const trimmed = scopeKey.trim()
  return trimmed.length > 0 ? trimmed : null
}

function applyProjectSettingsScope(scopeKey: string | null, force = false): void {
  const normalizedScope = normalizeSettingsScope(scopeKey)
  if (!force && activeSettingsScope.value === normalizedScope) return

  activeSettingsScope.value = normalizedScope
  theme?.setStorageScope(normalizedScope)
  setColorSchemeStorageScope(normalizedScope)

  const settings = loadProjectUiSettings(normalizedScope)
  isApplyingProjectUiSettings = true
  try {
    headerFirst.value = settings.headerFirst
    sidebarCollapsed.value = settings.sidebarCollapsed
    showFooter.value = settings.showFooter
    setMode(settings.pageMode)
  } finally {
    isApplyingProjectUiSettings = false
  }
}

function persistCurrentProjectUiSettings(): void {
  if (isApplyingProjectUiSettings) return
  saveProjectUiSettings(activeSettingsScope.value, {
    headerFirst: headerFirst.value,
    sidebarCollapsed: sidebarCollapsed.value,
    showFooter: showFooter.value,
    pageMode: mode.value,
  })
}

watch([headerFirst, sidebarCollapsed, showFooter, mode], persistCurrentProjectUiSettings, { flush: 'sync' })

type AppContextGuardState = {
  title: string
  message: string
  primaryActionLabel: string
  expectedPath?: string}

const contextGuard = computed<AppContextGuardState | null>(() => {
  if (isLoginPage.value) return null

  const currentPath = route.path
  const scoped = parseTenantScope(currentPath)
  const token = getToken()
  const user = getUser()

  if (scoped === null) {
    if (publicPaths.has(currentPath)) return null
    if (isPlatformWorkspacePath(currentPath) && token && user && isPlatformAdminUser(user)) return null
    const expectedPath = user?.tenantId && user.defaultProjectId
      ? buildTenantPath({ tenantId: user.tenantId, projectId: user.defaultProjectId }, currentPath)
      : undefined
    return {
      title: '当前页面缺少租户作用域',
      message: '这个业务页需要在 /t/{tenantId}/{projectId}/... 作用域下运行。外部浏览器有数据而内嵌浏览器没数据，通常就是当前浏览器上下文没有进入正确租户路径或未完成登录。',
      primaryActionLabel: user ? '进入当前项目首页' : '前往登录页',
      ...(expectedPath !== undefined ? { expectedPath } : {}),
    }
  }

  if (!token || !user) {
    return {
      title: '当前浏览器上下文未登录',
      message: '该页面的数据请求依赖 localStorage 中的 spark_token 和 spark_user。VS Code 内嵌浏览器与外部浏览器不共享登录态，所以这里需要单独登录。',
      primaryActionLabel: '前往登录页',
      expectedPath: '/login',
    }
  }

  if (!user.tenantId || !user.defaultProjectId) {
    return {
      title: '当前浏览器上下文缺少项目信息',
      message: '已检测到登录态，但 spark_user 中缺少 tenantId 或 defaultProjectId，后续请求无法带出 X-Tenant-Id / X-Project-Id，页面会表现为空数据。',
      primaryActionLabel: '前往登录页',
      expectedPath: '/login',
    }
  }

  if (isPlatformAdminUser(user)) {
    return null
  }

  if (scoped.tenantId !== user.tenantId || scoped.projectId !== user.defaultProjectId) {
    const restPath = stripTenantScope(currentPath)
    const expectedPath = restPath
      ? buildTenantPath({ tenantId: user.tenantId, projectId: user.defaultProjectId }, restPath)
      : buildTenantRootPath({ tenantId: user.tenantId, projectId: user.defaultProjectId })
    return {
      title: 'URL 作用域与本地上下文不一致',
      message: '当前 URL 的 tenant/project 与浏览器 localStorage 中保存的 spark_user 不一致。继续渲染会导致接口上下文错位，出现空数据或错误数据。',
      primaryActionLabel: '切回当前项目',
      expectedPath,
    }
  }

  return null
})

async function handleContextGuardPrimary(): Promise<void> {
  if (contextGuard.value?.primaryActionLabel === '前往登录页') {
    await router.replace('/login')
    return
  }
  jumpToExpectedContext()
}

function jumpToExpectedContext(): void {
  const expectedPath = contextGuard.value?.expectedPath
  if (!expectedPath) return
  void router.replace(expectedPath)
}

/* ── 项目切换服务（供子组件注入） ── */
const projectSwitchService: ProjectSwitchService = {
  async switchAndReload(projectId: string) {
    switchProject(projectId)
    activeProjectId.value = projectId
    applyProjectSettingsScope(resolveProjectSettingsScope(projectId))
    try {
      await reloadNavigation()
    } catch (e) {
      if (import.meta.env.DEV) console.error('[Nav] 导航加载失败', e)
    }
  },
}
provide(PROJECT_SWITCH_KEY, projectSwitchService)

const navigationActionRegistry = createNavigationActionRegistry()
provide(NAVIGATION_ACTION_REGISTRY_KEY, navigationActionRegistry)

function emitNavigationAction(command: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('spark:navigation-action', { detail: { command } }))
}

async function toggleFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return
  if (document.fullscreenElement) {
    await document.exitFullscreen()
    return
  }
  await document.documentElement.requestFullscreen()
}

navigationActionRegistry.register('profile', () => {
  emitNavigationAction('profile')
})
navigationActionRegistry.register('settings', () => {
  showConfigurator.value = true
})
navigationActionRegistry.register('home', () => {
  const user = getUser()
  if (isPlatformAdminUser(user)) {
    void router.push(PLATFORM_HOME_PATH)
  } else if (user && user.defaultProjectId !== 'homepage') {
    void projectSwitchService.switchAndReload('homepage').then(() => {
      void router.push(buildTenantPath({ tenantId: user.tenantId, projectId: 'homepage' }, getNavHomePath()))
    })
  } else if (user) {
    void router.push(buildTenantPath({ tenantId: user.tenantId, projectId: user.defaultProjectId }, getNavHomePath()))
  } else {
    void router.push('/')
  }
})
navigationActionRegistry.register('logout', () => {
  markLogoutPending()
  resetAppProjectWorkspace()
  resetAppProjectModel()
  clearAllPageCache()
  window.location.replace(router.resolve('/').href)
})
navigationActionRegistry.register('search', () => {
  emitNavigationAction('search')
})
navigationActionRegistry.register('fullscreen', () => {
  void toggleFullscreen()
})
navigationActionRegistry.register('notifications', () => {
  emitNavigationAction('notifications')
})
navigationActionRegistry.register('theme-toggle', () => {
  toggleTheme()
})

/* ── 导航模型（预认证时使用 preAuthNavTree，登录后使用远程导航树） ── */
const _navRoot = reactive<ProjectModelData>({ title: '', childPlacement: 'header', children: [] })
const nav = useNavigation(_navRoot, {
  onCrossAppNavigate: handleCrossAppNavigate,
  getHeaders: createAuthHeaders,
  actionRegistry: navigationActionRegistry,
})
const pageUiService = appPageUiService
sparkProvide(AI_AGENT_HOST, appAiAgent)
sparkProvide(PAGE_RUNTIME_SERVICES, { pageService: pageUiService })
const isSparkRendererRoute = computed(() => {
  const routeType = route.meta['type']
  return routeType === 'config-page' || routeType === 'cross-project-ref'
})
const pageModuleContext = computed<ModuleContext | null>(() => {
  const state = nav.moduleContext.value
  if (!state) return null
  return {
    selected: state.selected,
    items: state.items,
    nodeId: state.nodeId,
  }
})
type ModuleContextChangeHandler = {
  (next: ModuleContext | null, prev: ModuleContext | null): void}
const moduleContextListeners = new Set<ModuleContextChangeHandler>()

function cloneModuleContext(value: ModuleContext | null | undefined): ModuleContext | null {
  if (!value) return null
  const safeItems = Array.isArray(value.items) ? value.items : []
  return {
    nodeId: value.nodeId,
    selected: value.selected,
    items: safeItems.map(item => ({ id: item.id, title: item.title })),
  }
}

function moduleContextSignature(value: ModuleContext | null | undefined): string {
  if (!value) return ''
  const safeItems = Array.isArray(value.items) ? value.items : []
  return JSON.stringify({
    nodeId: value.nodeId,
    selected: value.selected,
    items: safeItems.map(item => ({ id: item.id, title: item.title })),
  })
}

function emitModuleContextChange(
  next: ModuleContext | null | undefined,
  prev: ModuleContext | null | undefined,
): void {
  const nextSnapshot = cloneModuleContext(next)
  const prevSnapshot = cloneModuleContext(prev)
  for (const handler of moduleContextListeners) {
    try {
      handler(nextSnapshot, prevSnapshot)
    } catch (error: unknown) {
      if (import.meta.env.DEV) {
        console.error('[App] 模块上下文变化订阅回调执行失败', error)
      }
    }
  }
}

function readRoutePageId(): string | null {
  const pageId = route.meta['pageId']
  return typeof pageId === 'string' && pageId.length > 0 ? pageId : null
}

function handlePageConfigChange(event: FileChangeEvent): void {
  getPageCacheHandle()?.clearPageCache(event.pageId)
  const refPageId = route.meta['refPageId']
  if (
    readRoutePageId() === event.pageId
    || (typeof refPageId === 'string' && refPageId === event.pageId)
  ) {
    pageNodeRefreshRevision.value += 1
  }
}

const moduleContextCapability: ModuleContextCapability = {
  getCurrent() {
    return cloneModuleContext(pageModuleContext.value)
  },
  subscribe(handler) {
    moduleContextListeners.add(handler)
    return () => {
      moduleContextListeners.delete(handler)
    }
  },
}
sparkProvide(MODULE_CONTEXT, moduleContextCapability)

let _prevModuleContext = pageModuleContext.value
watch(
  () => moduleContextSignature(pageModuleContext.value),
  () => {
    const next = pageModuleContext.value
    const prev = _prevModuleContext
    _prevModuleContext = next
    emitModuleContextChange(next, prev)
  },
)

watch(
  () => route.path,
  () => {
    activeProjectId.value = resolveActiveProjectId()
    applyProjectSettingsScope(resolveActiveSettingsScope())
    syncAppNavProjectionFromRouter()
  },
  { immediate: true },
)

let unregisterShellNavListener: (() => void) | null = null

/** 将导航树数据写入 _navRoot 响应对象（驱动 useNavigation UI） */
function applyNavTree(navData: ProjectModelData | null): void {
  const safeChildren = Array.isArray(navData?.children) ? navData.children : []
  if (navData && safeChildren.length > 0) {
    _navRoot.childPlacement = navData.childPlacement
    _navRoot.children = safeChildren
  } else if (import.meta.env.DEV) {
    console.warn('[Nav] ⚠️ 导航树为空')
  }
}

function syncAppNavProjectionFromRouter(): void {
  syncAppProjectModelFromNav(getNavTree())
  applyNavTree(readAppProjectNavigationRoot())
}

async function reloadNavigation(): Promise<void> {
  await reloadAndSyncNavigation()
}

onMounted(() => {
  // APP 公共 SSE 在壳层接入：页面配置刷新和 Host Run 桥接共用同一条 /api/events。
  if (_stopPageConfigChange === null) {
    _stopPageConfigChange = onPageConfigChange(handlePageConfigChange)
  }
  if (_stopAiHostRunBridge === null) {
    _stopAiHostRunBridge = createAiHostRunBridge({
      host: appAiAgent,
      prepareRun: chainAiHostRunPrepare(
        preparePageDesignHostRun,
        prepareProjectPlanningHostRun,
      ),
    }).start()
  }
  runAiHostRunSmokeLauncherFromUrl()

  unregisterShellNavListener = registerShellNavRootListener(applyNavTree)

  // start.ts 已在 mount 前调用 registerRoutes() 注册路由 + 加载导航树
  // 此处同步读取已加载的导航树并写入 _navRoot + editor.project，不发起重复 HTTP 请求
  if (isAuthenticated()) {
    syncCommittedNavigationFromRouter()
  } else {
    syncAppNavProjectionFromRouter()
  }

  // 暴露开发工具到 window.__sparkDev（清缓存页面使用）
  Object.defineProperty(window, '__sparkDev', {
    value: { reloadNavigation, clearAllPageCache, getPageCacheStats, refreshRoutes, router },
    configurable: true,
    writable: true,
  })

  // 允许任意组件通过自定义事件触发导航重新加载
  window.addEventListener('spark:reloadNavigation', () => { void reloadNavigation() })
})

onUnmounted(() => {
  unregisterShellNavListener?.()
  unregisterShellNavListener = null
  moduleContextListeners.clear()
  _stopPageConfigChange?.()
  _stopPageConfigChange = null
  _stopAiHostRunBridge?.()
  _stopAiHostRunBridge = null
})

// ── 登录后自动同步导航 UI ──
watch(isLoginPage, (isLogin, wasLogin) => {
  if (wasLogin && !isLogin && isAuthenticated()) {
    // LoginView 已在跳转前 reloadAndSyncNavigation
    syncCommittedNavigationFromRouter()
  }
})

/* ── Header / 用户菜单命令 ── */
function handleUserCommand(command: string) {
  void navigationActionRegistry.execute(command, { source: 'app-shell' }).then((handled) => {
    if (handled) return

    // 跨应用导航：@app:projectId/path — 切换项目后跳转
    if (command.startsWith('@app:')) {
      void handleCrossAppNavigate(command)
      return
    }

    // 用户菜单导航项：通过 command(=item.path??redirect??id) 找到节点 → nav.navigateTo
    const userMenuItem = nav.regionItems.value.userMenu.find(
      item => (item.path ?? item.redirect ?? item.id) === command
    )
    if (userMenuItem) {
      nav.navigateTo(userMenuItem)
      return
    }

    if (command.startsWith('/')) {
      // 兜底：path 带 '/' 但不在 userMenuItems 中（理论外路径）
      nav.navigateToPath(command)
      return
    }

    if (import.meta.env.DEV) {
      console.error(`[handleUserCommand] 未处理的用户菜单命令: "${command}"`)
    }
  })
}

/**
 * 跨应用导航核心：切换项目后导航到目标路径。
 * 接受两种调用方式：
 * 1. navigateByPath 回调：(projectId, path) 两参数
 * 2. handleUserCommand：(fullPath) 即 "@app:projectId/path" 格式
 */
async function handleCrossAppNavigate(projectIdOrFullPath: string, pathArg?: string) {
  let targetProjectId: string
  let targetPath: string

  if (pathArg !== undefined) {
    // 两参数模式（来自 useNavigation 回调）
    targetProjectId = projectIdOrFullPath
    targetPath = pathArg
  } else {
    // 单参数模式（来自 handleUserCommand，完整 @app: 字符串）
    const match = /^@app:([^/]+)(\/.*)?$/.exec(projectIdOrFullPath)
    if (!match?.[1]) return
    targetProjectId = match[1]
    targetPath = match[2] ?? '/'
  }

  const user = getUser()
  if (!user) return

  await projectSwitchService.switchAndReload(targetProjectId)
  void router.push(buildTenantPath({ tenantId: user.tenantId, projectId: targetProjectId }, targetPath))
}

</script>

<style scoped>
/* 页面切换动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.app-context-guard {
  margin: 24px;
  padding: 28px 30px;
  border: 1px solid #f0d3aa;
  border-radius: 18px;
  background: linear-gradient(180deg, #fffaf2 0%, #fff4e6 100%);
  box-shadow: 0 14px 36px rgba(88, 56, 16, 0.08);
}

.app-context-guard__badge {
  display: inline-flex;
  align-items: center;
  margin-bottom: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(182, 116, 23, 0.12);
  color: #8f5410;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.app-context-guard h2 {
  margin: 0 0 10px;
  color: #5d3608;
  font-size: 26px;
}

.app-context-guard p {
  margin: 0;
  max-width: 88ch;
  color: #7a5522;
  line-height: 1.7;
}

.app-context-guard__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 16px;
  color: #8f6a38;
  font-size: 13px;
}

.app-context-guard__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 20px;
}

.app-context-guard__primary,
.app-context-guard__secondary {
  min-height: 38px;
  padding: 0 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.app-context-guard__primary {
  border: 1px solid #bc7a1e;
  background: #bc7a1e;
  color: #fff;
}

.app-context-guard__primary:hover {
  background: #a66b1a;
  border-color: #a66b1a;
}

.app-context-guard__secondary {
  border: 1px solid #d5b489;
  background: #fff;
  color: #8a5617;
}

.app-context-guard__secondary:hover {
  background: #fff7eb;
  border-color: #bc7a1e;
}

</style>
