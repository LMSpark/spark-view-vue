/**
 * 组件目录投影函数
 *
 * 从 component-catalog.json（SSoT）按消费角色提取所需子集。
 * 所有投影均为纯函数，零副作用。
 *
 * 消费角色：
 * - FC（session.describe / stills.actionSpec）：目录摘要 + 单组件规格
 * - DevSystem（rule.json 编辑器）：类型枚举 + 属性名 + 属性枚举值
 * - Java Agent（预留）：后端按需投影同一 JSON
 *
 * @module catalog-projections
 */

import type {
  ComponentCatalog,
  ComponentEntry,
  PropEntry,
} from './types'

// ══════════════════════════════════════════════════════════════
// FC 投影：session.describe + stills.actionSpec
// ══════════════════════════════════════════════════════════════

/** session.describe 返回的目录摘要 */
export interface FcDirectoryPayload {
  hint: string
  summary: {
    total: number
    containers: number
    fields: number
    groups: number
    meta: number
    features: number
  }
  registry: ComponentCatalog['registry']
  components: Array<{ type: string; category: string; description: string }>
}

/**
 * 投影：目录摘要（供 session.describe）。
 *
 * 从完整目录提取 type + category + description 列表，
 * 让 LLM 知道有哪些组件可用。
 */
export function projectFcDirectory(catalog: ComponentCatalog): FcDirectoryPayload {
  const entries = Object.entries(catalog.components)
  const featureCount = entries.filter(([, e]) => e.category === 'feature').length

  return {
    hint: 'session.describe 可直接返回该目录摘要；如需查看单组件属性规格，请按组件 type 查询 stills.actionSpec。',
    summary: {
      total: catalog.componentCount,
      containers: catalog.registry.containers.length,
      fields: catalog.registry.fields.length,
      groups: catalog.registry.groups.length,
      meta: catalog.registry.meta.length,
      features: featureCount,
    },
    registry: catalog.registry,
    components: entries.map(([type, e]) => ({
      type,
      category: e.category,
      description: e.description,
    })),
  }
}

/** stills.actionSpec 返回的单组件规格 */
export interface FcComponentSpec {
  type: string
  category: ComponentEntry['category']
  description: string
  props: Array<Pick<PropEntry, 'name' | 'type' | 'required'> & { default?: string; description?: string }>
  emits: Array<{ name: string; type?: string; description?: string }>
  rootFields?: ComponentEntry['rootFields']
  binding?: ComponentEntry['binding']
  notes?: string
}

/**
 * 投影：单组件规格（供 stills.actionSpec）。
 *
 * 精简 props（去除 schema），保留 AI 生成配置需要的字段。
 * 返回 null 表示组件不在目录中。
 */
export function projectFcSpec(catalog: ComponentCatalog, type: string): FcComponentSpec | null {
  const entry = catalog.components[type]
  if (entry === undefined) return null

  return {
    type: entry.type,
    category: entry.category,
    description: entry.description,
    props: entry.props.map(p => ({
      name: p.name,
      type: p.type,
      required: p.required,
      ...(p.default !== undefined ? { default: p.default } : {}),
      ...(p.description !== undefined ? { description: p.description } : {}),
    })),
    emits: entry.emits.map(e => ({
      name: e.name,
      ...(e.type !== undefined ? { type: e.type } : {}),
      ...(e.description !== undefined ? { description: e.description } : {}),
    })),
    ...(entry.rootFields !== undefined && entry.rootFields.length > 0 ? { rootFields: entry.rootFields } : {}),
    ...(entry.binding !== undefined ? { binding: entry.binding } : {}),
    ...(entry.notes !== undefined ? { notes: entry.notes } : {}),
  }
}

// ══════════════════════════════════════════════════════════════
// DevSystem 投影：rule.json 编辑器 Schema 支撑
// ══════════════════════════════════════════════════════════════

/**
 * 投影：全部组件类型列表（排序后，用于 type 字段下拉）。
 */
export function projectDevTypes(catalog: ComponentCatalog): string[] {
  const allTypes = new Set<string>([
    ...catalog.registry.containers,
    ...catalog.registry.fields,
    ...catalog.registry.groups,
    ...catalog.registry.meta,
  ])
  for (const type of Object.keys(catalog.components)) {
    allTypes.add(type)
  }
  return [...allTypes].sort()
}

const STRUCT_KEYS = new Set(['type', 'props', 'children', 'id'])

/**
 * 投影：各组件的可用属性名列表（不含结构键 type/props/children/id）。
 */
export function projectDevPropNames(catalog: ComponentCatalog): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const [type, entry] of Object.entries(catalog.components)) {
    result[type] = entry.props
      .filter(p => !STRUCT_KEYS.has(p.name))
      .map(p => p.name)
  }
  return result
}

/**
 * 投影：各组件各属性的枚举值选项（仅限有明确枚举值的属性）。
 */
export function projectDevPropEnums(catalog: ComponentCatalog): Record<string, Record<string, string[]>> {
  const result: Record<string, Record<string, string[]>> = {}
  for (const [type, entry] of Object.entries(catalog.components)) {
    const enumsForType: Record<string, string[]> = {}
    for (const prop of entry.props) {
      if (STRUCT_KEYS.has(prop.name)) continue
      const parsed = parseEnumFromTypeString(prop.type)
      if (parsed.length > 0) {
        enumsForType[prop.name] = parsed
      }
    }
    if (Object.keys(enumsForType).length > 0) {
      result[type] = enumsForType
    }
  }
  return result
}

/**
 * 从 prop type 字符串中解析枚举值。
 * 识别 `"val1" | "val2" | "val3"` 形式。
 */
function parseEnumFromTypeString(typeStr: string): string[] {
  const re = /"([^"]*)"/g
  const values: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(typeStr)) !== null) {
    const v = m[1]
    if (v !== undefined && v.length > 0) values.push(v)
  }
  return values.length >= 2 ? values : []
}
