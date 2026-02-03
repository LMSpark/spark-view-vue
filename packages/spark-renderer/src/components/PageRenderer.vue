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
      <slot name="content" :rules="boundRules" :page-data="pageData">
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
import { ref, reactive, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { pageLogger, ErrorCodes, getErrorMessage } from '@spark-view/spark-app'
import type { PageRendererOptions, PageContext, FormCreateAPI, Rule } from '../types'
import { useCssScope } from '../composables/useCssScope'
import { compileFunctions } from '../utils/createSandbox'
import { usePageDataSet } from '../composables/usePageDataSet'
import { useRuleBinding } from '../composables/useRuleBinding'
import { getRequiredFunctionNames } from '../utils/extractFunctionNames'

/**
 * PageRenderer - SPARK 页面渲染引擎
 * 
 * 核心职责：
 * 1. 加载页面配置（从 configLoader）
 * 2. DataSet 管理（页面级数据隔离）
 * 3. CSS 隔离（作用域样式）
 * 4. 脚本沙箱（安全执行脚本）
 * 5. Rule 绑定（数据和事件绑定）
 */

// 定义插槽类型
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
  global: {
    'e-columns': { render: () => null },
    'eColumns': { render: () => null },
    'e-column': { render: () => null },
    'eColumn': { render: () => null }
  } as Record<string, any>
}

const formCreateOptions = ref({
  ...defaultFormCreateOptions,
  ...props.formCreateOptions
})

// 初始化页面上下文
const pageContext: PageContext = {
  get $api() {
    return formApi.value
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
  $rebindRules: () => {},
  $refreshData: async () => {},
  get $dataSet() {
    return dataSet.value
  }
}

// CSS 作用域
const { scopedCss, setScopedCss } = useCssScope({
  pageId: currentPageId.value,
  enableScope: props.enableCssScope
})

// 页面脚本函数
const pageFunctions = ref<Record<string, Function>>({})

// DataSet 管理
const { dataSet, initDataSet, autoSubscribeTables } = usePageDataSet({
  pageData,
  context: pageContext,
  originalRules,
  formApi,
  enableDataSet: props.enableDataSet
})

// Rule 绑定（注意：此时 pageFunctions 还是空对象，需要等脚本执行后再绑定）
const { boundRules, rebindRules } = useRuleBinding({
  originalRules,
  pageData,
  pageFunctions,
  dataSet,
  formApi
})

// 更新上下文的 rebindRules 方法
pageContext.$rebindRules = rebindRules

// 加载页面配置
const loadPageConfig = async () => {
  loading.value = true
  error.value = ''
  
  try {
    // 确定页面ID
    const pageId = props.pageId || 
                   (route.meta.pageId as string) || 
                   (route.params.id as string) || 
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
    
    pageLogger.success('页面配置加载成功', { pageId })
    
    // 处理页面数据
    Object.assign(pageData, config.data)
    
    // 将配置层的 RuleConfig 转换为 FormCreate 的 Rule
    // 注意：虽然类型不同，但运行时结构兼容，FormCreate 能识别我们的配置格式
    originalRules.value = (config.rule || []) as unknown as Rule[]
    
    // 设置样式
    if (pageData.style && typeof pageData.style === 'string') {
      pageLogger.debug('设置页面样式', { pageId, hasStyle: true })
      setScopedCss(pageData.style as string)
    }
    
    // 初始化 DataSet
    pageLogger.debug('初始化 DataSet', { pageId })
    initDataSet()
    
    // ========================================
    // 执行页面脚本
    // ========================================
    
    const scriptText = config.script || ''
    
    if (scriptText) {
      try {
        // 从 rules 中提取需要返回的函数名
        const requiredFunctionNames = getRequiredFunctionNames(
          originalRules.value,
          ['__init__']
        )
        
        pageLogger.debug('分析脚本需求', { 
          pageId, 
          scriptSize: scriptText.length,
          requiredFunctions: requiredFunctionNames.length,
          required: requiredFunctionNames
        })
        
        // 统一编译所有函数，按需返回
        // - scriptText 中所有函数都会被定义（可以相互调用）
        // - 但只返回 requiredFunctionNames 中的函数
        pageFunctions.value = compileFunctions(
          scriptText,
          pageContext,
          requiredFunctionNames
        )
        
        pageLogger.success('页面脚本执行成功', { 
          pageId, 
          returnedCount: Object.keys(pageFunctions.value).length,
          returned: Object.keys(pageFunctions.value)
        })
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
    
    // 自动订阅表
    await nextTick()
    pageLogger.debug('自动订阅表', { pageId })
    autoSubscribeTables()
    
    // 绑定 rules（必须在脚本执行之后，确保 pageFunctions 已就绪）
    pageLogger.debug('绑定 rules', { 
      pageId, 
      rulesCount: originalRules.value.length,
      functionCount: Object.keys(pageFunctions.value).length
    })
    rebindRules()
    
    // 执行 afterLoad 钩子
    if (props.afterLoad) {
      pageLogger.debug('执行 afterLoad 钩子', { pageId })
      await props.afterLoad(config)
    }
    
    pageLogger.success('页面渲染完成', { pageId: currentPageId.value })
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
