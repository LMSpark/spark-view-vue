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

import { ref, reactive, onMounted, watch, nextTick, h, inject, getCurrentInstance, defineComponent, markRaw, type Ref, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Logger, APP_SERVICES, PAGE_SERVICE, type IPageServiceCapability } from '@spark-view/spark-utils'
import type { IDataSet } from '@spark-view/spark-data'
import { SparkData, PAGE_DATASET } from '@spark-view/spark-data'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSparkComponent } from '../../composables/useSparkComponent'
import { SPARK_REGISTRY_KEY } from '../../core/types.js'
import { usePageDataSet } from './usePageDataSet'
import type { PageRendererOptions, PageContext, Rule, FormCreateAPI, PageConfig } from '../types'
import { useCssScope } from './useCssScope'
import { useRuleBinding } from './useRuleBinding'
import { compileFunctions } from '../utils/createSandbox'
import { buildAppServices } from '../utils/provideAppServices'

const pageLogger = Logger('PageRenderer')

// 模块级常量：form-create 默认选项（不依赖任何 composable 内部状态，避免每次调用时重建）
const DEFAULT_FORM_CREATE_OPTIONS = {
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
  // Note: form-create API 对象类型复杂，使用 any 避免类型冲突
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

  // 获取组件注册表（用于 bindRules 查询 dataKey 行为元数据）
  const registry = inject(SPARK_REGISTRY_KEY, undefined)

  provideCapability(APP_SERVICES, buildAppServices(router, pageLogger))

  // 构建 PAGE_SERVICE 能力（优先使用 props 注入，回退到 element-plus）
  const pageService: IPageServiceCapability = {
    showMessage: (message, type = 'info') => {
      if (props.messageService) {
        const fn = props.messageService[type]
        if (typeof fn === 'function') { fn(message); return }
      }
      ElMessage({ message, type })
    },
    showConfirm: async (message, title) => {
      if (props.confirmService) {
        await props.confirmService.confirm(message, title)
        return true
      }
      try { await ElMessageBox.confirm(message, title ?? '确认'); return true }
      catch { return false }
    },
    showLoading: (_show) => { /* TODO: 待接入加载遗罩服务 */ },
    navigate: (path, params) => {
      void router.push(params ? { path, query: params as Record<string, string> } : path)
    }
  }
  provideCapability(PAGE_SERVICE, pageService)

  // ==================== 状态声明 ====================

  const loading = ref(true)
  const error = ref<string>('')
  const currentPageId = ref<string>('')
  // Note: form-create API 对象类型复杂，使用 any 避免类型冲突
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formApi = ref<any>(null)
  // Note: form-create 的 Rule 类型过于复杂，使用 any[] 避免类型冲突
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const originalRules = ref<any[]>([])
  const pageData = reactive<Record<string, unknown>>({})
  const pageFunctions = ref<Record<string, (...args: unknown[]) => unknown>>({})

  // ==================== FormCreate 配置 ====================

  const formCreateOptions = ref({
    ...DEFAULT_FORM_CREATE_OPTIONS,
    // ⚠️ 暂时移除 formData 绑定，避免与 DataSet 事件的无限循环
    // formData: pageData,  
    ...props.formCreateOptions,
    // ✅ 使用 form-create 的 mounted 生命周期执行 __init__
    mounted: () => {
      pageLogger.info('✅ [FormCreate] mounted 触发，开始执行 __init__')
      const init = pageFunctions.value['__init__']
      if (typeof init === 'function') {
        try {
          init()
          pageLogger.info('✅ __init__ 执行成功')
        } catch (e) {
          pageLogger.error('__init__ 执行失败', { error: e })
        }
      }
    }
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
    originalRules,
    pageData,
    pageFunctions,
    dataSet,
    formApi,
    ...(registry !== undefined ? { registry } : {})
  })

  // ==================== 页面上下文 ====================

  // Note: PageContext.$api 使用 any 类型，因为 form-create API 对象有复杂的动态属性
  const pageContext: PageContext = {
    get $api() {
      // 通过 FormCreateAPI 类型断言，避免 no-unsafe-return
      return formApi.value as FormCreateAPI | null
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
    // PAGE_SERVICE 能力快捷访问（脚本中优先使用 $page.showMessage 替代 ElMessage）
    $page: pageService,

    // 沙笼全局变量 — 优先使用注入的 UI 服务，回退到 ElementPlus（legacy，新脚本请改用 $page）
    ElMessage: (props.messageService ?? ElMessage) as typeof ElMessage,
    ElMessageBox: (props.confirmService ?? ElMessageBox) as typeof ElMessageBox,
    SparkData,
    h
  }

  // ==================== 页面配置加载 ====================

  /** 从 props / route 推断当前页面ID，无法确定时抛出。 */
  function resolvePageId(): string {
    const pageId =
      props.pageId ??
      (route.meta['pageId'] as string | undefined) ??
      (route.params['id'] as string | undefined) ??
      (route.name as string | undefined)
    if (!pageId) {
      pageLogger.error('无法确定页面ID', { route: route.fullPath })
      throw new Error('配置无效: 无法确定页面ID')
    }
    return pageId
  }

  /** 获取页面配置（props 直传 或 configLoader 异步加载）。 */
  async function fetchConfig(pageId: string): Promise<PageConfig> {
    if (props.pageConfig) return props.pageConfig
    if (props.configLoader) {
      const result = await props.configLoader.loadPageConfig(pageId)
      if (!result.success || !result.data) {
        pageLogger.error('配置加载失败', { pageId, error: result.error })
        throw new Error(`配置加载失败: ${result.error ?? '未知错误'}`)
      }
      return result.data
    }
    throw new Error('配置无效: 未提供 configLoader 或 pageConfig')
  }

  /** 编译脚本（不执行 __init__，由 form-create mounted 钩子执行）。 */
  function executeScript(pageId: string, scriptText: string): void {
    if (!scriptText) { pageFunctions.value = {}; return }
    try {
      pageFunctions.value = compileFunctions(scriptText, pageContext)
      pageLogger.info('📜 [Script] 脚本编译成功', { 
        pageId, 
        functionCount: Object.keys(pageFunctions.value).length,
        functions: Object.keys(pageFunctions.value)
      })
    } catch (e) {
      pageLogger.error('脚本编译失败', { pageId, error: e })
      pageFunctions.value = {}
    }
  }

  /** 将已加载的 config 应用到渲染状态。
   * 
   * 新的时序策略：
   * 1. 设置 rules/CSS/pageData
   * 2. 初始化 DataSet
   * 3. 编译脚本（不执行 __init__）
   * 4. rebindRules 触发 form-create 挂载
   * 5. form-create mounted 钩子执行 __init__（此时 $api 已可用）
   */
  async function applyConfig(pageId: string, config: PageConfig): Promise<void> {
    // 阶段1: 设置配置
    originalRules.value = (config.rule ?? []) as unknown as Rule[]
    Object.assign(pageData, config.data)
    if (config.css) setScopedCss(config.css)
    
    // 阶段2: 初始化 DataSet
    initDataSet(config.data)
    if (dataSet.value) provideCapability(PAGE_DATASET, dataSet.value)
    
    // 阶段3: 编译脚本（不执行 __init__）
    pageLogger.info('🎬 [Timing] 开始编译脚本', { pageId })
    executeScript(pageId, config.script ?? '')
    
    // 将 Render* 函数注册为响应式 Vue 全局组件
    // 这样 form-create 遇到 { type: 'RenderXxx' } 时能从 Vue 组件注册表找到它
    // 组件的 setup 返回 render fn，Vue 自动追踪响应式依赖，数据变化时自动重渲染
    const appCtx = getCurrentInstance()?.appContext.app
    if (appCtx) {
      for (const [name, fn] of Object.entries(pageFunctions.value)) {
        if (name.startsWith('Render') && typeof fn === 'function') {
          const capturedFn = fn
          const comp = markRaw(defineComponent({
            name,
            setup() { return () => (capturedFn as () => unknown)() }
          }))
          // 注册 PascalCase 版本（"RenderNodeInfo"）
          appCtx.component(name, comp)
          // form-create toCase 会将类型转为首字母小写，同时注册 camelCase 版本（"renderNodeInfo"）
          const camelName = name.charAt(0).toLowerCase() + name.slice(1)
          appCtx.component(camelName, comp)
        }
      }
    }
    await nextTick()
    rebindRules()
    
    // 此时 form-create 开始挂载，当挂载完成后会触发 mounted 钩子，执行 __init__
  }

  /** 完整页面加载流程编排：beforeLoad → resolvePageId → fetchConfig → applyConfig → afterLoad。 */
  const loadPageConfig = async () => {
    loading.value = true
    error.value = ''
    try {
      const pageId = resolvePageId()
      currentPageId.value = pageId
      if (props.beforeLoad) await props.beforeLoad(pageId)
      const config = await fetchConfig(pageId)
      await applyConfig(pageId, config)
      if (props.afterLoad) await props.afterLoad(config)
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      props.onError?.(err instanceof Error ? err : new Error(String(err)))
    } finally {
      loading.value = false
    }
  }

  // ==================== 生命周期 ====================

  // 仅当页面ID实际变化时才重新加载（排除 query/hash 等无关导航）
  watch(
    () => props.pageId ?? route.meta['pageId'] ?? route.params['id'] ?? route.name,
    (newId, oldId) => { if (newId !== oldId) void loadPageConfig() }
  )

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
