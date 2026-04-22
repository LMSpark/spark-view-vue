<template>
  <div class="dev-preview-tab">
    <!-- 工具栏 -->
    <div class="preview-toolbar">
      <div class="preview-toolbar__left">
        <el-switch
          v-model="autoRefresh"
          active-text="切Tab刷新"
          inactive-text="手动"
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
        <SparkPageRenderer :key="renderKey" :pageConfig="previewConfig" :pageId="props.state.activePageId.value || 'dev-preview'" :configLoader="previewConfigLoader" />
      </template>
      <template v-else>
        <el-empty description="暂无可预览的内容，请先编辑页面配置" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, watch, onMounted } from 'vue'
import { SparkPageRenderer } from '@spark-view/spark-component'
import { compileRule, parsePageData, parseScript, parseCss } from '@spark-view/spark-page-config'
import type { ConfigLoader, PageConfig } from '@spark-view/spark-page-config'
import type { DevState } from './useDevState'
import NavIcon from '@/components/NavIcon.vue'
import { Loading } from '@element-plus/icons-vue'
import { createRequest } from '@spark-view/spark-utils'
import { createAuthHeaders } from '@/services/http'

// ── 为预览渲染器提供带 baseURL + auth 的 HttpClient ──
// DevPreviewTab 直接传 pageConfig（跳过加载器），但 DataSet 仍需要 HTTP 客户端
// 来执行 api.list 等远程请求。这里构造一个最小 configLoader 仅暴露 getHttpClient()。
const previewConfigLoader = (() => {
  const client = createRequest({ baseURL: '/api', timeout: 30_000 })
  client.interceptors.request.use({
    onRequest: (config) => {
      config.headers = { ...config.headers, ...createAuthHeaders() }
      return config
    },
  })
  return { getHttpClient: () => client } as ConfigLoader
})()

const props = defineProps<{
  state: DevState
  /** 外部通知刷新（如切 Tab 时 ++） */
  refreshToken?: number
}>()

const autoRefresh = ref(true)
const renderKey = ref(0)
const loading = ref(false)
const parseError = ref<string | null>(null)
const previewConfig = shallowRef<Omit<PageConfig, 'pageId'> | null>(null)

/** 确保 4 个文件全部从服务器加载完成 */
async function ensureAllFilesLoaded() {
  await props.state.ensureActivePageFilesLoaded()
}

function buildPreviewConfig(): Omit<PageConfig, 'pageId'> | null {
  const ruleText = props.state.editFiles['rule.json'] ?? ''
  const dataText = props.state.editFiles['pagedata.json'] ?? ''
  const scriptText = props.state.editFiles['script.js'] ?? ''
  const cssText = props.state.editFiles['style.css'] ?? ''

  if (!ruleText.trim() && !dataText.trim()) return null

  const rule = ruleText.trim() ? compileRule(ruleText) : []
  const data = dataText.trim() ? parsePageData(dataText) : parsePageData('{}')
  const script = scriptText.trim() ? parseScript(scriptText) : undefined
  const css = cssText.trim() ? parseCss(cssText) : undefined

  return { rule, data, script, css }
}

async function refresh() {
  loading.value = true
  parseError.value = null
  try {
    await ensureAllFilesLoaded()
    previewConfig.value = buildPreviewConfig()
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

onMounted(() => { void refresh() })
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

/* ═══ AI 诊断面板 ═══ */
.error-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-diagnose {
  background: linear-gradient(135deg, #fef3c7 0%, #fce7f3 100%);
  border: 1px solid #fbbf24;
  border-radius: 8px;
  overflow: hidden;
}

.ai-diagnose__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: linear-gradient(135deg, #fef9c3 0%, #fdf2f8 100%);
  border-bottom: 1px solid #fde68a;
  font-size: 14px;
  font-weight: 500;
  color: #92400e;
}

.ai-diagnose__header .el-button {
  margin-left: auto;
}

.ai-diagnose__content {
  padding: 14px;
  background: #fffbeb;
}

.diagnosis-text {
  font-size: 13px;
  line-height: 1.7;
  color: #1e293b;
  max-height: 300px;
  overflow-y: auto;
}

.diagnosis-text :deep(p) {
  margin: 0 0 10px;
}

.diagnosis-text :deep(strong) {
  color: #7c2d12;
}

.diagnosis-text :deep(code) {
  background: #fef3c7;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
  color: #92400e;
}

.diagnosis-text :deep(pre) {
  background: #fefce8;
  padding: 10px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 8px 0;
}

.diagnosis-text :deep(ol),
.diagnosis-text :deep(ul) {
  margin: 8px 0;
  padding-left: 20px;
}

.diagnosis-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #fde68a;
}
</style>
