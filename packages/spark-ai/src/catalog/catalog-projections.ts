/**
 * 组件目录投影函数
 *
 * 从 component-catalog.json 按消费角色提取所需子集。
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
  ComponentRegistry,
  PropEntry,
  PropSchema,
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
  registry: ComponentRegistry
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

  // 兼容旧格式 metadata.json（无 registry 字段）：从 components 按 category 动态生成
  const registry: NonNullable<ComponentCatalog['registry']> = catalog.registry ?? {
    containers: entries.filter(([, e]) => e.category === 'container').map(([t]) => t),
    fields: entries.filter(([, e]) => e.category === 'field').map(([t]) => t),
    groups: entries.filter(([, e]) => e.category === 'group').map(([t]) => t),
    meta: entries.filter(([, e]) => e.category === 'meta').map(([t]) => t),
  }

  return {
    hint: 'session.describe 可直接返回该目录摘要；如需查看单组件属性规格，请按组件 type 查询 stills.actionSpec。',
    summary: {
      total: catalog.componentCount,
      containers: registry.containers.length,
      fields: registry.fields.length,
      groups: registry.groups.length,
      meta: registry.meta.length,
      features: featureCount,
    },
    registry,
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

export interface HydratedPropEntry extends PropEntry {
  schema?: PropSchema
}

export interface HydratedEmitEntry {
  name: string
  type?: string
  description?: string
  schema?: PropSchema[]
  payload?: Array<{ name: string; type: string }>
}

export interface HydratedComponentEntry extends Omit<ComponentEntry, 'props' | 'emits'> {
  props: HydratedPropEntry[]
  emits: HydratedEmitEntry[]
}

/**
 * 投影：按组件回填 schema（schemaRef/schemaRefs -> schemaPool）。
 *
 * 用于消费层在需要时拼接完整 schema；不会改变原始 catalog 对象。
 */
export function projectHydratedComponent(catalog: ComponentCatalog, type: string): HydratedComponentEntry | null {
  const entry = catalog.components[type]
  if (entry === undefined) return null

  const props: HydratedPropEntry[] = entry.props.map((prop) => {
    const schema = resolvePropSchema(catalog, prop)
    return {
      ...prop,
      ...(schema !== undefined ? { schema } : {}),
    }
  })

  const emits: HydratedEmitEntry[] = entry.emits.map((emit) => {
    const schema = resolveEmitSchemas(catalog, emit)
    return {
      ...emit,
      ...(schema !== undefined ? { schema } : {}),
    }
  })

  return {
    ...entry,
    props,
    emits,
  }
}

/**
 * 投影：单组件规格（供 stills.actionSpec）。
 *
 * 精简 props（去除 schema），保留 AI 生成配置需要的字段。
 * 返回 null 表示组件不在目录中。
 */
export function projectFcSpec(catalog: ComponentCatalog, type: string): FcComponentSpec | null {
  const entry = projectHydratedComponent(catalog, type)
  if (entry === null) return null

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
  const reg = catalog.registry
  const allTypes = new Set<string>([
    ...(reg?.containers ?? []),
    ...(reg?.fields ?? []),
    ...(reg?.groups ?? []),
    ...(reg?.meta ?? []),
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
      const schema = resolvePropSchema(catalog, prop)
      const parsedFromType = parseEnumFromTypeString(prop.type)
      const parsedFromSchema = parseEnumFromSchema(schema)
      const parsed = parsedFromType.length > 0 ? parsedFromType : parsedFromSchema
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

function parseEnumFromSchema(schema: PropSchema | undefined): string[] {
  if (schema?.kind !== 'enum') return []
  return schema.variants.filter((variant) => variant.length > 0)
}

function resolvePropSchema(catalog: ComponentCatalog, prop: PropEntry): PropSchema | undefined {
  if (prop.schema !== undefined) return prop.schema
  if (prop.schemaRef === undefined) return undefined
  return catalog.schemaPool?.[prop.schemaRef]
}

function resolveEmitSchemas(
  catalog: ComponentCatalog,
  emit: ComponentEntry['emits'][number],
): PropSchema[] | undefined {
  if (emit.schema !== undefined && emit.schema.length > 0) return emit.schema
  if (emit.schemaRefs === undefined || emit.schemaRefs.length === 0) return undefined

  const schemas = emit.schemaRefs
    .map((ref) => catalog.schemaPool?.[ref])
    .filter(isNotUndefined)

  return schemas.length > 0 ? schemas : undefined
}

function isNotUndefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

// ══════════════════════════════════════════════════════════════
// DevSystem 投影：类型中文标签 + 必填属性
// ══════════════════════════════════════════════════════════════

/**
 * 从组件描述中提取简短中文标签。
 *
 * 规则：取首段连续中文字符，去掉尾部"容器/组件/字段/节点/页面"。
 * 例："数据表格容器，基于…" → "数据表格"
 */
function extractShortLabel(description: string): string {
  const match = /^([\u4e00-\u9fff]+)/.exec(description)
  if (!match?.[1]) return ''
  const label = match[1].replace(/(?:容器|组件|字段|节点|页面)$/, '')
  return label.length >= 2 ? label : ''
}

/**
 * 投影：组件类型 → 中文标签映射。
 *
 * 格式为 `[中文] type`，供 DevSystem 下拉框 label 使用。
 * 无法提取中文标签的组件仅保留 type 本身。
 */
export function projectDevTypeLabels(
  catalog: ComponentCatalog,
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [type, entry] of Object.entries(catalog.components)) {
    const label = extractShortLabel(entry.description)
    result[type] = label.length > 0 ? `[${label}] ${type}` : type
  }
  return result
}

/**
 * 投影：各组件的必填属性及其默认值。
 *
 * 返回 `Record<type, Record<propName, defaultValue>>`，
 * 选中 type 时一次性填入。
 */
export function projectDevRequiredProps(
  catalog: ComponentCatalog,
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {}
  for (const [type, entry] of Object.entries(catalog.components)) {
    const required: Record<string, unknown> = {}
    for (const prop of entry.props) {
      if (!prop.required || STRUCT_KEYS.has(prop.name)) continue
      required[prop.name] = inferDefaultFromPropType(prop.type, prop.default)
    }
    if (Object.keys(required).length > 0) {
      result[type] = required
    }
  }
  return result
}

/**
 * 从 prop 类型字符串推断一个合理的默认值。
 */
function inferDefaultFromPropType(typeStr: string, declaredDefault?: string): unknown {
  if (declaredDefault !== undefined) {
    // 尝试 JSON 解析声明的默认值
    try { return JSON.parse(declaredDefault) as unknown } catch { /* fall through */ }
    return declaredDefault
  }
  if (typeStr.includes('number')) return 0
  if (typeStr.includes('boolean')) return false
  if (typeStr.includes('[]') || typeStr.includes('Array')) return []
  return ''
}
