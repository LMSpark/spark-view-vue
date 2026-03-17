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
        <template v-if="enableAI && hasToolbarAction('ai-design', 'ai-chat', 'ai-blueprint')" #actions>
          <button v-if="hasToolbarAction('ai-blueprint')" class="app-ai-action" title="AI 蓝图策划" @click="showBlueprintPlanner = true">
            <NavIcon name="OfficeBuilding" :size="16" />
          </button>
          <button v-if="hasToolbarAction('ai-design')" class="app-ai-action" title="AI 协同设计" @click="showDesignStudio = true">
            <NavIcon name="Brush" :size="16" />
          </button>
          <el-popover
            v-if="hasToolbarAction('ai-chat')"
            :visible="showAiChat"
            placement="bottom-end"
            :width="420"
            :show-arrow="false"
            popper-class="ai-chat-popover"
          >
            <template #reference>
              <button class="app-ai-action" title="AI 对话" @click="showAiChat = !showAiChat">
                <NavIcon name="ChatDotRound" :size="16" />
              </button>
            </template>
            <AiChatWidget
              title="AI 助手"
              placeholder="输入消息，支持上传文件..."
              compact
            />
          </el-popover>
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
      <keep-alive v-if="mode === 'multi'" :max="10">
        <component :is="Component" :key="route.path" />
      </keep-alive>
      <transition v-else name="fade" mode="out-in">
        <component :is="Component" :key="route.fullPath" />
      </transition>
    </router-view>

    <!-- 底部脚 -->
    <template #footer>
      <AppFooter />
    </template>
  </AppLayout>

  <!-- AI 聊天浮窗已下沉到 AppPageRendererBridge（仅配置页面渲染） -->

  <!-- AI 蓝图策划抽屉 -->
  <AiBlueprintPlanner v-if="enableAI" v-model="showBlueprintPlanner" />

  <!-- AI 协同设计抽屉 -->
  <AiDesignStudio v-if="enableAI" v-model="showDesignStudio" />

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
  </template>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, provide, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTheme, AppPageUiHost, useTabPages, useColorScheme, useNavigation } from '@spark-view/spark-app'
import type { NavNode, AppNavRoot } from '@spark-view/spark-app'
import { getUser, isAuthenticated, logout } from '@/services/auth'
import AppLayout from '@/layout/AppLayout.vue'
import AppHeader from '@/layout/AppHeader.vue'
import AppBreadcrumb from '@/layout/AppBreadcrumb.vue'
import AppFooter from '@/layout/AppFooter.vue'
import AppSidebar from '@/layout/AppSidebar.vue'
import AppTabBar from '@/layout/AppTabBar.vue'
import NavHeaderBar from '@/layout/NavHeaderBar.vue'
import NavContextSelector from '@/layout/NavContextSelector.vue'
import NavIcon from '@/components/NavIcon.vue'
import ThemeConfigurator from '@/layout/ThemeConfigurator.vue'
import { clearAllCache, getCacheStats } from '@spark-view/spark-ai'
import { refreshRoutes, getNavTree, getNavHomePath } from '@spark-view/spark-app'
import { getNavApi } from '@/services/api-paths'
import { http } from '@/services/http'
import { switchProject } from '@/services/auth'
import { PROJECT_SWITCH_KEY } from '@/services/project-switch'
import type { ProjectSwitchService } from '@/services/project-switch'

const route = useRoute()
const router = useRouter()
const isLoginPage = computed(() => route.path === '/login' || route.path === '/')
const currentUsername = computed(() => getUser()?.displayName ?? getUser()?.username ?? '管理员')
const activeProjectId = ref(getUser()?.defaultProjectId ?? 'homepage')
const headerTitle = computed(() =>
  activeProjectId.value === 'homepage' ? 'SPARK 管理后台' : `SPARK · ${activeProjectId.value}`
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

/** 检查工具栏配置中是否包含指定 action（无配置时默认全部显示） */
function hasToolbarAction(...actions: string[]): boolean {
  const items = nav.regionItems.value.toolbar
  if (!items.length) return true
  return actions.some(action =>
    items.some(item => item.path === action)
  )
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
})

/** 将导航树数据写入 _navRoot 响应对象（驱动 useNavigation UI） */
function applyNavTree(navData: AppNavRoot | null): void {
  if (navData && navData.children.length > 0) {
    _navRoot.childPlacement = navData.childPlacement
    _navRoot.children = navData.children
    if (import.meta.env.DEV) console.log(`[Nav] ✅ 导航已同步 (${navData.children.length} 个节点)`)
  } else if (import.meta.env.DEV) {
    console.warn('[Nav] ⚠️ 导航树为空')
  }
}

async function reloadNavigation(): Promise<void> {
  const navTree = await refreshRoutes()
  applyNavTree(navTree)
}

/** 将种子导航数据写入后端（可随时调用） */
async function syncSeedNavigation(): Promise<void> {
  const { demoNavRoot } = await import('@/layout/demo-nav')
  await http.put(getNavApi(), demoNavRoot)
  await reloadNavigation()
}

onMounted(() => {
  // start.ts 已在 mount 前调用 registerRoutes() 注册路由 + 加载导航树
  // 此处同步读取已加载的导航树并写入 _navRoot，不发起重复 HTTP 请求
  applyNavTree(getNavTree())

  // 暴露开发工具到 window.__sparkDev（清缓存页面使用）
  const w = window as unknown as Record<string, unknown>
  w['__sparkDev'] = { reloadNavigation, syncSeedNavigation, clearAllCache, getCacheStats, refreshRoutes }
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
      clearAllCache()
      window.location.replace(router.resolve('/login').href)
      break
    default:
      // 跨应用导航：@app:projectId/path — 切换项目后跳转
      if (command.startsWith('@app:')) {
        void handleCrossAppNavigate(command)
      }
      // 路径类命令（用户菜单项配置了 path/redirect）→ 路由导航
      else if (command.startsWith('/')) {
        nav.navigateToPath(command)
      }
      break
  }
}

/**
 * 跨应用导航：解析 @app:projectId/path 格式，切换项目后导航到目标路径。
 * 导航节点可配置 path: '@app:engineering-pm/dashboard' 实现跨应用页面跳转。
 */
async function handleCrossAppNavigate(crossAppPath: string) {
  const match = /^@app:([^/]+)(\/.*)?$/.exec(crossAppPath)
  if (!match) return
  const targetProjectId = match[1]!
  const targetPath = match[2] ?? '/'
  const user = getUser()
  if (!user) return

  await projectSwitchService.switchAndReload(targetProjectId)
  void router.push(`/t/${user.tenantId}/${targetProjectId}${targetPath}`)
}

/** 懒加载 AI 面板（enableAI=false 时零开销） */
const AiChatWidget = defineAsyncComponent(() => import('@/components/AiChatWidget.vue'))
const AiBlueprintPlanner = defineAsyncComponent(() => import('@/components/AiBlueprintPlanner.vue'))
const AiDesignStudio = defineAsyncComponent(() => import('@/components/AiDesignStudio.vue'))
const showAiChat = ref(false)
const showDesignStudio = ref(false)
const showBlueprintPlanner = ref(false)

/** 读取应用配置中的 AI 开关（afterMount 异步设置，需响应式轮询） */
const enableAI = ref(Boolean((window as unknown as Record<string, unknown>)['__SPARK_ENABLE_AI']))
onMounted(() => {
  if (!enableAI.value) {
    const timer = setInterval(() => {
      if ((window as unknown as Record<string, unknown>)['__SPARK_ENABLE_AI']) {
        enableAI.value = true
        clearInterval(timer)
      }
    }, 200)
    // 5 秒后放弃
    setTimeout(() => clearInterval(timer), 5000)
  }
})
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

</style>

<!-- AI 聊天弹窗全局样式（popper 脱离 scoped DOM） -->
<style>
.ai-chat-popover {
  padding: 0 !important;
  max-height: 560px;
}
.ai-chat-popover .ai-chat-widget {
  height: 520px;
}
</style>

