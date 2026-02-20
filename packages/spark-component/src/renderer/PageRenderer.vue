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
    
    <!-- 渲染页面内容 -->
    <div ref="pageContainer" :data-page="currentPageId" class="spark-page-container">
      <slot name="content" :rules="(boundRules as Rule[])" :page-data="pageData">
        <form-create
          v-if="boundRules.length > 0"
          v-model:api="formApi"
          :rule="boundRules"
          :option="formCreateOptions"
        />
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch, nextTick, h, type Component } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { Logger, APP_SERVICES } from '@spark-view/spark-utils'
import { useSparkComponent } from '@spark-view/spark-component'
import { ElMessage, ElMessageBox } from 'element-plus'
import { SparkData, PAGE_DATASET } from '@spark-view/spark-data'

// 本地 Logger
const pageLogger = Logger('PageRenderer')

// ==================== SPARK 能力上下文 ====================
// 接入 spark-component 的组件树，保证子组件通过 consume() 能找到这里 provide 的能力
const router = useRouter()
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

// 本地错误码
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
import type { PageRendererOptions, PageContext, FormCreateAPI, Rule } from './types'
import { useCssScope } from './composables/useCssScope'
import { compileFunctions } from './utils/createSandbox'
import { usePageDataSet } from '@spark-view/spark-data'
import { useRuleBinding } from './composables/useRuleBinding'
import { useTableDataSync } from './composables/useTableDataSync'

/**
 * PageRenderer - SPARK 页面渲染引擎
 * 
 * 核心职责：
 * 1. 加载页面配置（从 configLoader）
 * 2. DataSet 管理（页面级数据隔离）
 * 3. CSS 隔离（作用域样式）
 * 4. 脚本沙箱（安全执行脚本）
 * 5. Rule 绑定（数据和事件绑定）
 * 
 * @component PageRenderer
 * @example
 * ```vue
 * <PageRenderer 
 *   :configLoader="configLoader"
 *   :pageId="'user-list'"
 *   :enableCssScope="true"
 *   :enableDataSet="true"
 *   @beforeLoad="handleBeforeLoad"
 *   @afterLoad="handleAfterLoad"
 * >
 *   <template #loading>加载中...</template>
 *   <template #error="{ error }">加载失败: {{ error }}</template>
 * </PageRenderer>
 * ```
 * 
 * @author SPARK Team
 * @since v1.0.0
 */

// 定义插槽类型
/**
 * @slot loading - 页面加载中时显示的内容
 * @slot error - 页面加载失败时显示的内容
 * @slot error.error {string} - 错误信息
 * @slot content - 自定义页面内容渲染
 * @slot content.rules {Rule[]} - FormCreate 规则数组
 * @slot content.pageData {Record<string, unknown>} - 页面数据对象
 */
defineSlots<{
  loading?: () => unknown
  error?: (props: { error: string }) => unknown
  content?: (props: { rules: Rule[], pageData: Record<string, unknown> }) => unknown
}>()

const props = withDefaults(defineProps<PageRendererOptions>(), {
  enableCssScope: true,
  enableDataSet: true
})

const route = useRoute()
const loading = ref(true)
const error = ref<string>('')
const currentPageId = ref<string>('')
const pageContainer = ref<HTMLElement | null>(null)
const formApi = ref<FormCreateAPI | null>(null)
// 存储转换为 FormCreate 标准格式的规则
const originalRules = ref<Rule[]>([])
const pageData = reactive<Record<string, unknown>>({})

// 默认 FormCreate 配置
const defaultFormCreateOptions = {
  form: false,
  submitBtn: false,
  resetBtn: false,
  // 启用事件注入，使 on 属性中的事件能正常工作
  injectEvent: true, // ✅ 必须为 true，否则事件监听器不生效
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

// CSS 作用域
const { scopedCss, setScopedCss } = useCssScope({
  pageId: currentPageId.value,
  enableScope: props.enableCssScope
})

// 页面脚本函数
const pageFunctions = ref<Record<string, (...args: unknown[]) => unknown>>({})

// DataSet 管理（纯生命周期，不依赖 rules/formApi）
const { dataSet, initDataSet } = usePageDataSet({
  enableDataSet: props.enableDataSet
})

// Rule 绑定（注意：此时 pageFunctions 还是空对象，需要等脚本执行后再绑定）
const { boundRules, rebindRules } = useRuleBinding({
  // @ts-expect-error FormCreate 类型系统与 Ref 类型不完全兼容
  originalRules: originalRules,
  pageData,
  pageFunctions,
  dataSet
})

// DataSet ↔ el-table 双向同步桥（统一管理选中/当前行的 DataSet → UI 方向）
// @ts-expect-error FormCreate 类型系统与 Ref 类型不完全兼容
const { setupSync } = useTableDataSync({ dataSet, formApi })

// 页面上下文（在所有 composable 之后创建，rebindRules/dataSet 均已就绪，闭包引用安全）
const pageContext: PageContext = {
  get $api() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return formApi.value as any
  },
  $route: route,
  $data: pageData,
  $el: () => pageContainer.value,
  $query: (selector: string) => pageContainer.value?.querySelector(selector) || null,
  $queryAll: (selector: string) => {
    if (pageContainer.value?.querySelectorAll) {
      return pageContainer.value.querySelectorAll(selector)
    }
    if (typeof document !== 'undefined') {
      return document.querySelectorAll(selector)
    }
    return [] as unknown as NodeListOf<Element>
  },
  $rebindRules: () => rebindRules(),  // 直接闭包引用，无需事后赋值修补
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

// 加载页面配置
const loadPageConfig = async () => {
  loading.value = true
  error.value = ''
  
  try {
    // 确定页面ID
    const pageId = props.pageId || 
                   (route.meta['pageId'] as string) ||
                   (route.params['id'] as string) ||
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
      // 直接使用传入的配置
      config = props.pageConfig
    } else if (props.configLoader) {
      // 从 configLoader 加载
      pageLogger.debug('从 configLoader 加载配置', { pageId })
      const result = await props.configLoader.loadPageConfig(pageId)
      if (!result.success || !result.data) {
        const errorMsg = getErrorMessage(ErrorCodes.CONFIG_LOAD_FAILED)
        pageLogger.error('配置加载失败', { pageId, error: result.error })
        throw new Error(`${errorMsg}: ${result.error || '未知错误'}`)
      }
      config = result.data
    } else {
      const errorMsg = getErrorMessage(ErrorCodes.CONFIG_INVALID)
      pageLogger.error('未提供 configLoader 或 pageConfig')
      throw new Error(`${errorMsg}: 未提供 configLoader 或 pageConfig`)
    }
    
    pageLogger.info('页面配置加载成功', { pageId })
    
    // config.data 已是 DataSet 实例，不再需要 Object.assign 到 pageData
    
    // 将配置层的 RuleConfig 转换为 FormCreate 的 Rule
    // 注意：虽然类型不同，但运行时结构兼容，FormCreate 能识别我们的配置格式
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
    
    const scriptText = config.script || ''
    
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
      } catch (error) {
        pageLogger.error('页面脚本执行失败', { pageId, error })
        pageFunctions.value = {}
      }
    } else {
      // 没有脚本时，确保 pageFunctions 为空对象
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

// ========================================
// 生命周期和监听
// ========================================

// 监听路由变化，重新加载页面
watch(() => route.fullPath, () => {
  loadPageConfig()
})

// 组件挂载时加载配置
onMounted(() => {
  loadPageConfig()
})

// ========================================
// 组件暴露 API
// ========================================

/**
 * 暴露方法给父组件（通过 ref 访问）
 * 
 * 使用方式：
 *   const pageRef = ref()
 * 
 * 可用方法：
 *   pageRef.value?.reload()        - 重新加载页面
 *   pageRef.value?.rebindRules()   - 重新绑定规则
 *   pageRef.value?.pageContext     - 访问页面上下文
 *   pageRef.value?.formApi         - 访问表单 API
 *   pageRef.value?.dataSet         - 访问数据集
 */
defineExpose({
  reload: loadPageConfig,
  rebindRules,
  pageContext,
  formApi,
  dataSet
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
