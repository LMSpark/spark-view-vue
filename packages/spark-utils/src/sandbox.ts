/**
 * 共享沙箱工具
 *
 * 供 `spark-data`（计算列表达式）和 `spark-component`（页面脚本）两个沙箱统一使用。
 * 纯 TypeScript，零框架依赖。
 */

/** 拦截原型链访问的危险属性，防止 `with()` 沙箱逃逸 */
export const SANDBOX_BLOCKED_KEYS = new Set<string | symbol>([
  '__proto__', 'constructor', 'prototype',
  'globalThis', 'window', 'self', 'top', 'parent', 'frames',
  'document', 'location', 'eval', 'Function',
  'process', 'require', 'module', 'exports', 'global',
  'setTimeout', 'setInterval', 'setImmediate',
  'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts',
  'Proxy', 'Reflect',
])

/**
 * 创建安全的沙箱代理——拦截 `with(__ctx)` 中的属性查找与写入。
 *
 * - `has`  对 SANDBOX_BLOCKED_KEYS 返回 true（阻止从原型链逃逸）
 * - `has`  对目标上已有属性返回 true
 * - `has`  其余返回 false（让 with 作用域链回退到全局，Math/Array 等安全内建可正常使用）
 * - `get`  阻断危险键，返回 undefined
 * - `set`  阻断危险键写入，返回 false
 */
/** 共享 handler——无闭包捕获，所有 Proxy 实例复用同一个 handler 对象 */
const _SAFE_HANDLER: ProxyHandler<object> = {
  has(t, key) {
    if (typeof key === 'string' && SANDBOX_BLOCKED_KEYS.has(key)) return true
    return Reflect.has(t, key)
  },
  get(t, key, receiver) {
    if (key === Symbol.unscopables) return undefined
    if (typeof key === 'string' && SANDBOX_BLOCKED_KEYS.has(key)) {
      // Allow explicit overrides on the context (e.g. safe timer wrappers)
      if (Object.prototype.hasOwnProperty.call(t, key)) {
        return Reflect.get(t, key, receiver) as unknown
      }
      return undefined
    }
    return Reflect.get(t, key, receiver) as unknown
  },
  set(t, key, value) {
    if (typeof key === 'string' && SANDBOX_BLOCKED_KEYS.has(key)) return false
    return Reflect.set(t, key, value)
  },
}

/** WeakMap 缓存——同一 target 对象复用已创建的 Proxy（计算列热路径：N行×M列 → N次创建） */
const _proxyCache = new WeakMap<object, object>()

export function createSafeProxy<T extends object>(target: T): T {
  let cached = _proxyCache.get(target) as T | undefined
  if (cached !== undefined) return cached
  cached = new Proxy(target, _SAFE_HANDLER) as T
  _proxyCache.set(target, cached)
  return cached
}
