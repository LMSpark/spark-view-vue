/**
 * CSS 作用域隔离工具
 */

import type { CssScopeOptions } from '../types'

/**
 * 为 CSS 添加作用域前缀
 * 
 * @example
 * ```typescript
 * const scopedCss = scopeCSS({
 *   pageId: 'home',
 *   css: '.button { color: red; }'
 * })
 * // 结果: [data-page="home"] .button { color: red; }
 * ```
 */
export function scopeCSS(options: CssScopeOptions): string {
  const { pageId, css } = options
  
  if (!css) return ''
  
  // 为每个 CSS 规则添加属性选择器前缀
  return css.replace(
    /([^{}]+)\{([^}]*)\}/g,
    (match, selector, rules) => {
      // 跳过 @media, @keyframes 等 at-rules
      if (selector.trim().startsWith('@')) {
        return match
      }
      
      // 分割多个选择器（如 .a, .b { }）
      const selectors = selector.split(',').map((s: string) => {
        const trimmed = s.trim()
        // 如果已经有 data-page 前缀，跳过
        if (trimmed.includes('[data-page')) {
          return trimmed
        }
        // 添加属性选择器前缀
        return `[data-page="${pageId}"] ${trimmed}`
      })
      
      return `${selectors.join(', ')} {${rules}}`
    }
  )
}

/**
 * 创建作用域样式元素
 */
export function createScopedStyleElement(pageId: string, css: string): HTMLStyleElement | null {
  if (typeof document === 'undefined') return null
  
  const style = document.createElement('style')
  style.setAttribute('data-page-style', pageId)
  style.textContent = scopeCSS({ pageId, css })
  return style
}

/**
 * 移除页面样式
 */
export function removeScopedStyle(pageId: string): void {
  if (typeof document === 'undefined') return
  
  const styles = document.querySelectorAll(`style[data-page-style="${pageId}"]`)
  styles.forEach(style => style.remove())
}
