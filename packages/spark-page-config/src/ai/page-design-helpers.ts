/**
 * PageDesign modules 共享 helper。
 *
 * 多个 catalog AiModule 子类的公共工具函数。
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
