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
 * 支持 PageRendererProps 配置，渲染走 SparkComponentRenderer
 * 递归引擎。
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
 * <!-- configLoader + pageId -->
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

const { router, provideCapability, loading, error, componentRegistry, runLoad } = useRendererSetup('spark-page-renderer', logger)
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

// ── 脚本沙箱上下文 ──
const pageRoute = buildPageRoute(route)
const pageContext: PageContext = buildPageContext({
  getDataSet: () => pds.dataSet,
  getComponentRegistry: () => componentRegistry,
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

function bindSparkRuleEvents(
  rules: unknown[],
  pageFunctionsMap: Record<string, (...args: unknown[]) => unknown>
): unknown[] {
  const callFunc = (functionName: string, ...args: unknown[]) => {
    const fn = pageFunctionsMap[functionName]
    if (typeof fn === 'function') return fn(...args)
    if (import.meta.env.DEV) {
      logger.warn(`[SparkPageRenderer] 事件函数未定义: ${functionName}`)
    }
    return undefined
  }

  const bindNode = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(bindNode)
    if (node === null || typeof node !== 'object') return node

    const current = node as Record<string, unknown>
    const cloned: Record<string, unknown> = { ...current }

    if (current['on'] !== null && typeof current['on'] === 'object' && !Array.isArray(current['on'])) {
      const newOn: Record<string, unknown> = {}
      for (const [eventName, handler] of Object.entries(current['on'] as Record<string, unknown>)) {
        if (typeof handler === 'string') {
          newOn[eventName] = (...args: unknown[]) => callFunc(handler, ...args)
        } else if (Array.isArray(handler)) {
          newOn[eventName] = handler.map(item => (
            typeof item === 'string'
              ? (...args: unknown[]) => callFunc(item, ...args)
              : item
          ))
        } else {
          newOn[eventName] = handler
        }
      }
      cloned['on'] = newOn
    }

    if (current['props'] !== null && typeof current['props'] === 'object' && !Array.isArray(current['props'])) {
      const propsObj = { ...(current['props'] as Record<string, unknown>) }
      for (const [propName, propValue] of Object.entries(propsObj)) {
        if (propName.startsWith('on') && typeof propValue === 'string') {
          propsObj[propName] = (...args: unknown[]) => callFunc(propValue, ...args)
          continue
        }
        if (Array.isArray(propValue)) {
          propsObj[propName] = propValue.map(bindNode)
          continue
        }
        if (propValue !== null && typeof propValue === 'object') {
          propsObj[propName] = bindNode(propValue)
        }
      }
      cloned['props'] = propsObj
    }

    if (Array.isArray(current['children'])) {
      cloned['children'] = (current['children'] as unknown[]).map(bindNode)
    }

    return cloned
  }

  return rules.map(bindNode)
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
 * 时序：
 * 1. rules / CSS 写入 → 脚本编译 → Render* 注册
 * 2. DataSet 初始化 → provide(PAGE_DATASET)
 * 3. loading=false → SparkComponentRenderer 挂载
 * 4. nextTick 后执行 __init__ + initAutoSelection
 */
function applyConfig(pageId: string, config: PageConfig): void {
  if (config.css) setScopedCss(pageId, config.css)

  executeScript(pageId, config.script ?? '')
  registerRenderComponents()

  // DataSet 初始化
  if (pds.dataSet) pds.clearDataSet()
  pds.initDataSet(config.data)
  const ds = pds.dataSet
  if (ds) provideCapability(PAGE_DATASET, ds)

  resolvedRules.value = bindSparkRuleEvents(config.rule as unknown[], pageFunctions.value)
}

// ==================== 加载入口 ====================

/** 完整加载流程：resolvePageId → beforeLoad → fetchConfig → applyConfig → afterLoad。 */
async function loadConfig(): Promise<void> {
  // system-page 路由不走 PageRenderer，防止 transition out-in 期间误触发
  if (route.meta['type'] === 'system-page') return

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
  // 此时组件已挂载、DataSet 已就绪
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
