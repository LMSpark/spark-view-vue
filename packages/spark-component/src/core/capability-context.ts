/**
 * Spark 运行时上下文锚点表。
 *
 * ICapabilityContext 自己形成结构树；
 * 运行时仅保留 owner 链与 pageRoot 锚点，
 * 不再通过 provide/inject 传递父上下文。
 *
 * 两种锚点的设计意图：
 * - OWNER_CONTEXTS：key 是 Vue 组件实例（object）。组件卸载时显式 delete，
 *   实例对象本身也随 Vue 的 GC 路径回收。
 * - PAGE_ROOT_CONTEXTS：key 是页面根 DOM 元素（HTMLElement）。
 *   WeakMap key = DOM 节点，节点从文档移除且无其它引用时 GC 自动回收。
 *   显式 unbind（onUnmounted）作为双保险，不依赖 GC 时机。
 */

import type { ICapabilityContext } from '@spark-view/spark-utils'

export interface SparkRuntimeOwner {
  parent?: SparkRuntimeOwner | null
  pageRoot?: unknown
}

const OWNER_CONTEXTS = new WeakMap<object, ICapabilityContext>()
/** key = 页面根 DOM 元素（HTMLElement），DOM 天然防泄漏 */
const PAGE_ROOT_CONTEXTS = new WeakMap<HTMLElement, ICapabilityContext>()

export function sparkBindContextOwner(owner: object, context: ICapabilityContext): void {
  OWNER_CONTEXTS.set(owner, context)
}

export function sparkUnbindContextOwner(owner: object): void {
  OWNER_CONTEXTS.delete(owner)
}

export function sparkResolveContextOwner(owner: object): ICapabilityContext | null {
  return OWNER_CONTEXTS.get(owner) ?? null
}

/** pageRoot 必须是页面根 DOM 元素（HTMLElement）。 */
export function sparkBindPageRootContext(pageRoot: HTMLElement, context: ICapabilityContext): void {
  PAGE_ROOT_CONTEXTS.set(pageRoot, context)
}

export function sparkUnbindPageRootContext(pageRoot: HTMLElement): void {
  PAGE_ROOT_CONTEXTS.delete(pageRoot)
}

export function sparkResolvePageRootContext(pageRoot: unknown): ICapabilityContext | null {
  if (!(pageRoot instanceof HTMLElement)) return null
  return PAGE_ROOT_CONTEXTS.get(pageRoot) ?? null
}

export function sparkResolveParentContext(
  owner: SparkRuntimeOwner | null,
  overrideHostContext?: ICapabilityContext,
): ICapabilityContext | null {
  if (overrideHostContext !== undefined) {
    return overrideHostContext
  }

  let currentOwner = owner?.parent ?? null
  while (currentOwner !== null) {
    const boundContext = OWNER_CONTEXTS.get(currentOwner as object)
    if (boundContext !== undefined) {
      return boundContext
    }
    currentOwner = currentOwner.parent ?? null
  }

  const pageRootContext = sparkResolvePageRootContext(owner?.pageRoot)
  if (pageRootContext !== null) {
    return pageRootContext
  }

  return null
}
