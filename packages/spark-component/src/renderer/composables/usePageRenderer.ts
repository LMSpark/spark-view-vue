/**
 * usePageRenderer - 页面渲染编排 Composable
 *
 * 封装 PageRenderer 的完整页面生命周期管理：
 * - 配置加载（configLoader / pageConfig）
 * - SPARK 能力上下文（APP_SERVICES / PAGE_DATASET）
 * - DataSet 初始化与能力注入
 * - CSS 作用域隔离
 * - 脚本沙箱编译与执行
 * - 规则绑定（数据 + 事件）
 * - DataSet ↔ el-table 同步桥
 *
 * PageRenderer.vue 仅负责模板渲染和 defineProps / defineExpose 声明。
 *
 * @example
 * ```vue
 * <script setup>
 * const props = defineProps<PageRendererOptions>()
 * const pageContainer = ref<HTMLElement | null>(null)
 * const {
 *   loading, error, currentPageId, scopedCss,
 *   boundRules, pageData, formApi, formCreateOptions,
 *   loadPageConfig, rebindRules, pageContext, dataSet
 * } = usePageRenderer(props, { pageContainer })
 * </script>
 * ```
 */

import { ref, reactive, onMounted, watch, nextTick, h, type Ref, type Component } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { Logger, APP_SERVICES } from '@spark-view/spark-utils'
import type { IDataSet } from '@spark-view/spark-data'
import { SparkData, PAGE_DATASET, usePageDataSet } from '@spark-view/spark-data'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSparkComponent } from '../../composables/useSparkComponent'
import type { PageRendererOptions, PageContext, FormCreateAPI, Rule } from '../types'
import { useCssScope } from './useCssScope'
import { useRuleBinding } from './useRuleBinding'
import { useTableDataSync } from './useTableDataSync'
import { compileFunctions } from '../utils/createSandbox'

const pageLogger = Logger('PageRenderer')

// ─────────────────────────────────────────────
// 错误码
// ─────────────────────────────────────────────

const ErrorCodes = {
  CONFIG_LOAD_FAILED: 4001,
  CONFIG_INVALID: 4002,
  UNKNOWN_ERROR: 9999
} as const

function getErrorMessage(code: number): string {
  const messages: Record<number, string> = {
    [ErrorCodes.CONFIG_LOAD_FAILED]: '配置加载失败',
    [ErrorCodes.CONFIG_INVALID]: '配置无效',
    [ErrorCodes.UNKNOWN_ERROR]: '未知错误'
  }
  return messages[code] ?? '未知错误'
}

// ─────────────────────────────────────────────
// 公共接口
// ─────────────────────────────────────────────

/** 模板 ref 引用（由 SFC 创建并传入） */
export interface UsePageRendererRefs {
  pageContainer: Ref<HTMLElement | null>
}

/** usePageRenderer 返回值 */
export interface UsePageRendererReturn {
  // 模板绑定
  loading: Ref<boolean>
  error: Ref<string>
  currentPageId: Ref<string>
  scopedCss: Ref<string>
  boundRules: Ref<unknown[]>
  pageData: Record<string, unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formApi: Ref<any>
  formCreateOptions: Ref<Record<string, unknown>>
  // defineExpose / 外部调用
  loadPageConfig: () => Promise<void>
  rebindRules: () => void
  pageContext: PageContext
  dataSet: Ref<IDataSet | null>
}

// ─────────────────────────────────────────────
// Composable 实现
// ─────────────────────────────────────────────

/**
 * 页面渲染编排 Composable
 *
 * @param props - PageRendererOptions（来自 defineProps）
 * @param refs  - 模板 ref 引用
 */
export function usePageRenderer(
  props: Readonly<PageRendererOptions>,
  refs: UsePageRendererRefs
): UsePageRendererReturn {
  const { pageContainer } = refs

  // ==================== SPARK 能力上下文 ====================
  const router = useRouter()
  const route = useRoute()
  const { provide: provideCapability } = useSparkComponent({
    type: 'page-renderer',
    id: 'page-renderer-root'
  })

  provideCapability(APP_SERVICES, {
    router: {
      push: (to: unknown) => router.push(to as RouteLocationRaw),
      replace: (to: unknown) => router.replace(to as RouteLocationRaw),
      back: () => router.back(),
      currentRoute: router.currentRoute.value
    },
    logger: {
      debug: (...args: unknown[]) => pageLogger.debug(...args),
      info: (...args: unknown[]) => pageLogger.info(...args),
      warn: (...args: unknown[]) => pageLogger.warn(...args),
      error: (...args: unknown[]) => pageLogger.error(...args)
    }
  })

  // ==================== 状态声明 ====================

  const loading = ref(true)
  const error = ref<string>('')
  const currentPageId = ref<string>('')
  const formApi = ref<FormCreateAPI | null>(null)
  const originalRules = ref<Rule[]>([])
  const pageData = reactive<Record<string, unknown>>({})
  const pageFunctions = ref<Record<string, (...args: unknown[]) => unknown>>({})

  // ==================== FormCreate 配置 ====================

  const defaultFormCreateOptions = {
    form: false,
    submitBtn: false,
    resetBtn: false,
    injectEvent: true,
    global: {
      'e-columns': { render: () => null },
      'eColumns': { render: () => null },
      'e-column': { render: () => null },
      'eColumn': { render: () => null }
    } as Record<string, Component>
  }

  const formCreateOptions = ref({
    ...defaultFormCreateOptions,
    ...props.formCreateOptions
  })

  // ==================== 子 Composables ====================

  const { scopedCss, setScopedCss } = useCssScope({
    pageId: currentPageId.value,
    enableScope: props.enableCssScope ?? true
  })

  const { dataSet, initDataSet } = usePageDataSet({
    enableDataSet: props.enableDataSet ?? true
  })

  const { boundRules, rebindRules } = useRuleBinding({
    // @ts-expect-error FormCreate 类型系统与 Ref 类型不完全兼容
    originalRules,
    pageData,
    pageFunctions,
    dataSet
  })

  // @ts-expect-error FormCreate 类型系统与 Ref 类型不完全兼容
  const { setupSync } = useTableDataSync({ dataSet, formApi })

  // ==================== 页面上下文 ====================

  const pageContext: PageContext = {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    get $api() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
      return formApi.value as any
    },
    $route: route,
    $data: pageData,
    $el: () => pageContainer.value,
    $query: (selector: string) => pageContainer.value?.querySelector(selector) ?? null,
    $queryAll: (selector: string) => {
      if (pageContainer.value?.querySelectorAll) {
        return pageContainer.value.querySelectorAll(selector)
      }
      if (typeof document !== 'undefined') {
        return document.querySelectorAll(selector)
      }
      return [] as unknown as NodeListOf<Element>
    },
    $rebindRules: () => rebindRules(),
    $refreshData: async () => {},
    get $dataSet() {
      return dataSet.value
    },

    // 沙箱全局变量 — 优先使用注入的 UI 服务，回退到 ElementPlus
    ElMessage: (props.messageService ?? ElMessage) as typeof ElMessage,
    ElMessageBox: (props.confirmService ?? ElMessageBox) as typeof ElMessageBox,
    SparkData,
    h
  }

  // ==================== 页面配置加载 ====================

  const loadPageConfig = async () => {
    loading.value = true
    error.value = ''

    try {
      // 确定页面ID
      const pageId = props.pageId ??
                     (route.meta['pageId'] as string) ??
                     (route.params['id'] as string) ??
                     route.name as string

      if (!pageId) {
        const errorMsg = getErrorMessage(ErrorCodes.CONFIG_INVALID)
        pageLogger.error('无法确定页面ID', { route: route.fullPath })
        throw new Error(`${errorMsg}: 无法确定页面ID`)
      }

      currentPageId.value = pageId
      pageLogger.info('开始加载页面', { pageId, route: route.fullPath })

      // 执行 beforeLoad 钩子
      if (props.beforeLoad) {
        pageLogger.debug('执行 beforeLoad 钩子', { pageId })
        await props.beforeLoad(pageId)
      }

      // 加载配置
      let config
      if (props.pageConfig) {
        config = props.pageConfig
      } else if (props.configLoader) {
        pageLogger.debug('从 configLoader 加载配置', { pageId })
        const result = await props.configLoader.loadPageConfig(pageId)
        if (!result.success || !result.data) {
          const errorMsg = getErrorMessage(ErrorCodes.CONFIG_LOAD_FAILED)
          pageLogger.error('配置加载失败', { pageId, error: result.error })
          throw new Error(`${errorMsg}: ${result.error ?? '未知错误'}`)
        }
        config = result.data
      } else {
        const errorMsg = getErrorMessage(ErrorCodes.CONFIG_INVALID)
        pageLogger.error('未提供 configLoader 或 pageConfig')
        throw new Error(`${errorMsg}: 未提供 configLoader 或 pageConfig`)
      }

      pageLogger.info('页面配置加载成功', { pageId })

      // 将配置层的 RuleConfig 转换为 FormCreate 的 Rule
      originalRules.value = (config.rule || []) as unknown as Rule[]

      // 设置样式（config.css 为 parseCss 编译后的样式字符串）
      const cssText = config.css
      if (cssText) {
        pageLogger.debug('设置页面样式', { pageId, hasStyle: true })
        setScopedCss(cssText)
      }

      // 初始化 DataSet（config.data 已是编译后的 DataSet 实例）
      pageLogger.debug('初始化 DataSet', { pageId })
      initDataSet(config.data)

      // 将 DataSet 注入能力链，子组件通过 consume(PAGE_DATASET) 自行解析 dataKey
      if (dataSet.value) {
        provideCapability(PAGE_DATASET, dataSet.value)
      }

      // ========================================
      // 执行页面脚本
      // ========================================

      const scriptText = config.script ?? ''

      if (scriptText) {
        try {
          pageFunctions.value = compileFunctions(scriptText, pageContext)

          pageLogger.info('页面脚本执行成功', {
            pageId,
            returnedCount: Object.keys(pageFunctions.value).length,
            returned: Object.keys(pageFunctions.value)
          })

          // 执行 __init__ 函数（如果存在）
          if (pageFunctions.value['__init__'] && typeof pageFunctions.value['__init__'] === 'function') {
            try {
              pageLogger.info('执行 __init__ 函数', { pageId })
              pageFunctions.value['__init__']()
              pageLogger.info('__init__ 函数执行成功', { pageId })
            } catch (initError) {
              pageLogger.error('__init__ 函数执行失败', { pageId, error: initError })
            }
          }
        } catch (scriptError) {
          pageLogger.error('页面脚本执行失败', { pageId, error: scriptError })
          pageFunctions.value = {}
        }
      } else {
        pageFunctions.value = {}
      }

      // ========================================
      // 数据订阅和规则绑定
      // ========================================

      // 绑定 rules（必须在脚本执行之后，确保 pageFunctions 已就绪）
      await nextTick()
      pageLogger.debug('绑定 rules', {
        pageId,
        rulesCount: originalRules.value.length,
        functionCount: Object.keys(pageFunctions.value).length
      })
      rebindRules()

      // DataSet ↔ el-table 同步桥（在规则绑定后调用，视图已由 injectTableEvents 创建）
      setupSync()

      // 执行 afterLoad 钩子
      if (props.afterLoad) {
        pageLogger.debug('执行 afterLoad 钩子', { pageId })
        await props.afterLoad(config)
      }

      pageLogger.info('页面渲染完成', { pageId: currentPageId.value })
      loading.value = false
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      loading.value = false

      pageLogger.error('页面加载失败', {
        pageId: currentPageId.value,
        error: err instanceof Error ? err.message : String(err)
      })

      if (props.onError) {
        props.onError(err instanceof Error ? err : new Error(String(err)))
      }
    }
  }

  // ==================== 生命周期 ====================

  watch(() => route.fullPath, () => {
    void loadPageConfig()
  })

  onMounted(() => {
    void loadPageConfig()
  })

  // ==================== 返回值 ====================

  return {
    loading,
    error,
    currentPageId,
    scopedCss,
    boundRules,
    pageData,
    formApi,
    formCreateOptions,
    loadPageConfig,
    rebindRules,
    pageContext,
    dataSet
  }
}
