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
  CatalogBindingDescriptor,
  CatalogCanonicalComponent,
  ComponentCatalog,
  ComponentEntry,
  ComponentRegistry,
  EmitEntry,
  PropEntry,
  PropSchema,
  RootFieldEntry,
} from './types'

// ══════════════════════════════════════════════════════════════
// 辅助：从 type/filePath 推断 category（raw VCM 无 category 时使用）
// ══════════════════════════════════════════════════════════════

const CONTAINER_TYPES = /^r-(table|form|detail|tree|list)$/

function inferCategory(entry: ComponentEntry): NonNullable<ComponentEntry['category']> {
  if (entry.category !== undefined) return entry.category
  const t = entry.type
  if (CONTAINER_TYPES.test(t)) return 'container'
  const fp = entry.filePath ?? ''
  if (fp.includes('/containers/')) return 'container'
  if (fp.includes('/fields/') || t.startsWith('r-')) return 'field'
  return 'feature'
}

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
  capabilities: {
    dataBinding: string[]
    eventDriven: string[]
    optionDriven: string[]
    containers: string[]
    fields: string[]
  }
  configurationPrinciples: string[]
}

/**
 * 投影：目录摘要（供 session.describe）。
 *
 * 从完整目录提取 type + category + description 列表，
 * 让 LLM 知道有哪些组件可用。
 */
export function projectFcDirectory(catalog: ComponentCatalog): FcDirectoryPayload {
  const entries = Object.entries(catalog.components)
  const featureCount = entries.filter(([, e]) => inferCategory(e) === 'feature').length
  const registry = catalog.registry
  if (registry === undefined) {
    throw new Error('component-catalog registry 缺失：请使用规范化 catalog 输入')
  }

  const dataBinding = entries
    .filter(([type, e]) => {
      const binding = resolveBindingDescriptor(catalog, type, e)
      return binding?.dataContainer === true || binding?.fieldProvider === true || binding?.selfResolving === true
    })
    .map(([type]) => type)
    .sort((a, b) => a.localeCompare(b))

  const eventDriven = entries
    .filter(([type, e]) => hasAnyEmit(catalog, type, e))
    .map(([type]) => type)
    .sort((a, b) => a.localeCompare(b))

  const optionDriven = entries
    .filter(([type, e]) => resolveBindingDescriptor(catalog, type, e)?.hasOptions === true)
    .map(([type]) => type)
    .sort((a, b) => a.localeCompare(b))

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
      category: inferCategory(e),
      description: e.description ?? '',
    })),
    capabilities: {
      dataBinding,
      eventDriven,
      optionDriven,
      containers: [...registry.containers].sort((a, b) => a.localeCompare(b)),
      fields: [...registry.fields].sort((a, b) => a.localeCompare(b)),
    },
    configurationPrinciples: [
      '先按 registry 选择组件类型，再按单组件配置指南填写 props。',
      'dataKey 与 binding 必须按 catalog 声明使用，不允许猜测字段。',
      '事件能力以 emits 为准；无 emits 的组件不得编造 on.* 绑定。',
      'required props 必填，default 仅作默认值提示，业务值需显式传入。',
    ],
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

export interface FcComponentConfigGuide {
  type: string
  category: string
  requiredProps: Array<{ name: string; type: string; default?: string; description?: string }>
  optionalProps: Array<{ name: string; type: string; default?: string; description?: string }>
  eventGuide: Array<{ name: string; payload?: Array<{ name: string; type: string }>; description?: string }>
  bindingGuide?: {
    selfResolving?: boolean
    dataContainer?: boolean
    fieldProvider?: boolean
    hasOptions?: boolean
    valueType?: string
  }
  rootFieldGuide?: RootFieldEntry[]
  rootFieldPaths?: string[]
  minimalConfig: {
    type: string
    props: Record<string, unknown>
    children?: unknown[]
  }
  failFastChecks: string[]
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

  const canonicalEntry = catalog.canonical?.components?.[type]
  const resolvedBinding = resolveBindingDescriptor(catalog, type, entry, canonicalEntry)

  const canonicalProps = resolveCanonicalProps(catalog, type, canonicalEntry)
  const canonicalEmits = resolveCanonicalEmits(catalog, type, canonicalEntry)

  const mergedPropsRaw = mergePropsByName(canonicalProps, entry.props)
  const mergedEmitsRaw = mergeEmitsByName(canonicalEmits, entry.emits ?? [])

  const props: HydratedPropEntry[] = mergedPropsRaw.map((prop) => {
    const schema = resolvePropSchema(catalog, prop)
    return {
      ...prop,
      ...(schema !== undefined ? { schema } : {}),
    }
  })

  const emits: HydratedEmitEntry[] = mergedEmitsRaw.map((emit) => {
    const schema = resolveEmitSchemas(catalog, emit)
    return {
      ...emit,
      ...(schema !== undefined ? { schema } : {}),
    }
  })

  return {
    ...entry,
    ...(canonicalEntry?.description !== undefined ? { description: canonicalEntry.description } : {}),
    ...(canonicalEntry?.filePath !== undefined ? { filePath: canonicalEntry.filePath } : {}),
    ...(canonicalEntry?.category !== undefined ? { category: canonicalEntry.category } : {}),
    ...(resolvedBinding !== undefined
      ? { binding: resolvedBinding }
      : {}),
    props,
    emits,
  }
}

function resolveCanonicalProps(
  catalog: ComponentCatalog,
  type: string,
  canonicalEntry: CatalogCanonicalComponent | undefined,
): PropEntry[] {
  if (canonicalEntry === undefined) return []
  const dict = catalog.canonical?.dictionaries.props
  if (dict === undefined) {
    throw new Error(`component-catalog canonical.props 缺失: ${type}`)
  }

  return canonicalEntry.propRefs.map((ref) => {
    const prop = dict[ref]
    if (prop === undefined) {
      throw new Error(`component-catalog canonical propRef 未解析: ${type}.${ref}`)
    }
    return prop
  })
}

function resolveCanonicalEmits(
  catalog: ComponentCatalog,
  type: string,
  canonicalEntry: CatalogCanonicalComponent | undefined,
): EmitEntry[] {
  if (canonicalEntry === undefined) return []
  const dict = catalog.canonical?.dictionaries.emits
  if (dict === undefined) {
    throw new Error(`component-catalog canonical.emits 缺失: ${type}`)
  }

  return canonicalEntry.emitRefs.map((ref) => {
    const emit = dict[ref]
    if (emit === undefined) {
      throw new Error(`component-catalog canonical emitRef 未解析: ${type}.${ref}`)
    }
    return emit
  })
}

function mergePropsByName(base: PropEntry[], incoming: PropEntry[]): PropEntry[] {
  const merged = new Map<string, PropEntry>()
  for (const prop of base) merged.set(prop.name, prop)
  for (const prop of incoming) merged.set(prop.name, { ...merged.get(prop.name), ...prop })
  return [...merged.values()]
}

function mergeEmitsByName(base: EmitEntry[], incoming: EmitEntry[]): EmitEntry[] {
  const merged = new Map<string, EmitEntry>()
  for (const emit of base) merged.set(emit.name, emit)
  for (const emit of incoming) merged.set(emit.name, { ...merged.get(emit.name), ...emit })
  return [...merged.values()]
}

function resolveBindingDescriptor(
  catalog: ComponentCatalog,
  type: string,
  entry: ComponentEntry,
  canonicalEntry?: CatalogCanonicalComponent,
): CatalogBindingDescriptor | undefined {
  return entry.binding ?? canonicalEntry?.binding ?? catalog.bindingDescriptors?.[type]
}

function hasAnyEmit(catalog: ComponentCatalog, type: string, entry: ComponentEntry): boolean {
  if ((entry.emits ?? []).length > 0) return true
  const canonicalEntry = catalog.canonical?.components?.[type]
  return (canonicalEntry?.emitRefs.length ?? 0) > 0
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
    category: inferCategory(entry),
    description: entry.description ?? '',
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

function inferExampleValue(type: string, required: boolean): unknown {
  const t = type.toLowerCase()
  if (t.includes('boolean')) return false
  if (t.includes('number') || t.includes('int') || t.includes('float')) return 0
  if (t.includes('array') || t.includes('[]')) return []
  if (t.includes('record<') || t.includes('object') || t.includes('{')) return {}
  if (required) return '<required>'
  return ''
}

export function projectFcConfigGuide(catalog: ComponentCatalog, type: string): FcComponentConfigGuide | null {
  const entry = projectHydratedComponent(catalog, type)
  if (entry === null) return null

  const requiredProps = entry.props
    .filter((prop) => prop.required)
    .map((prop) => ({
      name: prop.name,
      type: prop.type,
      ...(prop.default !== undefined ? { default: prop.default } : {}),
      ...(prop.description !== undefined ? { description: prop.description } : {}),
    }))

  const optionalProps = entry.props
    .filter((prop) => !prop.required)
    .map((prop) => ({
      name: prop.name,
      type: prop.type,
      ...(prop.default !== undefined ? { default: prop.default } : {}),
      ...(prop.description !== undefined ? { description: prop.description } : {}),
    }))

  const eventGuide = entry.emits.map((emit) => ({
    name: emit.name,
    ...(emit.payload !== undefined ? { payload: emit.payload } : {}),
    ...(emit.description !== undefined ? { description: emit.description } : {}),
  }))

  const minimalProps = Object.fromEntries(
    entry.props
      .filter((prop) => prop.required)
      .map((prop) => [prop.name, inferExampleValue(prop.type, true)]),
  )

  const category = inferCategory(entry)
  const rootFieldPaths = flattenRootFieldPaths(entry.rootFields ?? [])
  const minimalConfig = {
    type: entry.type,
    props: minimalProps,
    ...(category === 'container' ? { children: [] } : {}),
  }

  const failFastChecks = [
    `组件 type 必须精确匹配: ${entry.type}`,
    ...requiredProps.map((prop) => `必填 props 未传: ${prop.name}`),
    ...rootFieldPaths.map((path) => `rootFields 路径应可解析: ${path}`),
    ...(eventGuide.length > 0
      ? ['事件绑定仅允许使用 emits 列表中的事件名，不允许拼写猜测。']
      : ['该组件无 emits 事件声明，不应绑定 on.* 事件。']),
  ]

  return {
    type: entry.type,
    category,
    requiredProps,
    optionalProps,
    eventGuide,
    ...(entry.binding !== undefined
      ? {
        bindingGuide: {
          ...(entry.binding.selfResolving !== undefined ? { selfResolving: entry.binding.selfResolving } : {}),
          ...(entry.binding.dataContainer !== undefined ? { dataContainer: entry.binding.dataContainer } : {}),
          ...(entry.binding.fieldProvider !== undefined ? { fieldProvider: entry.binding.fieldProvider } : {}),
          ...(entry.binding.hasOptions !== undefined ? { hasOptions: entry.binding.hasOptions } : {}),
          ...(entry.binding.valueType !== undefined ? { valueType: entry.binding.valueType } : {}),
        },
      }
      : {}),
    ...(entry.rootFields !== undefined && entry.rootFields.length > 0 ? { rootFieldGuide: entry.rootFields } : {}),
    ...(rootFieldPaths.length > 0 ? { rootFieldPaths } : {}),
    minimalConfig,
    failFastChecks,
  }
}

function flattenRootFieldPaths(fields: RootFieldEntry[], prefix = ''): string[] {
  const paths: string[] = []
  for (const field of fields) {
    const current = prefix.length > 0 ? `${prefix}.${field.name}` : field.name
    paths.push(current)
    if (field.children !== undefined && field.children.length > 0) {
      paths.push(...flattenRootFieldPaths(field.children, current))
    }
  }
  return paths
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
  for (const type of Object.keys(catalog.components)) {
    const hydrated = projectHydratedComponent(catalog, type)
    if (hydrated === null) continue
    result[type] = hydrated.props
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
  for (const type of Object.keys(catalog.components)) {
    const hydrated = projectHydratedComponent(catalog, type)
    if (hydrated === null) continue
    const enumsForType: Record<string, string[]> = {}
    for (const prop of hydrated.props) {
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
  emit: EmitEntry,
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
  for (const type of Object.keys(catalog.components)) {
    const hydrated = projectHydratedComponent(catalog, type)
    if (hydrated === null) continue
    const label = extractShortLabel(hydrated.description ?? '')
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
  for (const type of Object.keys(catalog.components)) {
    const hydrated = projectHydratedComponent(catalog, type)
    if (hydrated === null) continue
    const required: Record<string, unknown> = {}
    for (const prop of hydrated.props) {
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
