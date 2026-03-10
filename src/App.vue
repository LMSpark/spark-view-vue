<template>
  <div class="app-container">
    <!-- 左侧边栏 -->
    <aside class="sidebar">
      <h2 class="sidebar-title">SPARK 管理后台</h2>
      <el-menu
        :default-active="$route.path"
        background-color="#001529"
        text-color="#fff"
        active-text-color="#1890ff"
        router
      >
        <el-menu-item 
          v-for="route in menuRoutes" 
          :key="route.path"
          :index="route.path"
        >
          <template #default>
            <span>{{ route.meta?.['icon'] }} {{ route.meta?.['title'] }}</span>
          </template>
        </el-menu-item>
      </el-menu>
    </aside>

    <!-- 主内容区 -->
    <main class="main-content">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" :key="route.fullPath + '_' + pageRefreshKey" />
        </transition>
      </router-view>
    </main>

    <!-- AI 聊天浮窗（仅配置启用时加载） -->
    <AiChatPanel v-if="enableAI" />

    <!-- APP 层 page-ui host：统一承载弹层、文件浏览、文件上传等交互 -->
    <AppPageUiHost />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppPageUiHost from '@/app-services/page-ui/AppPageUiHost.vue'
import { pageRefreshKey } from '@/services/ai-loop'

const route = useRoute()

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

const router = useRouter()
const isRoutesLoaded = ref(false)

// 等待路由加载完成
onMounted(() => {
  setTimeout(() => {
    isRoutesLoaded.value = true
  }, 100)
})

// 从路由中获取菜单列表
const menuRoutes = computed(() => {
  if (!isRoutesLoaded.value) return []
  
  return router.getRoutes()
    .filter(route => route.meta?.['title'] && route.path !== '/')
    .sort((a, b) => a.path.localeCompare(b.path))
})
</script>

<style scoped>
.app-container {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 240px;
  background: #001529;
  color: #fff;
  padding: 20px;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
}

.sidebar-title {
  color: #fff;
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 24px 0;
  padding: 0 0 16px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.main-content {
  flex: 1;
  padding: 24px;
  background: #f0f2f5;
  overflow: auto;
}

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

