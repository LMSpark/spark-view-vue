/**
 * PageDesign module-semantic 共享 helper。
 *
 * 多个 catalog ModuleKind 子类的公共工具函数。
 */

import type { ModuleKind } from '@spark-view/spark-ai/module-semantic'

export function createCurrentPageRef(
  ctx: ModuleKind.PathContext,
  label: string,
): ModuleKind.InstanceRef | null {
  const pageId = currentPageId(ctx)
  if (pageId.length === 0) return null
  return { id: pageId, label, summary: '当前 PageDesign 业务实例' }
}

function currentPageId(ctx: ModuleKind.PathContext): string {
  return ctx.host?.moduleInstanceId ?? ctx.segment.id
}
