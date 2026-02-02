/**
 * @spark-view/spark-renderer
 * 
 * SPARK 页面渲染引擎 - L3 Model Layer
 * 负责将配置化页面渲染为 Vue 组件
 */

// 组件
export { default as PageRenderer } from './components/PageRenderer.vue'

// Composables
export { useCssScope } from './composables/useCssScope'
export { useScriptSandbox } from './composables/useScriptSandbox'
export { usePageDataSet } from './composables/usePageDataSet'
export { useRuleBinding } from './composables/useRuleBinding'

// 工具函数
export { scopeCSS, createScopedStyleElement, removeScopedStyle } from './utils/scopeCSS'
export { 
  createSandboxContext, 
  loadScriptModule,
  initGlobalPageContext,
  cleanupGlobalPageContext
} from './utils/createSandbox'
export { 
  bindDataToRules, 
  findRuleByDataKey,
  syncSelectedRowsToTable
} from './utils/bindRules'

// 类型导出
export type {
  Rule,
  FormCreateAPI,
  PageContext,
  PageScriptModule,
  PageConfig,
  PageRendererOptions,
  CssScopeOptions,
  ScriptSandboxOptions,
  DataSetInitOptions,
  RuleBindingOptions
} from './types'

// 命名空间
export { SparkRenderer } from './namespace'
