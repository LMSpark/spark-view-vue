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
import { BasePageConfigLoader, compileRule, parsePageData, parseScript, parseCss } from '@spark-view/spark-page-config/page/loading'
import type {
  ConfigLoadResult,
  PageConfig,
  PageConfigFileLoadOptions,
  PageConfigFileName,
  PageDataConfig,
  RuleConfig,
} from '@spark-view/spark-page-config/page/loading'
import type { DevState } from './useDevState'
import NavIcon from '@/components/NavIcon.vue'
import { Loading } from '@element-plus/icons-vue'
import { createRequest } from '@spark-view/spark-utils'
import type { HttpClientBase } from '@spark-view/spark-utils'
import { createAuthHeaders } from '@/services/http'

class PreviewPageConfigLoader extends BasePageConfigLoader {
  constructor(private readonly client: HttpClientBase) {
    super()
  }

  override loadPageConfig(pageId: string): Promise<ConfigLoadResult<PageConfig>> {
    return this.unsupported(pageId, 'page config')
  }

  override loadRule(pageId: string): Promise<ConfigLoadResult<RuleConfig[]>> {
    return this.unsupported(pageId, 'rule')
  }

  override loadPageData(pageId: string): Promise<ConfigLoadResult<PageDataConfig>> {
    return this.unsupported(pageId, 'pagedata')
  }

  override loadScript(pageId: string): Promise<ConfigLoadResult<string>> {
    return this.unsupported(pageId, 'script')
  }

  override loadCss(pageId: string): Promise<ConfigLoadResult<string>> {
    return this.unsupported(pageId, 'style')
  }

  override loadPageFileContent(
    pageId: string,
    filename: PageConfigFileName,
    _options?: PageConfigFileLoadOptions,
  ): Promise<ConfigLoadResult<string>> {
    return this.unsupported(pageId, filename)
  }

  override clearCache(): void {
    this.client.clearCache()
  }

  override getCacheStats(): { size: number; keys: string[] } {
    return { size: 0, keys: [] }
  }

  override getHttpClient(): HttpClientBase {
    return this.client
  }

  private unsupported<T>(pageId: string, label: string): Promise<ConfigLoadResult<T>> {
    return Promise.resolve({
      success: false,
      error: `Preview loader only exposes HTTP client; ${label} is not loaded here: ${pageId}`,
      timestamp: Date.now(),
    })
  }
}

// ── 为预览渲染器提供带 baseURL + auth 的 HttpClientBase ──
// DevPreviewTab 直接传 pageConfig（跳过加载器），但 DataSet 仍需要 HTTP 客户端
// 来执行 api.list 等远程请求。这里构造一个最小 configLoader 仅暴露 getHttpClient()。
const previewConfigLoader = (() => {
  const client = createRequest({ timeout: 30_000 })
  client.interceptors.request.use({
    onRequest: (config) => {
      if (
        typeof config.url === 'string'
        && config.url.trim() !== ''
        && !/^[a-z][a-z\d+\-.]*:/i.test(config.url)
        && !config.url.startsWith('//')
      ) {
        const normalizedUrl = config.url.startsWith('/') ? config.url : `/${config.url}`
        config.url = normalizedUrl.startsWith('/api/') ? normalizedUrl : `/api${normalizedUrl}`
      }
      config.headers = { ...config.headers, ...createAuthHeaders() }
      return config
    },
  })
  return new PreviewPageConfigLoader(client)
})()

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
const previewConfig = shallowRef<Omit<PageConfig, 'pageId'> | null>(null)

/** 确保 4 个文件全部从服务器加载完成 */
async function ensureAllFilesLoaded() {
  await props.state.ensureActivePageFilesLoaded()
}

function buildPreviewConfig(): Omit<PageConfig, 'pageId'> | null {
  const documentParseErrors = Object.values(props.state.documents)
    .flatMap(doc => doc.parseError.value ? [`${doc.name}: ${doc.parseError.value}`] : [])
  if (documentParseErrors.length > 0) {
    throw new Error(documentParseErrors.join('\n'))
  }

  const ruleText = props.state.documents['rule.json'].text.value
  const dataText = props.state.documents['pagedata.json'].text.value
  const scriptText = props.state.documents['script.js'].text.value
  const cssText = props.state.documents['style.css'].text.value

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

// 监听 4 个文档文本变化，debounce 500ms 实时重建预览（不需要重新拉服务器）
const _docTexts = computed(() => [
  props.state.pageFilesRevision.value,
  props.state.documents['rule.json'].text.value,
  props.state.documents['pagedata.json'].text.value,
  props.state.documents['script.js'].text.value,
  props.state.documents['style.css'].text.value,
])
let _liveTimer: ReturnType<typeof setTimeout> | null = null
watch(_docTexts, () => {
  if (!livePreview.value) return
  if (_liveTimer !== null) clearTimeout(_liveTimer)
  _liveTimer = setTimeout(() => {
    _liveTimer = null
    if (loading.value) return // 正在手动刷新中，跳过
    try {
      const cfg = buildPreviewConfig()
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
