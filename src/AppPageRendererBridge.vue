<template>
  <FCPageRenderer :key="rendererRefreshKey" v-bind="forwardedProps" :page-service="mergedPageService" :module-context="moduleContext" />
  <!-- AI 聊天浮窗（仅配置页面渲染时加载，从 App.vue 下沉至此） -->
  <AiChatPanel v-if="enableAI" />
  <!-- SAP 工具助手浮窗（独立于 AI 页面生成面板） -->
  <SapChatPanel v-if="enableAI" />
</template>

<script setup lang="ts">
import { computed, ref, inject, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import { FCPageRenderer } from '@spark-view/spark-component'
import type { PageRendererOptions } from '@spark-view/spark-component'
import type { IModuleContext } from '@spark-view/spark-utils'
import { appPageUiService } from '@spark-view/spark-app'
import { NAV_KEY } from '@spark-view/spark-app'
import { onPageRefresh } from '@spark-view/spark-ai'

const AiChatPanel = defineAsyncComponent(() => import('@/components/AiChatPanel.vue'))
const SapChatPanel = defineAsyncComponent(() => import('@/components/SapChatPanel.vue'))

const props = withDefaults(defineProps<PageRendererOptions>(), {
  enableCssScope: true,
  enableDataSet: true,
})

const rendererRefreshKey = ref(0)
let refreshTimer: ReturnType<typeof setTimeout> | null = null
const _unsubRefresh = onPageRefresh(() => {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer)
  }
  refreshTimer = setTimeout(() => {
    rendererRefreshKey.value++
    refreshTimer = null
  }, 120)
})
onUnmounted(() => {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
  _unsubRefresh()
})

const nav = inject(NAV_KEY, undefined)

const moduleContext = computed<IModuleContext | null>(() => {
  const state = nav?.moduleContext.value
  if (!state) return null
  return {
    selected: state.selected,
    items: state.items,
    nodeId: state.nodeId,
  }
})

const mergedPageService = computed(() => ({
  ...(props.pageService ?? {}),
  ...appPageUiService,
}))

const forwardedProps = computed(() => ({
  ...(props.configLoader !== undefined ? { configLoader: props.configLoader } : {}),
  ...(props.pageId !== undefined ? { pageId: props.pageId } : {}),
  ...(props.pageConfig !== undefined ? { pageConfig: props.pageConfig } : {}),
  ...(props.messageService !== undefined ? { messageService: props.messageService } : {}),
  ...(props.confirmService !== undefined ? { confirmService: props.confirmService } : {}),
  ...(props.beforeLoad !== undefined ? { beforeLoad: props.beforeLoad } : {}),
  ...(props.afterLoad !== undefined ? { afterLoad: props.afterLoad } : {}),
  ...(props.onError !== undefined ? { onError: props.onError } : {}),
  ...(props.formCreateOptions !== undefined ? { formCreateOptions: props.formCreateOptions } : {}),
  enableCssScope: props.enableCssScope,
  enableDataSet: props.enableDataSet,
}))

// AI 开关：与 App.vue 逻辑一致，异步轮询 window.__SPARK_ENABLE_AI
const enableAI = ref(Boolean((window as unknown as Record<string, unknown>)['__SPARK_ENABLE_AI']))
onMounted(() => {
  if (enableAI.value) return
  const timer = setInterval(() => {
    if ((window as unknown as Record<string, unknown>)['__SPARK_ENABLE_AI']) {
      enableAI.value = true
      clearInterval(timer)
    }
  }, 200)
  const stopTimer = setTimeout(() => clearInterval(timer), 5000)
  onUnmounted(() => { clearInterval(timer); clearTimeout(stopTimer) })
})
</script>