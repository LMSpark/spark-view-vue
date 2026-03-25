import { computed } from 'vue'
import { useSparkComponent } from '../_pkg'
import type { ComponentContext, FieldContext } from '../_pkg'

function resolveFieldContextFromType(type: string | null | undefined): FieldContext | null {
  if (type === null || type === undefined) return null

  switch (type) {
    case 'r-table':
      return 'table'
    case 'r-form':
    case 'r-field-scope':
      return 'form'
    case 'r-detail':
      return 'detail'
    case 'r-tree':
      return 'tree'
    case 'r-list-item':
    case 'r-list':
      return 'list'
    default:
      return null
  }
}

function resolveFieldContextFromAncestors(parentContext: ComponentContext | null): FieldContext | null {
  let current: ComponentContext | null = parentContext
  while (current !== null) {
    const resolved = resolveFieldContextFromType(current.type)
    if (resolved !== null) return resolved
    current = current.parent ?? null
  }
  return null
}

export function useResolvedFieldContext() {
  const { parentContext } = useSparkComponent(undefined, { mode: 'consume-only' })

  return computed<FieldContext>(() => resolveFieldContextFromAncestors(parentContext) ?? 'detail')
}