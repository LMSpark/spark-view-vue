/**
 * @module @spark-appworks/spark-component:page/renderer/useCssScope
 * @spark-appworks/spark-component 的 page/renderer/useCssScope 模块。
 * 导出 ClassModel symbol: UseCssScopeOptions（共 1 个 symbol）。
 */
/**
 * CSS 作用域 Composable
 */

import { ref, onUnmounted } from 'vue'
import { scopeCSS, removeScopedStyle } from './scopeCSS'

type UseCssScopeOptions = {
    /** 是否 enable Scope。 */
enableScope?: boolean}

/**
 * CSS 作用域隔离 Hook
 *
 * pageId 在 setScopedCss 调用时传入（而非初始化时），
 * 因为 composable 创建时 pageId 通常尚未确定。
 *
 * @example
 * ```vue
 * <script setup>
 * const { scopedCss, setScopedCss } = useCssScope()
 *
 * onMounted(() => {
 *   setScopedCss('home', '.button { color: red; }')
 * })
 * </script>
 *
 * <template>
 *   <component :is="'style'" v-if="scopedCss">{{ scopedCss }}</component>
 * </template>
 * ```
 */
export function useCssScope(options: UseCssScopeOptions = {}) {
  const { enableScope = true } = options
  const scopedCss = ref<string>('')
  let lastPageId = ''

  const setScopedCss = (pageId: string, css: string) => {
    lastPageId = pageId
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
    if (lastPageId) removeScopedStyle(lastPageId)
  })

  return {
    scopedCss,
    setScopedCss
  }
}
