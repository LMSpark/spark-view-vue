/**
 * SSR 兼容性工具
 * 提供安全的浏览器 API 访问，在 SSR 环境中返回安全默认值
 */

/**
 * 安全获取 window 对象
 * 在 SSR 环境中返回 undefined
 */
export function getWindow(): Window | undefined {
  return typeof window !== 'undefined' ? window : undefined
}

/**
 * 安全获取 document 对象
 * 在 SSR 环境中返回 undefined
 */
export function getDocument(): Document | undefined {
  return typeof document !== 'undefined' ? document : undefined
}

/**
 * 检查是否在浏览器环境中
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

/**
 * 检查是否在服务器环境中
 */
export function isServer(): boolean {
  return !isBrowser()
}

/**
 * 安全的 window 属性访问
 * 在 SSR 环境中返回默认值
 */
export function getWindowProperty<T>(property: keyof Window, defaultValue: T): T {
  const win = getWindow()
  return win ? (win[property] as T) : defaultValue
}

/**
 * 安全的 document 属性访问
 * 在 SSR 环境中返回默认值
 */
export function getDocumentProperty<T>(property: keyof Document, defaultValue: T): T {
  const doc = getDocument()
  return doc ? (doc[property] as T) : defaultValue
}
