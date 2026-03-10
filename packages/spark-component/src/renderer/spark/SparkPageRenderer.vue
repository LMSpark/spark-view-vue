<template>
  <div v-if="loading" class="spark-page-loading">
    <slot name="loading">加载中...</slot>
  </div>
  <div v-else-if="error" class="spark-page-error">
    <slot name="error" :error="error">
      <h3>❌ 页面加载失败</h3>
      <p>{{ error }}</p>
    </slot>
  </div>
  <div v-else>
    <!-- 动态注入页面样式（自动添加作用域） -->
    <component :is="'style'" v-if="scopedCss">{{ scopedCss }}</component>

    <!-- 主内容（SPARK 原生渲染，通过 SparkComponentRenderer 递归） -->
    <div ref="pageContainer" :data-page="currentPageId" class="spark-page-container">
      <slot name="content" :rules="resolvedRules">
        <SparkComponentRenderer
          v-for="(rule, i) in resolvedRules"
          :key="(rule as ComponentConfig).id ?? `spark-rule-${i}`"
          :config="(rule as ComponentConfig)"
        />
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SparkPageRenderer - SPARK 原生页面渲染器
 *
 * 与 FCPageRenderer **同构**：共享 PageRendererProps，加载流水线完全一致
 * （configLoader / pageConfig / pageId），渲染走 SparkComponentRenderer
 * 递归引擎，不依赖 form-create。
 *
 * 功能清单：
 * - 配置加载（pageConfig / configLoader + pageId）
 * - CSS 作用域隔离
 * - 脚本沙箱（compileFunctions + Render* 组件注册）
 * - DataSet 初始化 + PAGE_DATASET 能力注入
 * - 竞态保护（快速切换配置时丢弃旧请求）
 *
 * @component
 * @example
 * ```vue
 * <!-- 全量 PageConfig（rule + css + script + data） -->
 * <SparkPageRenderer :pageConfig="fullConfig" />
 *
 * <!-- configLoader + pageId（与 FCPageRenderer 同构） -->
 * <SparkPageRenderer :configLoader="loader" pageId="user-list" />
 * ```
 */
import {
  ref, onMounted, watch, nextTick, getCurrentInstance,
} from 'vue'
import { useRoute } from 'vue-router'
import { Logger, PAGE_SERVICE } from '@spark-view/spark-utils'
import type { PageConfig } from '@spark-view/spark-page-config'
import type { DataSet } from '@spark-view/spark-data'
import type { ComponentConfig } from '../../core/types'
import { PAGE_DATASET } from '../../capability-keys'
import { useRendererSetup } from '../composables/useRendererSetup'
import { useCssScope } from '../composables/useCssScope'
import { usePageDataSet } from '../composables/usePageDataSet'
import { compileFunctions } from '../utils/createSandbox'
import { buildPageService } from '../utils/buildPageService'
import { buildPageContext } from '../utils/buildPageContext'
import { buildPageRoute, resolvePageId } from '../utils/buildPageRoute'
import { registerRenderFunctions } from '../utils/registerRenderFunctions'
import type { PageContext, PageRendererProps } from '../types'
import SparkComponentRenderer from './SparkComponentRenderer.vue'

const logger = Logger('SparkPageRenderer')

// ==================== Props ====================

const props = withDefaults(defineProps<PageRendererProps>(), {
  enableCssScope: true,
  enableDataSet: true,
})

// ==================== 基础设施 ====================

const { router, provideCapability, loading, error, runLoad } = useRendererSetup('spark-page-renderer', logger)
const route = useRoute()
const vueApp = getCurrentInstance()?.appContext.app

// PAGE_SERVICE
const pageService = buildPageService(router, {
  messageService: props.messageService,
  confirmService: props.confirmService,
  pageService: props.pageService,
})
provideCapability(PAGE_SERVICE, pageService)

// ==================== 响应式状态 ====================

const currentPageId = ref('')
const resolvedRules = ref<unknown[]>([])
const pageFunctions = ref<Record<string, (...args: unknown[]) => unknown>>({})
const pageContainer = ref<HTMLElement | null>(null)

// ── CSS 作用域 ──
const { scopedCss, setScopedCss } = useCssScope({
  enableScope: props.enableCssScope,
})

// ── DataSet ──
const pds = usePageDataSet({ enableDataSet: props.enableDataSet })

// ── 脚本沙箱上下文（不含 form-create API） ──
const pageRoute = buildPageRoute(route)
const pageContext: PageContext = buildPageContext({
  getDataSet: () => pds.dataSet,
  pageRoute,
  pageContainer,
  pageService,
})

// ==================== Render* 组件注册 ====================

function registerRenderComponents(): void {
  if (vueApp) registerRenderFunctions(vueApp, pageFunctions.value)
}

// ==================== 脚本编译 ====================

function executeScript(pageId: string, scriptText: string): void {
  if (!scriptText) { pageFunctions.value = {}; return }
  try {
    pageFunctions.value = compileFunctions(scriptText, pageContext)
    logger.info('📜 脚本编译成功', { pageId, functions: Object.keys(pageFunctions.value) })
  } catch (e) {
    logger.error('脚本编译失败', { pageId, error: e })
    pageFunctions.value = {}
  }
}

// ==================== 配置加载流水线 ====================

/** 通过 props.pageConfig 直传或 configLoader 异步加载页面配置。 */
async function fetchConfig(pageId: string): Promise<PageConfig> {
  if (props.pageConfig) return props.pageConfig
  if (props.configLoader) {
    const result = await props.configLoader.loadPageConfig(pageId)
    if (!result.success || !result.data) {
      logger.error('配置加载失败', { pageId, error: result.error })
      throw new Error(`配置加载失败: ${result.error ?? '未知错误'}`)
    }
    return result.data
  }
  throw new Error('配置无效: 未提供 configLoader 或 pageConfig')
}

/**
 * 将配置应用到渲染状态。
 *
 * 时序（与 FC 线 applyConfig 对齐）：
 * 1. rules / CSS 写入 → 脚本编译 → Render* 注册
 * 2. DataSet 初始化 → provide(PAGE_DATASET)
 * 3. loading=false → SparkComponentRenderer 挂载
 * 4. nextTick 后执行 __init__ + initAutoSelection
 *
 * 注意：无 rebindRules（SPARK 原生渲染不依赖 form-create）。
 */
function applyConfig(pageId: string, config: PageConfig): void {
  resolvedRules.value = config.rule as unknown[]
  if (config.css) setScopedCss(pageId, config.css)

  executeScript(pageId, config.script ?? '')
  registerRenderComponents()

  // DataSet 初始化
  if (pds.dataSet) pds.clearDataSet()
  pds.initDataSet(config.data)
  const ds = pds.dataSet
  if (ds) provideCapability(PAGE_DATASET, ds)
}

// ==================== 加载入口（与 FC 线 loadPageConfig 同构） ====================

/** 完整加载流程：resolvePageId → beforeLoad → fetchConfig → applyConfig → afterLoad。 */
async function loadConfig(): Promise<void> {
  await runLoad(async (isStale) => {
    const pageId = resolvePageId(route, props.pageId, props.pageConfig?.pageId)
    currentPageId.value = pageId
    if (props.beforeLoad) await props.beforeLoad(pageId)
    if (isStale()) return
    const config = await fetchConfig(pageId)
    if (isStale()) return
    applyConfig(pageId, config)
    if (isStale()) return
    if (props.afterLoad) await props.afterLoad(config)
  }, props.onError)

  // loading=false 后等待 DOM 渲染完成，再执行 __init__ + initAutoSelection
  // 与 FCPageRenderer 的 form-create mounted 回调时序对齐：
  //   此时组件已挂载、DataSet 已就绪、$api 为 null（SPARK 原生渲染无 form-create）
  if (!error.value) {
    await nextTick()
    const init = pageFunctions.value['__init__']
    if (typeof init === 'function') {
      try {
        init()
        logger.info('✅ __init__ 执行成功')
      } catch (e) {
        logger.error('__init__ 执行失败', { error: e })
      }
    }
    pds.dataSet?.initAutoSelection()
  }
}

async function reload(): Promise<void> {
  await loadConfig()
}

// ==================== 生命周期 ====================

onMounted(() => {
  loadConfig().catch(e => logger.error('loadConfig 失败', e))
})

watch(
  () => props.pageId ?? route.meta['pageId'] ?? route.params['id'] ?? route.name,
  (newId, oldId) => { if (newId !== oldId) loadConfig().catch(e => logger.error('loadConfig 失败', e)) },
)

// ==================== Expose ====================

defineExpose({
  reload,
  loadConfig,
  pageContext,
  get dataSet(): DataSet | null { return pds.dataSet },
})
</script>

<style scoped>
.spark-page-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: #409eff;
  font-size: 14px;
}

.spark-page-error {
  padding: 20px;
  color: #f56c6c;
}

.spark-page-error h3 {
  margin: 0 0 10px;
  font-size: 16px;
}

.spark-page-error p {
  margin: 0;
  font-size: 14px;
}

.spark-page-container {
  width: 100%;
}
</style>
