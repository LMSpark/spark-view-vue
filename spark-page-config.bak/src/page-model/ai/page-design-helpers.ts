/**
 * PageDesign 子模块共享工具。
 *
 * ## 职责
 * - `createCurrentPageRef` — 从 AiModulePathContext 提取当前 pageId，构造 AiModuleInstanceRef
 * - `findCurrentPageInstance` — 按 childKind 过滤并返回当前页面实例引用
 *
 * ## 消费方
 * 所有 5 个子模块的 AiModule 子类都依赖这两个函数来发现"当前页面实例"，
 * 保证 LLM 操作始终作用于用户选中的目标页面，而不是跨页面操作。
 *
 * ## 设计要点
 * - pageId 来源优先级：ctx.host.moduleInstanceId → ctx.segment.id → ''
 * - findCurrentPageInstance 只在 childKind === ownKind 时返回实例，
 *   避免 lifecycle 模块错误响应 node-tree 的 find 请求。
 */

import type {
  AiModuleInstanceRef,
  AiModuleInstanceQuery,
  AiModulePathContext,
} from '@spark-view/spark-ai/modules'
import { AiModuleResult } from '@spark-view/spark-ai/modules'

export type FindCurrentPageInstanceOptions = {
  readonly ctx: AiModulePathContext
  readonly childKind: string
  readonly query: AiModuleInstanceQuery
  readonly ownKind: string
  readonly label: string
}

export function createCurrentPageRef(
  ctx: AiModulePathContext,
  label: string,
): AiModuleInstanceRef | null {
  const pageId = currentPageId(ctx)
  if (pageId.length === 0) return null
  return { id: pageId, label, summary: '当前 PageDesign 业务实例' }
}

export function findCurrentPageInstance(
  options: FindCurrentPageInstanceOptions,
): AiModuleResult<readonly AiModuleInstanceRef[]> {
  const { ctx, childKind, query, ownKind, label } = options
  if (childKind !== ownKind) return AiModuleResult.ok([])
  const ref = createCurrentPageRef(ctx, label)
  if (ref === null) return AiModuleResult.ok([])
  const id = query['id']
  if (typeof id === 'string' && id.length > 0 && id !== ref.id) {
    return AiModuleResult.ok([])
  }
  return AiModuleResult.ok([ref])
}

function currentPageId(ctx: AiModulePathContext): string {
  return ctx.host?.moduleInstanceId ?? ctx.segment?.id ?? ''
}
