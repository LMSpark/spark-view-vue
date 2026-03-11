<template>
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
        title="SPARK 管理后台"
        :is-dark="isDark"
        :collapsed="sidebarCollapsed"
        :collapsible="nav.regionVisibility.value.sidebar"
        username="管理员"
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
        <component :is="Component" :key="route.fullPath + '_' + pageRefreshKey" />
      </transition>
    </router-view>

    <!-- 底部脚 -->
    <template #footer>
      <AppFooter />
    </template>
  </AppLayout>

  <!-- AI 聊天浮窗（仅配置启用时加载） -->
  <AiChatPanel v-if="enableAI" />

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

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme, AppPageUiHost } from '@spark-view/spark-app'
import { pageRefreshKey } from '@/services/ai-loop'
import AppLayout from '@/layout/AppLayout.vue'
import AppHeader from '@/layout/AppHeader.vue'
import AppBreadcrumb from '@/layout/AppBreadcrumb.vue'
import AppFooter from '@/layout/AppFooter.vue'
import AppSidebar from '@/layout/AppSidebar.vue'
import AppTabBar from '@/layout/AppTabBar.vue'
import NavHeaderBar from '@/layout/NavHeaderBar.vue'
import NavContextSelector from '@/layout/NavContextSelector.vue'
import ThemeConfigurator from '@/layout/ThemeConfigurator.vue'
import { useTabPages } from '@/layout/useTabPages'
import { useColorScheme } from '@/layout/useColorScheme'
import { useNavigation } from '@/layout/useNavigation'
import { demoNavRoot } from '@/layout/demo-nav'

const route = useRoute()
const theme = useTheme()
const isDark = computed(() => theme?.isDark ?? false)
const toggleTheme = () => theme?.toggle()
const sidebarCollapsed = ref(false)
const headerFirst = ref(false)
const showFooter = ref(true)
const showConfigurator = ref(false)

const { mode, setMode } = useTabPages()
useColorScheme()

/* ── 导航模型（从 API 动态加载，demoNavRoot 作为初始占位） ── */
const _navRoot = reactive({ ...demoNavRoot })
const nav = useNavigation(_navRoot)
onMounted(async () => {
  try {
    const resp = await fetch('/api/navigation')
    if (resp.ok) {
      const data = await resp.json() as { childPlacement?: string; children?: unknown[] }
      if (Array.isArray(data.children) && data.children.length > 0) {
        _navRoot.childPlacement = (data.childPlacement as 'header' | 'sidebar') ?? 'header'
        _navRoot.children = data.children as typeof demoNavRoot.children
      }
    }
  } catch { /* 保持 demoNavRoot 作为 fallback */ }
})

/* ── 用户菜单命令 ── */
function handleUserCommand(command: string) {
  switch (command) {
    case 'settings':
      showConfigurator.value = true
      break
    case 'logout':
      // TODO: 接入真实登出
      break
  }
}

/** 懒加载 AI 面板（enableAI=false 时零开销） */
const AiChatPanel = defineAsyncComponent(() => import('@/components/AiChatPanel.vue'))

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

</style>

