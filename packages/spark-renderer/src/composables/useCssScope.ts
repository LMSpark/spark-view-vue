/**
 * CSS 作用域 Composable
 */

import { ref, onUnmounted } from 'vue'
import { scopeCSS, removeScopedStyle } from '../utils/scopeCSS'

export interface UseCssScopeOptions {
  pageId: string
  enableScope?: boolean
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
export function useCssScope(options: UseCssScopeOptions) {
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
  
  // 组件卸载时清理样式
  onUnmounted(() => {
    removeScopedStyle(pageId)
  })
  
  return {
    scopedCss,
    setScopedCss
  }
}
