import { useSparkHost } from '../../internal'

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

export function useResolvedFieldContext() {
  const { hostType } = useSparkHost<FieldHostType>({
    hostTypes: Array.from(FIELD_HOST_TYPES),
    aliases: FIELD_HOST_ALIASES,
    fallbackType: 'r-detail',
  })

  return hostType
}

export function resolveFieldHostType(type: string | null): FieldHostType | null {
  return type === null ? null : normalizeFieldHostType(type)
}