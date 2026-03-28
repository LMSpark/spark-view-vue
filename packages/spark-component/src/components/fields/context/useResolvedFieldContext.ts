import { computed } from 'vue'
import type { SparkCapabilityContext } from '../../internal'
import { useSparkConsume } from '../../internal'

type FieldHostType = 'r-table' | 'r-form' | 'r-detail' | 'r-tree' | 'r-list'

/**
 * 字段宿主解析规则：
 * 1. 只认真正承载字段语义的宿主容器 type。
 * 2. 中间组件保持自己的真实 type，不去伪装成宿主。
 * 3. 字段侧通过统一映射处理已知字段作用域组件；未知中间层一律透明跳过。
 */
const FIELD_HOST_TYPES = new Set<FieldHostType>(['r-table', 'r-form', 'r-detail', 'r-tree', 'r-list'])

const FIELD_HOST_ALIASES: Readonly<Record<string, FieldHostType>> = {
  'r-field-scope': 'r-form',
  'r-list-item': 'r-list',
}

function normalizeFieldHostType(type: string | null): FieldHostType | null {
  if (type === null) return null
  if (FIELD_HOST_TYPES.has(type as FieldHostType)) return type as FieldHostType
  return FIELD_HOST_ALIASES[type] ?? null
}

function resolveFieldHostType(parentType: string | null, parentContext: SparkCapabilityContext | null): FieldHostType {
  let currentType: string | null = parentType
  let currentContext = parentContext?.parent ?? null

  while (currentType !== null) {
    const normalizedType = normalizeFieldHostType(currentType)
    if (normalizedType !== null) return normalizedType

    const nextType = typeof currentContext?.type === 'string' ? currentContext.type : null
    currentType = nextType
    currentContext = currentContext?.parent ?? null
  }

  return 'r-detail'
}

export function useResolvedFieldContext() {
  const { parentContext, parentType } = useSparkConsume()

  return computed(() => resolveFieldHostType(parentType, parentContext))
}