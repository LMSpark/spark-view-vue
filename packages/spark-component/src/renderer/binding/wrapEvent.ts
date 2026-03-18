/**
 * 事件装饰器工具
 *
 * 为 BindRule 的事件处理器提供统一的「保留原始 + 追加新逻辑」封装。
 * 被 bind-table-delegate / bind-pagination-delegate / bind-form-delegate 公用。
 */

import type { BindRule } from '../types'

/**
 * 为 BindRule 追加事件处理器，保留原始 handler（原始先执行）
 *
 * @param rule      规则节点
 * @param eventName 事件名称（如 'currentChange'、'sizeChange'）
 * @param handler   追加的处理器；原始 handler（如果存在）先于本 handler 执行
 *
 * @example
 * ```typescript
 * wrapEvent(rule, 'currentChange', (page: number) => {
 *   void view.setPage(page)
 * })
 * ```
 */
export function wrapEvent(
  rule: BindRule,
  eventName: string,
  handler: (...args: unknown[]) => void
): void {
  rule.on ??= {}
  const original = rule.on[eventName]
  rule.on[eventName] = (...args: unknown[]) => {
    if (typeof original === 'function') {
      (original as (...a: unknown[]) => void)(...args)
    } else if (Array.isArray(original)) {
      for (const fn of original) {
        if (typeof fn === 'function') (fn as (...a: unknown[]) => void)(...args)
      }
    }
    handler(...args)
  }
}
