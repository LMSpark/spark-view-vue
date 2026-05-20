import { computed, getCurrentInstance } from 'vue'
import type { CapabilityContext } from '../../internal'
import { type SparkRuntimeOwner, sparkResolveParentContext } from '../../../core/capability-context.js'

export type FieldRenderMode = string

/**
 * 字段渲染模式 — 与容器 type 名解耦的语义标签。
 *
 * 约定值：'table' | 'form' | 'tree' | 'detail'。
 * 字段根据最近宿主 type 推导渲染模式，不再依赖独立 fieldMode 能力键。
 */
function inferModeFromHostType(hostType: string | null): FieldRenderMode | null {
  if (hostType === null) return null
  if (hostType === 'r-field-scope' || hostType.endsWith('-field-scope')) return null
  if (hostType === 'r-filter' || hostType.includes('filter-panel')) return 'form'
  if (hostType.includes('table')) return 'table'
  if (hostType.includes('tree')) return 'tree'
  if (hostType.includes('form')) return 'form'
  if (hostType.includes('detail')) return 'detail'
  return null
}

function resolveModeFromContextChain(start: CapabilityContext | null): FieldRenderMode {
  let current = start
  while (current !== null) {
    const mode = inferModeFromHostType(typeof current.type === 'string' ? current.type : null)
    if (mode !== null) return mode
    current = current.parent ?? null
  }
  return 'detail'
}

function isSparkRuntimeOwner(value: unknown): value is SparkRuntimeOwner {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
}

export function useResolvedFieldContext() {
  const instance = getCurrentInstance()
  const currentOwner = isSparkRuntimeOwner(instance) ? instance : null
  return computed<FieldRenderMode>(() => {
    const parentContext = sparkResolveParentContext(currentOwner)
    return resolveModeFromContextChain(parentContext)
  })
}
