/**
 * CSS 作用域 Composable
 */

import { ref, onUnmounted, Ref } from 'vue'
import { scopeCSS, removeScopedStyle } from '../utils/scopeCSS'

export interface UseCssScopeOptions {
  pageId: string
  enableScope?: boolean
}

export interface UseCssScopeReturn {
  scopedCss: Ref<string>
  setScopedCss: (css: string) => void
  clearScopedCss: () => void
}

/**
 * CSS 作用域隔离 Hook
 * 
 * @example
 * ```vue
 * <script setup>
 * const { scopedCss, setScopedCss } = useCssScope({ pageId: 'home' })
 * 
 * onMounted(() => {
 *   setScopedCss('.button { color: red; }')
 * })
 * </script>
 * 
 * <template>
 *   <component :is="'style'" v-if="scopedCss">{{ scopedCss }}</component>
 * </template>
 * ```
 */
export function useCssScope(options: UseCssScopeOptions): UseCssScopeReturn {
  const { pageId, enableScope = true } = options
  const scopedCss = ref<string>('')
  
  const setScopedCss = (css: string) => {
    if (!css) {
      scopedCss.value = ''
      return
    }
    
    scopedCss.value = enableScope 
      ? scopeCSS({ pageId, css })
      : css
  }
  
  const clearScopedCss = () => {
    scopedCss.value = ''
  }
  
  // 组件卸载时清理样式
  onUnmounted(() => {
    removeScopedStyle(pageId)
  })
  
  return {
    scopedCss,
    setScopedCss,
    clearScopedCss
  }
}
