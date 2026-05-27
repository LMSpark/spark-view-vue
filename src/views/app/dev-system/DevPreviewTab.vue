<template>
  <div class="dev-preview-tab">
    <!-- 工具栏 -->
    <div class="preview-toolbar">
      <div class="preview-toolbar__left">
        <el-switch
          v-model="livePreview"
          active-text="实时预览"
          inactive-text="手动"
          size="small"
        />
        <el-switch
          v-model="autoRefresh"
          active-text="切Tab刷新"
          inactive-text="—"
          size="small"
        />
      </div>
      <div class="preview-toolbar__right">
        <el-button size="small" @click="refresh" :loading="loading">
          <NavIcon name="RefreshRight" :size="14" /> 刷新预览
        </el-button>
      </div>
    </div>

    <!-- 预览区域 -->
    <div class="preview-container">
      <template v-if="loading">
        <div class="preview-loading">
          <el-icon class="is-loading"><Loading /></el-icon> 加载中...
        </div>
      </template>
      <template v-else-if="parseError">
        <div class="error-panel">
          <el-alert type="error" :closable="false" show-icon>
            <template #title>解析失败</template>
            {{ parseError }}
          </el-alert>
        </div>
      </template>
      <template v-else-if="previewConfig">
        <SparkPageRenderer
          :key="renderKey"
          :pageConfig="previewConfig"
          :pageId="props.state.activePageId.value || 'dev-preview'"
          :configLoader="previewConfigLoader"
        />
      </template>
      <template v-else>
        <el-empty description="暂无可预览的内容，请先编辑页面配置" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { SparkPageRenderer } from '@spark-view/spark-component'
import {
  createPageEditorPreviewConfigLoader,
  type PageEditorPreviewConfig,
} from '@spark-view/spark-page-config/editor'
import type { DevState } from './useDevState'
import NavIcon from '@/components/NavIcon.vue'
import { Loading } from '@element-plus/icons-vue'
import { createAuthHeaders } from '@/services/http'

// ── 为预览渲染器提供带 baseURL + auth 的请求加载器 ──
// DevPreviewTab 直接传 pageConfig（跳过加载器），但 DataSet 仍需要 HTTP 客户端
// 来执行 api.list 等远程请求。这里构造一个最小 configLoader 仅暴露 getHttpClient()。
const previewConfigLoader = createPageEditorPreviewConfigLoader({
  getHeaders: createAuthHeaders,
})

const props = defineProps<{
  state: DevState
  /** 外部通知刷新（如切 Tab 时 ++） */
  refreshToken?: number
}>()

const autoRefresh = ref(true)
const livePreview = ref(true)
const renderKey = ref(0)
const loading = ref(false)
const parseError = ref<string | null>(null)
const previewConfig = shallowRef<PageEditorPreviewConfig | null>(null)

/** 确保 4 个文件全部从服务器加载完成 */
async function ensureAllFilesLoaded() {
  await props.state.ensureActivePageFilesLoaded()
}

async function refresh() {
  loading.value = true
  parseError.value = null
  try {
    await ensureAllFilesLoaded()
    previewConfig.value = props.state.buildPreviewConfig()
    renderKey.value++
  } catch (err) {
    parseError.value = err instanceof Error ? err.message : String(err)
    previewConfig.value = null
  } finally {
    loading.value = false
  }
}

// 外部 refreshToken 变化时触发刷新（切 Tab 驱动）
watch(() => props.refreshToken, () => {
  if (autoRefresh.value) void refresh()
})

// 监听 4 个文档文本变化，debounce 500ms 实时重建预览（不需要重新拉服务器）
const _docTexts = computed(() => [
  props.state.pageFilesRevision.value,
])
let _liveTimer: ReturnType<typeof setTimeout> | null = null
watch(_docTexts, () => {
  if (!livePreview.value) return
  if (_liveTimer !== null) clearTimeout(_liveTimer)
  _liveTimer = setTimeout(() => {
    _liveTimer = null
    if (loading.value) return // 正在手动刷新中，跳过
    try {
      const cfg = props.state.buildPreviewConfig()
      if (cfg !== null) {
        parseError.value = null
        previewConfig.value = cfg
        renderKey.value++
      }
    } catch (err) {
      parseError.value = err instanceof Error ? err.message : String(err)
      previewConfig.value = null
    }
  }, 500)
})
onBeforeUnmount(() => {
  if (_liveTimer !== null) clearTimeout(_liveTimer)
})

onMounted(() => {
  void refresh()
})
</script>

<style scoped>
.dev-preview-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
  background: var(--el-bg-color);
}
.preview-toolbar__left,
.preview-toolbar__right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.preview-container {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
}
.preview-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding-top: 80px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.error-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
