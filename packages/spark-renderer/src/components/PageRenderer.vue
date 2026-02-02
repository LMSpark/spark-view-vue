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
          :rule="boundRules"
          :option="formCreateOptions"
          @mounted="onFormMounted"
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
import { useScriptSandbox } from '../composables/useScriptSandbox'
import { usePageDataSet } from '../composables/usePageDataSet'
import { useRuleBinding } from '../composables/useRuleBinding'

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

const props = withDefaults(defineProps<PageRendererOptions>(), {
  enableCssScope: true,
  enableScriptSandbox: true,
  enableDataSet: true
})

const route = useRoute()
const loading = ref(true)
const error = ref<string>('')
const currentPageId = ref<string>('')
const pageContainer = ref<HTMLElement | null>(null)
const formApi = ref<FormCreateAPI | null>(null)
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
  $api: null,
  $route: route,
  $data: pageData,
  $el: null,
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
  $dataSet: null
}

// CSS 作用域
const { scopedCss, setScopedCss } = useCssScope({
  pageId: currentPageId.value,
  enableScope: props.enableCssScope
})

// 脚本沙箱
const { pageFunctions, loadScript } = useScriptSandbox({
  pageId: currentPageId.value,
  context: pageContext,
  enableSandbox: props.enableScriptSandbox
})

// DataSet 管理
const { dataSet, initDataSet, autoSubscribeTables } = usePageDataSet({
  pageData,
  context: pageContext,
  originalRules,
  formApi,
  enableDataSet: props.enableDataSet
})

// Rule 绑定
const { boundRules, rebindRules } = useRuleBinding({
  originalRules,
  pageData,
  pageFunctions,
  dataSet,
  formApi
})

// 更新上下文的 rebindRules 方法
pageContext.$rebindRules = rebindRules

// FormCreate 挂载回调
const onFormMounted = (api: FormCreateAPI) => {
  formApi.value = api
  pageContext.$api = api
  
  // 更新全局上下文
  if (typeof window !== 'undefined') {
    window.__formApi__ = api
    if (window.__pageContext) {
      window.__pageContext.$api = api
    }
  }
  
  pageLogger.debug('FormCreate 挂载完成', { pageId: currentPageId.value })
}

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
    
    // 保存原始 rules
    originalRules.value = config.rule || []
    
    // 设置样式
    if (config.style) {
      pageLogger.debug('设置页面样式', { pageId, hasStyle: true })
      setScopedCss(config.style)
    }
    
    // 初始化 DataSet
    pageLogger.debug('初始化 DataSet', { pageId })
    initDataSet()
    
    // 加载脚本
    if (props.enableScriptSandbox) {
      pageLogger.debug('加载页面脚本', { pageId })
      await loadScript()
    }
    
    // 自动订阅表
    await nextTick()
    pageLogger.debug('自动订阅表', { pageId })
    autoSubscribeTables()
    
    // 绑定 rules
    pageLogger.debug('绑定 rules', { pageId, rulesCount: originalRules.value.length })
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

// 更新容器引用
watch(pageContainer, (el) => {
  pageContext.$el = el
  if (typeof window !== 'undefined' && window.__pageContext) {
    window.__pageContext.$el = el
  }
})

// 监听路由变化，重新加载页面
watch(() => route.fullPath, () => {
  loadPageConfig()
})

// 组件挂载时加载配置
onMounted(() => {
  loadPageConfig()
})

// 暴露方法给父组件
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
