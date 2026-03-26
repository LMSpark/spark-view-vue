/**
 * 事件归一化工具
 *
 * 从 SparkNode 输入中提取/转换事件处理器与 Props 回调。
 * 当前仅被 SparkPageRenderer 生产渲染路径复用。
 *
 * 职责分区：
 * 1) 事件归一化（normalizeRuleEvents / normalizeOnProps）
 */

import { isActionDescriptor, executeActionDescriptor } from '../actions'
import type { ActionExecutionContext } from '../actions'

/** 沙箱函数调用签名 */
type CallFunc = (functionName: string, ...args: unknown[]) => unknown

// ── 分区 A：事件归一化 ─────────────────────────────────────────────────────

/**
 * 将事件记录中的 handler 归一化为可执行闭包
 *
 * 支持四种 handler 形式：
 * - string → callFunc 闭包（脚本函数名）
 * - { action: "..." } → executeActionDescriptor 闭包（声明式动作）
 * - Array<string | ActionDescriptor | Function> → 逐项包装
 * - Function → 透传
 *
 * @param actionCtx 可选 — 传入时启用 action descriptor 支持（SparkPageRenderer 提供）
 */
function normalizeRuleEvents(
  on: Record<string, unknown>,
  callFunc: CallFunc,
  actionCtx?: ActionExecutionContext,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [eventName, handler] of Object.entries(on)) {
    if (typeof handler === 'string') {
      result[eventName] = (...args: unknown[]) => callFunc(handler, ...args)
    } else if (actionCtx && isActionDescriptor(handler)) {
      const descriptor = handler
      const ctx = actionCtx
      result[eventName] = (...args: unknown[]) => {
        void executeActionDescriptor(descriptor, ctx, args)
      }
    } else if (Array.isArray(handler)) {
      const items = handler as unknown[]
      result[eventName] = items.map((item: unknown) => {
        if (typeof item === 'string') {
          return (...args: unknown[]) => callFunc(item, ...args)
        }
        if (actionCtx && isActionDescriptor(item)) {
          const descriptor = item
          const ctx = actionCtx
          return (...args: unknown[]) => {
            void executeActionDescriptor(descriptor, ctx, args)
          }
        }
        return item
      })
    } else {
      result[eventName] = handler
    }
  }
  return result
}

/**
 * 将 props 中 on* 开头的值包装为闭包（就地修改）
 *
 * 支持两种值形式：
 * - string → callFunc 闭包（脚本函数名）
 * - { action: "..." } → executeActionDescriptor 闭包（声明式动作）
 *
 * 适用于自定义组件（如 r-tree）通过 props 传递事件回调的场景。
 *
 * @param actionCtx 可选 — 传入时启用 action descriptor 支持
 */
function normalizeOnProps(
  props: Record<string, unknown>,
  callFunc: CallFunc,
  actionCtx?: ActionExecutionContext,
): void {
  for (const [key, value] of Object.entries(props)) {
    if (!key.startsWith('on')) continue
    if (typeof value === 'string') {
      props[key] = (...args: unknown[]) => callFunc(value, ...args)
    } else if (actionCtx && isActionDescriptor(value)) {
      const descriptor = value
      const ctx = actionCtx
      props[key] = (...args: unknown[]) => {
        void executeActionDescriptor(descriptor, ctx, args)
      }
    }
  }
}

export {
  normalizeRuleEvents,
  normalizeOnProps,
}
