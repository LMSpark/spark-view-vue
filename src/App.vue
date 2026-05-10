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
    <!-- 左侧边栏 -->
    <template #sidebar>
      <AppSidebar
        :title="'SPARK'"
        :collapsed="sidebarCollapsed"
        :items="nav.regionItems.value.sidebar"
      />
    </template>

    <!-- 顶部首 -->
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
        @toggle-theme="toggleTheme"
        @user-command="handleUserCommand"
      >
        <template #nav>
          <NavHeaderBar
            v-if="nav.regionVisibility.value.header"
            :items="nav.regionItems.value.header"
          />
        </template>
        <template #actions>
          <el-tooltip v-if="hasAiChatAction" content="AI 对话" placement="bottom" :show-after="300">
            <button class="header-btn" :class="{ 'header-btn--active': aiPanelStore.visible.value }" @click="aiPanelStore.toggle()">
              <el-icon :size="18"><ChatDotRound /></el-icon>
            </button>
          </el-tooltip>
        </template>
      </AppHeader>
    </template>

    <!-- 面包屑（单页模式） -->
    <template #breadcrumb>
      <AppBreadcrumb>
        <template v-if="nav.moduleContext.value" #trailing>
          <NavContextSelector :state="nav.moduleContext.value" />
        </template>
      </AppBreadcrumb>
    </template>

    <!-- 标签栏（多页模式） -->
    <template #tab-bar>
      <AppTabBar>
        <template v-if="nav.moduleContext.value" #trailing>
          <NavContextSelector :state="nav.moduleContext.value" />
        </template>
      </AppTabBar>
    </template>

    <!-- 主内容区 -->
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
          <button v-if="contextGuard.expectedPath" type="button" class="app-context-guard__secondary" @click="jumpToExpectedContext">
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

    <!-- 底部脚 -->
    <template #footer>
      <AppFooter />
    </template>
  </AppLayout>

  <!-- 主题配置抽屉 -->
  <ThemeConfigurator
    v-model="showConfigurator"
    v-model:header-first="headerFirst"
    v-model:collapsed="sidebarCollapsed"
    v-model:show-footer="showFooter"
    :mode="mode"
    @update:mode="setMode"
  />

  <!-- APP 层 page-ui host：统一承载弹层、文件浏览、文件上传等交互 -->
  <AppPageUiHost />

  <!-- APP 层全局 AI 面板 -->
  <AppAiPanel />
  </template>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { appPageUiService, useTheme, AppPageUiHost, useTabPages, useColorScheme, useNavigation } from '@spark-view/spark-app'
import type { NavNode, AppNavRoot } from '@spark-view/spark-app'
import { APP_SERVICES, MODULE_CONTEXT, AppAiPanel, useAiPanelStore, useSparkComponent, type IModuleContext, type ModuleContextCapability } from '@spark-view/spark-component'
import { getToken, getUser, isAuthenticated, logout } from '@/services/auth'
import AppLayout from '@/layout/AppLayout.vue'
import AppHeader from '@/layout/AppHeader.vue'
import AppBreadcrumb from '@/layout/AppBreadcrumb.vue'
import AppFooter from '@/layout/AppFooter.vue'
import AppSidebar from '@/layout/AppSidebar.vue'
import AppTabBar from '@/layout/AppTabBar.vue'
import NavHeaderBar from '@/layout/NavHeaderBar.vue'
import NavContextSelector from '@/layout/NavContextSelector.vue'
import ThemeConfigurator from '@/layout/ThemeConfigurator.vue'
import { ChatDotRound } from '@element-plus/icons-vue'
import { clearAllPageCache, clearPageCache, getPageCacheStats } from '@/services/page-cache-handle'
import { refreshRoutes, getNavTree, getNavHomePath } from '@spark-view/spark-app'
import { createAuthHeaders } from '@/services/http'
import { startSseDebugScreenshotBridge } from '@/services/sse-debug-screenshot'
import { startSseDebugRouteBridge } from '@/services/sse-debug-route'
import { onPageConfigChange, type FileChangeEvent } from '@/services/sse-events'
import { switchProject } from '@/services/auth'
import { PROJECT_SWITCH_KEY } from '@/services/project-switch'
import type { ProjectSwitchService } from '@/services/project-switch'
import { getPlatformPaths } from '@/config/vue-page-map'

const { sparkProvide } = useSparkComponent({ type: 'app-shell' })

const route = useRoute()
const router = useRouter()
const isLoginPage = computed(() => route.path === '/login' || route.path === '/')
const platformPaths = getPlatformPaths()
const currentUsername = computed(() => getUser()?.displayName ?? getUser()?.username ?? '管理员')
const activeProjectId = ref(getUser()?.defaultProjectId ?? 'homepage')
const headerTitle = computed(() =>
  activeProjectId.value === 'homepage' ? 'SPARK 应用工场' : `SPARK · ${activeProjectId.value}`
)
const theme = useTheme()
const isDark = computed(() => theme?.isDark ?? false)
const toggleTheme = () => theme?.toggle()
const sidebarCollapsed = ref(false)
const headerFirst = ref(false)
const showFooter = ref(true)
const showConfigurator = ref(false)
const aiPanelStore = useAiPanelStore()
const hasAiChatAction = computed(() =>
  nav.regionItems.value.toolbar.some(item => item.path === 'ai-chat')
)

const { mode, setMode } = useTabPages()
useColorScheme()
let _stopSseDebugScreenshot: (() => void) | null = null
let _stopSseDebugRoute: (() => void) | null = null
let _stopPageConfigChange: (() => void) | null = null
const pageConfigRefreshRevision = ref(0)
const sparkRendererRouteKey = computed(() => {
  const base = mode.value === 'multi' ? route.path : route.fullPath
  return `${base}::page-config-${pageConfigRefreshRevision.value}`
})

interface AppContextGuardState {
  title: string
  message: string
  primaryActionLabel: string
  expectedPath?: string | undefined
}

function parseTenantScope(path: string): { tenantId: string; projectId: string } | null {
  const match = /^\/t\/([^/]+)\/([^/]+)/.exec(path)
  if (!match?.[1] || !match[2]) return null
  return {
    tenantId: match[1],
    projectId: match[2],
  }
}

function buildScopedPath(relativePath: string): string | null {
  const user = getUser()
  if (!user?.tenantId || !user.defaultProjectId) return null
  const normalized = relativePath.startsWith('/') ? relativePath : `/${relativePath}`
  return `/t/${user.tenantId}/${user.defaultProjectId}${normalized}`
}

const contextGuard = computed<AppContextGuardState | null>(() => {
  if (isLoginPage.value) return null

  const currentPath = route.path
  const scoped = parseTenantScope(currentPath)
  const token = getToken()
  const user = getUser()

  if (scoped === null) {
    if (platformPaths.has(currentPath)) return null
    return {
      title: '当前页面缺少租户作用域',
      message: '这个业务页需要在 /t/{tenantId}/{projectId}/... 作用域下运行。外部浏览器有数据而内嵌浏览器没数据，通常就是当前浏览器上下文没有进入正确租户路径或未完成登录。',
      primaryActionLabel: user ? '进入当前项目首页' : '前往登录页',
      ...(buildScopedPath(currentPath) ? { expectedPath: buildScopedPath(currentPath) ?? undefined } : {}),
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

  if (scoped.tenantId !== user.tenantId || scoped.projectId !== user.defaultProjectId) {
    const expectedPath = `/t/${user.tenantId}/${user.defaultProjectId}${currentPath.replace(/^\/t\/[^/]+\/[^/]+/, '') || ''}`
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
    try {
      await reloadNavigation()
    } catch (e) {
      if (import.meta.env.DEV) console.error('[Nav] 导航加载失败', e)
    }
  },
}
provide(PROJECT_SWITCH_KEY, projectSwitchService)

/* ── 导航模型（预认证时使用 preAuthNavTree，登录后使用远程导航树） ── */
const _navRoot = reactive({ title: '', childPlacement: 'header' as AppNavRoot['childPlacement'], children: [] as NavNode[] })
const nav = useNavigation(_navRoot, {
  onCrossAppNavigate: handleCrossAppNavigate,
  getHeaders: createAuthHeaders,
})
const pageUiService = appPageUiService
sparkProvide(APP_SERVICES, { pageService: pageUiService })
const isSparkRendererRoute = computed(() => {
  const routeType = route.meta['type']
  return routeType === 'config-page' || routeType === 'cross-project-ref'
})
const pageModuleContext = computed<IModuleContext | null>(() => {
  const state = nav.moduleContext.value
  if (!state) return null
  return {
    selected: state.selected,
    items: state.items,
    nodeId: state.nodeId,
  }
})
type ModuleContextChangeHandler = (next: IModuleContext | null, prev: IModuleContext | null) => void
const moduleContextListeners = new Set<ModuleContextChangeHandler>()

function cloneModuleContext(value: IModuleContext | null | undefined): IModuleContext | null {
  if (!value) return null
  const safeItems = Array.isArray(value.items) ? value.items : []
  return {
    nodeId: value.nodeId,
    selected: value.selected,
    items: safeItems.map(item => ({ id: item.id, title: item.title })),
  }
}

function moduleContextSignature(value: IModuleContext | null | undefined): string {
  if (!value) return ''
  const safeItems = Array.isArray(value.items) ? value.items : []
  return JSON.stringify({
    nodeId: value.nodeId,
    selected: value.selected,
    items: safeItems.map(item => ({ id: item.id, title: item.title })),
  })
}

function emitModuleContextChange(
  next: IModuleContext | null | undefined,
  prev: IModuleContext | null | undefined,
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
  clearPageCache(event.pageId)
  const refPageId = route.meta['refPageId']
  if (
    readRoutePageId() === event.pageId
    || (typeof refPageId === 'string' && refPageId === event.pageId)
  ) {
    pageConfigRefreshRevision.value += 1
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

/** 将导航树数据写入 _navRoot 响应对象（驱动 useNavigation UI） */
function applyNavTree(navData: AppNavRoot | null): void {
  const safeChildren = Array.isArray(navData?.children) ? navData.children : []
  if (navData && safeChildren.length > 0) {
    _navRoot.childPlacement = navData.childPlacement
    _navRoot.children = safeChildren
    if (import.meta.env.DEV) console.log(`[Nav] ✅ 导航已同步 (${safeChildren.length} 个节点)`)
  } else if (import.meta.env.DEV) {
    console.warn('[Nav] ⚠️ 导航树为空')  // DEV guard on outer branch
  }
}

async function reloadNavigation(): Promise<void> {
  const navTree = await refreshRoutes()
  applyNavTree(navTree)
}

onMounted(() => {
  if (_stopSseDebugScreenshot === null) {
    _stopSseDebugScreenshot = startSseDebugScreenshotBridge()
  }
  if (_stopSseDebugRoute === null) {
    _stopSseDebugRoute = startSseDebugRouteBridge({
      router,
      switchProject: projectSwitchService.switchAndReload,
    })
  }
  if (_stopPageConfigChange === null) {
    _stopPageConfigChange = onPageConfigChange(handlePageConfigChange)
  }

  // start.ts 已在 mount 前调用 registerRoutes() 注册路由 + 加载导航树
  // 此处同步读取已加载的导航树并写入 _navRoot，不发起重复 HTTP 请求
  applyNavTree(getNavTree())

  // 暴露开发工具到 window.__sparkDev（清缓存页面使用）
  const w = window as unknown as Record<string, unknown>
  w['__sparkDev'] = { reloadNavigation, clearAllPageCache, getPageCacheStats, refreshRoutes }
})

onUnmounted(() => {
  moduleContextListeners.clear()
  _stopSseDebugScreenshot?.()
  _stopSseDebugScreenshot = null
  _stopSseDebugRoute?.()
  _stopSseDebugRoute = null
  _stopPageConfigChange?.()
  _stopPageConfigChange = null
})

// ── 登录后自动同步导航 UI ──
watch(isLoginPage, (isLogin, wasLogin) => {
  if (wasLogin && !isLogin && isAuthenticated()) {
    // LoginView 已在跳转前调用 refreshRoutes() 加载导航树，此处同步读取并写入 _navRoot
    applyNavTree(getNavTree())
  }
})

/* ── 用户菜单命令 ── */
function handleUserCommand(command: string) {
  switch (command) {
    case 'ai-chat':
      aiPanelStore.toggle()
      break
    case 'profile':
      // TODO: 个人中心页面
      break
    case 'settings':
      showConfigurator.value = true
      break
    case 'home': {
      const user = getUser()
      if (user && user.defaultProjectId !== 'homepage') {
        void projectSwitchService.switchAndReload('homepage').then(() => {
          void router.push(`/t/${user.tenantId}/homepage${getNavHomePath()}`)
        })
      } else if (user) {
        void router.push(`/t/${user.tenantId}/${user.defaultProjectId}${getNavHomePath()}`)
      } else {
        void router.push('/')
      }
      break
    }
    case 'logout':
      logout()
      clearAllPageCache()
      window.location.replace(router.resolve('/login').href)
      break
    default:
      // 跨应用导航：@app:projectId/path — 切换项目后跳转
      if (command.startsWith('@app:')) {
        void handleCrossAppNavigate(command)
      } else {
        // 用户菜单导航项：通过 command(=item.path??redirect??id) 找到节点 → nav.navigateTo
        const userMenuItem = nav.regionItems.value.userMenu.find(
          item => (item.path ?? item.redirect ?? item.id) === command
        )
        if (userMenuItem) {
          nav.navigateTo(userMenuItem)
        } else if (command.startsWith('/')) {
          // 兜底：path 带 '/' 但不在 userMenuItems 中（理论外路径）
          nav.navigateToPath(command)
        } else if (import.meta.env.DEV) {
          console.error(`[handleUserCommand] 未处理的用户菜单命令: "${command}"`)
        }
      }
      break
  }
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
  void router.push(`/t/${user.tenantId}/${targetProjectId}${targetPath}`)
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

.app-ai-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  color: inherit;
  background: transparent;
  cursor: pointer;
  transition: background-color 0.2s;
}

.app-ai-action:hover {
  background: color-mix(in srgb, var(--spark-header-text) 12%, transparent);
}

.app-ai-action:active {
  background: color-mix(in srgb, var(--spark-header-text) 18%, transparent);
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

