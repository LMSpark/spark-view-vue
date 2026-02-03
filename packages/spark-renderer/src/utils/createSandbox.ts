/**
 * 脚本沙箱工具
 */

import { pageLogger } from '@spark-view/spark-app'
import type { PageContext, PageScriptModule, ScriptSandboxOptions } from '../types'

/**
 * 创建页面脚本沙箱上下文
 */
export function createSandboxContext(options: ScriptSandboxOptions): PageContext {
  const { context } = options
  
  // 创建沙箱全局对象
  const sandbox: PageContext = {
    $api: context.$api,
    $route: context.$route,
    $data: context.$data,
    $el: context.$el,
    $query: context.$query,
    $queryAll: context.$queryAll,
    $rebindRules: context.$rebindRules,
    $refreshData: context.$refreshData,
    $dataSet: context.$dataSet
  }
  
  return sandbox
}

/**
 * 在沙箱中执行脚本
 * 
 * @deprecated 不建议使用 eval，优先使用 ES6 模块导入
 */
export function executeInSandbox(
  scriptText: string,
  context: PageContext
): PageScriptModule {
  const exports: PageScriptModule = {}
  
  try {
    // 使用 Function 构造器创建沙箱
    const func = new Function(
      '$api',
      '$route',
      '$data',
      '$el',
      '$query',
      '$queryAll',
      '$dataSet',
      'exports',
      scriptText
    )
    
    func(
      () => context.$api,
      () => context.$route,
      () => context.$data,
      () => context.$el,
      context.$query,
      context.$queryAll,
      () => context.$dataSet,
      exports
    )
  } catch (error) {
    pageLogger.error('脚本执行错误', { error })
    throw error
  }
  
  return exports
}

/**
 * 动态导入页面脚本模块（ES6 模块）
 * 
 * @example
 * ```typescript
 * const module = await loadScriptModule('home', '/pages-config')
 * const { handleClick } = module
 * ```
 */
export async function loadScriptModule(
  pageId: string,
  baseUrl = '/pages-config'
): Promise<PageScriptModule> {
  const url = `${baseUrl}/${pageId}/script.js`
  
  try {
    // 使用动态 import 加载 ES6 模块
    const module = await import(/* @vite-ignore */ url)
    return module
  } catch (error) {
    pageLogger.warn('无法加载页面脚本', { url, error })
    return {}
  }
}

/**
 * 初始化全局页面上下文（浏览器环境）
 */
export function initGlobalPageContext(context: PageContext): void {
  if (typeof window !== 'undefined') {
    ;(window as any).__pageContext = context
  }
}

/**
 * 清理全局页面上下文
 */
export function cleanupGlobalPageContext(): void {
  if (typeof window !== 'undefined') {
    delete (window as any).__pageContext
    delete (window as any).__formApi__
  }
}

// 移除全局类型声明，避免与 DynamicPage.vue 冲突
