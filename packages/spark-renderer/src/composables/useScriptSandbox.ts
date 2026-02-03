/**
 * 脚本沙箱 Composable
 */

import { ref, Ref } from 'vue'
import { pageLogger } from '@spark-view/spark-app'
import type { PageContext } from '../types'
import { 
  createSandboxContext, 
  loadScriptModule,
  initGlobalPageContext
} from '../utils/createSandbox'

export interface UseScriptSandboxOptions {
  pageId: string
  context: PageContext
  enableSandbox?: boolean
  baseUrl?: string
}

export interface UseScriptSandboxReturn {
  pageFunctions: Ref<Record<string, Function>>
  loadScript: () => Promise<void>
  executeFunction: (name: string, ...args: unknown[]) => unknown
  hasFunction: (name: string) => boolean
}

/**
 * 脚本沙箱 Hook
 * 
 * @example
 * ```typescript
 * const { pageFunctions, loadScript } = useScriptSandbox({
 *   pageId: 'home',
 *   context: pageContext
 * })
 * 
 * await loadScript()
 * ```
 */
export function useScriptSandbox(options: UseScriptSandboxOptions): UseScriptSandboxReturn {
  const { pageId, context, enableSandbox = true, baseUrl = '/pages-config' } = options
  const pageFunctions = ref<Record<string, Function>>({})
  
  const loadScript = async () => {
    try {
      // 初始化全局上下文
      if (enableSandbox) {
        const sandboxContext = createSandboxContext({ pageId, context })
        initGlobalPageContext(sandboxContext)
      }
      
      // 加载页面脚本模块
      const module = await loadScriptModule(pageId, baseUrl)
      pageFunctions.value = module
      
      pageLogger.debug('页面脚本加载成功', {
        pageId,
        functions: Object.keys(module)
      })
    } catch (error) {
      pageLogger.warn('页面脚本加载失败', { pageId, error })
      pageFunctions.value = {}
    }
  }
  
  const executeFunction = (name: string, ...args: unknown[]) => {
    const fn = pageFunctions.value[name]
    if (typeof fn === 'function') {
      return fn(...args)
    } else {
      pageLogger.warn('函数不存在', { name, pageId })
      return undefined
    }
  }
  
  const hasFunction = (name: string): boolean => {
    return typeof pageFunctions.value[name] === 'function'
  }
  
  return {
    pageFunctions,
    loadScript,
    executeFunction,
    hasFunction
  }
}
