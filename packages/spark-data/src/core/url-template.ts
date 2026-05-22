/**
 * URL 模板解析工具
 *
 * 统一支持两种路径参数风格：
 * - Express 风格：`/users/:id/orders/:orderId`
 * - 花括号风格：`/users/{id}/orders/{orderId}`
 *
 * 解析后返回替换后的 URL 及未被模板消费的剩余参数。
 */

/** 匹配 `:param` 或 `{param}` 路径变量 */
const URL_PARAM_RE = /:(\w+)|\{(\w+)\}/g

export type ResolvedUrl = {
  /** 替换路径参数后的 URL */
  url: string
  /** 未被 URL 模板消费的剩余参数（可用于 query/body） */
  rest: Record<string, unknown>}

/**
 * 解析 URL 模板中的路径参数
 *
 * @param urlTemplate URL 模板（如 `/api/users/:id` 或 `/api/users/{id}`）
 * @param params      键值对，匹配的键会替换到 URL 中，未匹配的放入 `rest`
 * @returns 解析结果
 *
 * @example
 * ```ts
 * resolveUrlTemplate('/api/users/:id', { id: 42, name: 'Alice' })
 * // => { url: '/api/users/42', rest: { name: 'Alice' } }
 *
 * resolveUrlTemplate('/api/tree/{parentId}/children', { parentId: 'root', page: 1 })
 * // => { url: '/api/tree/root/children', rest: { page: 1 } }
 * ```
 */
export function resolveUrlTemplate(
  urlTemplate: string,
  params: Record<string, unknown> = {}
): ResolvedUrl {
  const usedKeys = new Set<string>()

  const url = urlTemplate.replace(URL_PARAM_RE, (match, colonKey?: string, braceKey?: string) => {
    const key = colonKey ?? braceKey ?? ''
    if (!key) return match
    const value = params[key]
    if (value !== undefined) {
      usedKeys.add(key)
      return encodeURIComponent(String(value))
    }
    // 参数未提供时保留原占位符（或返回空字符串，按业务约定）
    return match
  })

  const rest: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) {
    if (!usedKeys.has(k) && v !== undefined) rest[k] = v
  }

  return { url, rest }
}
