/**
 * PageDesign module-semantic 共享 helper。
 *
 * 多个 catalog AiModule 子类的公共工具函数。
 */

import type {
  AiModuleInstanceRef,
  AiModulePathContext,
} from '@spark-view/spark-ai/modules'

export function createCurrentPageRef(
  ctx: AiModulePathContext,
  label: string,
): AiModuleInstanceRef | null {
  const pageId = currentPageId(ctx)
  if (pageId.length === 0) return null
  return { id: pageId, label, summary: '当前 PageDesign 业务实例' }
}

function currentPageId(ctx: AiModulePathContext): string {
  return ctx.host?.moduleInstanceId ?? ctx.segment?.id ?? ''
}
