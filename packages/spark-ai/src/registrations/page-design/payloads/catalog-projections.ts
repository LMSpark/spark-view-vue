/**
 * 组件目录投影层 (Catalog Projections)
 *
 * 核心目标：从单一事实源 component-catalog.json 中，根据不同的消费场景提取适当且聚焦的数据子集。
 * 设计保证：本文件中所有对外暴露及内部辅助函数均严格遵守纯函数 (Pure Function) 范式，无任何副作用。
 *
 * 消费时序（建议阅读顺序）：
 * 1. 投影契约定义：统一声明 FC / Function 的输出结构。
 * 2. 基础解析与水合：解析组件自包含 props/emits 与 schema/binding。
 * 3. FC 投影：生成目录摘要、单组件规格、配置指南、会话目录。
 *
 * 主要消费场景：
 * 1. AI Function Calling (FC) 场景——为 LLM 在分析页面上下文与组装 UI 时（queryPayloads /
 *    guidePayload）提供精简、无冗余的组件视图，最小化 Token 开销。
 *
 * 依赖关系：本文件仅依赖 ./types 与 component-catalog.json，不引入任何框架或运行时副作用。
 *
 * @module catalog-projections
 */

import type {
  CatalogBindingDescriptor,
  ComponentCatalog,
  ComponentEntry,
  ComponentRegistry,
  EmitEntry,
  PropEntry,
  PropSchema,
  RootFieldEntry,
  SchemaNodeEntry,
} from './types'
import type { FunctionCatalog, FunctionComponentEntry } from './function-catalog-types'

// =========================================================
// 一、投影契约定义（Exported Projection Types）
// =========================================================

/**
 * LLM 目录摘要负载——告知大模型当前应用环境可用的全部组件总览。
 *
 * 由 `projectComponentDirectory` 生成，适合作为 queryPayloads 的响应体直接返回。
 * 包含：组件总数统计、由 components.category 派生的分类列表、能力分组（数据绑定 / 事件驱动 / 选项驱动）
 * 以及面向 LLM 的配置使用原则。
 */
export interface ComponentDirectoryPayload {
  /** LLM 阅读提示：引导大模型在需要时进一步查询单组件规格 */
  hint: string
  /** 各分类组件数量统计摘要 */
  summary: {
    total: number
    containers: number
    fields: number
    groups: number
    meta: number
    features: number
  }
  /** 派生分类索引，按 category 列出全部组件 type */
  registry: ComponentRegistry
  /** 全量组件简述列表（type + category + description） */
  components: Array<{ type: string; category: string; description: string }>
  /** 按能力维度聚合的组件分组 */
  capabilities: {
    /** 具备数据绑定能力（selfResolving / dataContainer / fieldProvider）的组件列表 */
    dataBinding: string[]
    /** 声明了 emits 事件的组件列表 */
    eventDriven: string[]
    /** 需要外部提供选项数据（hasOptions）的组件列表 */
    optionDriven: string[]
    /** 容器类组件列表（与 registry.containers 一致） */
    containers: string[]
    /** 字段类组件列表（与 registry.fields 一致） */
    fields: string[]
  }
  /** 面向 LLM 的通用配置使用原则（如必填规则、数据绑定约束等） */
  configurationPrinciples: string[]
}

/**
 * 单组件能力核心规格——剔除复杂 Schema 引用后的精简形态，专为 AI 生成 UI 配置设计。
 *
 * 由 `projectComponentSpec` 生成，适合作为 guidePayload 的消费目标。
 * LLM 可依据此结构选择组件 type、填写 props、绑定事件。
 */
export interface ComponentSpec {
  /** 组件 type 值，如 'r-table' */
  type: string
  /** 组件分类：container / field / group / meta / feature */
  category: ComponentEntry['category']
  /** 组件功能的自然语言描述 */
  description: string
  /** 属性列表（必填、类型、默认值、描述） */
  props: Array<Pick<PropEntry, 'name' | 'type' | 'required'> & { default?: string; description?: string; examples?: unknown[] }>
  /** 事件列表（事件名、类型、描述） */
  emits: Array<{ name: string; type?: string; description?: string }>
  /** 根字段声明（仅数据容器类组件携带） */
  rootFields?: ComponentEntry['rootFields']
  /** 数据绑定能力描述符 */
  binding?: ComponentEntry['binding']
  /** 使用注意事项（来自 catalog 的 notes 字段） */
  notes?: string
}

/**
 * 单组件详尽配置指导书——面向 LLM 的防呆配置手册。
 *
 * 由 `projectComponentConfigGuide` 生成。除基本规格外，还内置：
 * - 必填 / 可选属性分组；
 * - 事件参数指南；
 * - 数据绑定能力摘要；
 * - 带占位值的最小安全配置示例；
 * - fail-fast 自检清单，防止 LLM 产生无效配置。
 */
export interface ComponentConfigGuide {
  /** 组件 type 值 */
  type: string
  /** 组件分类 */
  category: string
  /** 必填属性列表（含类型与描述） */
  requiredProps: Array<{ name: string; type: string; default?: string; description?: string; examples?: unknown[] }>
  /** 可选属性列表（含类型、默认值与描述） */
  optionalProps: Array<{ name: string; type: string; default?: string; description?: string; examples?: unknown[] }>
  /** 事件使用指南（事件名 + payload 参数签名 + 描述） */
  eventGuide: Array<{ name: string; payload?: Array<{ name: string; type: string }>; description?: string }>
  /** 数据绑定能力摘要（仅当组件声明了 binding 时存在） */
  bindingGuide?: {
    selfResolving?: boolean
    dataContainer?: boolean
    fieldProvider?: boolean
    hasOptions?: boolean
    valueType?: string
  }
  /** 根字段原始声明（含层级结构，仅数据容器组件） */
  rootFieldGuide?: RootFieldEntry[]
  /** 根字段扁平路径列表（如 "a", "a.b"，便于 LLM 快速校验） */
  rootFieldPaths?: string[]
  /**
   * 最小可用配置示例。
   * 必填属性均以占位值填写，容器类组件额外附带空 children 数组。
   */
  minimalConfig: {
    type: string
    props: Record<string, unknown>
    children?: unknown[]
  }
  /**
   * Fail-fast 自检清单。
   * LLM 在提交配置前应逐条对照，验证生成的 SparkNode 是否满足约束。
   */
  failFastChecks: string[]
  /** 由 props.componentRef 推导出的子组件说明（用于补齐容器组合链路） */
  subComponentGuides?: Array<{
    type: string
    fromProps: string[]
    resolved: boolean
    category?: string
    description?: string
    requiredProps?: string[]
    optionalPropsPreview?: string[]
    fix?: string
  }>
}

/**
 * 收集组件中通过 `componentRef` 声明的子组件引用。
 *
 * 规则：
 * - 仅识别 `prop.componentRef`；
 * - 相同子组件 type 合并为一条记录，并聚合来源 prop 名；
 * - 来源 prop 名按字母序输出，确保结果稳定。
 */
function collectSubComponentRefs(entry: HydratedComponentEntry): Array<{ type: string; fromProps: string[] }> {
  const refs = new Map<string, Set<string>>()
  for (const prop of entry.props) {
    // 仅允许使用 componentRef 作为子组件引用来源。
    const refType = prop.componentRef
    if (typeof refType !== 'string') continue
    const normalized = refType.trim()
    if (normalized.length === 0) continue
    if (!refs.has(normalized)) refs.set(normalized, new Set<string>())
    refs.get(normalized)?.add(prop.name)
  }

  return [...refs.entries()].map(([type, fromProps]) => ({
    type,
    fromProps: [...fromProps].sort((a, b) => a.localeCompare(b)),
  }))
}

/**
 * 根据子组件引用构建可读的子组件指导信息。
 *
 * 解析优先级：
 * 1. 从父 prop 展开的对象 schema 中推导结构（inline-structure）；
 * 2. 回退到独立组件目录条目（projectComponentSpec）；
 * 3. 均失败时返回 unresolved，并给出修复建议。
 */
function buildSubComponentGuides(catalog: ComponentCatalog, entry: HydratedComponentEntry): Array<{
  type: string
  fromProps: string[]
  resolved: boolean
  category?: string
  description?: string
  requiredProps?: string[]
  optionalPropsPreview?: string[]
  fix?: string
}> {
  const refs = collectSubComponentRefs(entry)
  return refs.map((ref) => {
    // 首选：从父 prop 类型反推出的结构节点 schema（ActionsNode/ToolbarNode/FilterNode …）。
    // 这正是 AI 在 rule.json 中要写入的 JSON 形状，优先级最高。
    const inlineSchema = resolveInlineStructureSchema(catalog, entry, ref.fromProps)
    if (inlineSchema !== undefined) {
      const propertyNames = Object.keys(inlineSchema.properties ?? {})
      const requiredNames = new Set(inlineSchema.required ?? [])
      return {
        type: ref.type,
        fromProps: ref.fromProps,
        resolved: true,
        category: 'inline-structure',
        description: `结构由 props 类型反推：${inlineSchema.title ?? 'object'}（直接按字段配置即可）`,
        requiredProps: propertyNames.filter((name) => requiredNames.has(name)),
        optionalPropsPreview: propertyNames.filter((name) => !requiredNames.has(name)).slice(0, 12),
      }
    }

    // 兜底：无内联结构时，回落到独立 catalog 条目（例如缺少 XxxNode 类型声明时）。
    const subSpec = projectComponentSpec(catalog, ref.type)
    if (subSpec !== null) {
      return {
        type: ref.type,
        fromProps: ref.fromProps,
        resolved: true,
        category: subSpec.category ?? 'feature',
        description: subSpec.description,
        requiredProps: subSpec.props.filter((p) => p.required).map((p) => p.name),
        optionalPropsPreview: subSpec.props.filter((p) => !p.required).map((p) => p.name).slice(0, 8),
      }
    }

    return {
      type: ref.type,
      fromProps: ref.fromProps,
      resolved: false,
      fix: `确认 ${ref.type} 是否在 component-catalog 中注册，或在 prop 类型上提供可被 VCM 展开的结构类型（如 XxxNode）。`,
    }
  })
}

/**
 * 解析某个 prop（按名称列表择一）对应的内联结构 schema。
 *
 * 仅在 pool 条目为 JSON Schema object 时返回——用于 `@componentRef` 指向的子组件
 * 没有独立 catalog 条目、但父 prop 类型已被 VCM 展开的场景。
 */
function resolveInlineStructureSchema(
  catalog: ComponentCatalog,
  entry: HydratedComponentEntry,
  propNames: string[],
): PropSchema | undefined {
  for (const name of propNames) {
    const prop = entry.props.find((p) => p.name === name)
    if (prop === undefined) continue
    const schema = resolvePropSchema(catalog, prop)
    if (schema?.type === 'object' && schema.properties !== undefined) return schema
  }
  return undefined
}

/**
 * 水合后的属性记录。
 * 在 PropEntry 基础上，附加了通过 JSON Schema $ref 解析得到的内联 PropSchema（若存在）。
 */
export interface HydratedPropEntry extends PropEntry {
  /** 已解析的属性 schema（来自 schemaNodes 自引用表） */
  resolvedSchema?: PropSchema
}

/**
 * 水合后的事件记录。
 * 在 EmitEntry 基础上，附加了通过 JSON Schema $ref 解析得到的 payload schema（若存在）。
 */
export interface HydratedEmitEntry extends EmitEntry {
  /** 已解析的 payload schema */
  resolvedSchema?: PropSchema
}

/**
 * 完全水合的组件记录——本文件大多数投影逻辑的底层数据结构。
 *
 * 通过解析组件自包含 props / emits 与 schema 引用得到。
 * 与原始 ComponentEntry 的区别：props / emits 已被替换为含内联 schema 的水合形态。
 */
export interface HydratedComponentEntry extends Omit<ComponentEntry, 'props' | 'emits'> {
  /** 已水合的属性列表（含内联 schema） */
  props: HydratedPropEntry[]
  /** 已水合的事件列表（含内联 payload schema） */
  emits: HydratedEmitEntry[]
}


// =========================================================
// 二、基础解析与水合（Resolution & Hydration）
// =========================================================

/**
 * 通过 type 字符串正则判定容器类组件的快速匹配表达式。
 * 当 catalog 中未显式声明 category 时，用于推断分类。
 */
const CONTAINER_TYPES = /^r-(table|form|detail|tree|list)$/

/**
 * 根据组件条目的 type / filePath 特征智能推断其所属分类。
 *
 * 推断优先级：
 * 1. 显式声明的 entry.category（最高优先级，直接返回）；
 * 2. CONTAINER_TYPES 正则匹配组件 type；
 * 3. filePath 包含 '/containers/'；
 * 4. filePath 包含 '/fields/' 或 type 以 'r-' 开头；
 * 5. 降级为 'feature'。
 *
 * @param entry 原始组件记录
 * @returns 组件分类字符串（'container' | 'field' | 'group' | 'meta' | 'feature'）
 */
function inferCategory(entry: ComponentEntry): NonNullable<ComponentEntry['category']> {
  if (entry.category !== undefined) return entry.category
  const t = entry.type
  if (CONTAINER_TYPES.test(t)) return 'container'
  const fp = entry.filePath ?? ''
  if (fp.includes('/containers/')) return 'container'
  if (fp.includes('/fields/') || t.startsWith('r-')) return 'field'
  return 'feature'
}

function buildComponentRegistry(components: Record<string, ComponentEntry>): ComponentRegistry {
  const registry: ComponentRegistry = {
    containers: [],
    fields: [],
    groups: [],
    meta: [],
  }

  for (const [type, entry] of Object.entries(components)) {
    const category = inferCategory(entry)
    if (category === 'container') registry.containers.push(type)
    else if (category === 'field') registry.fields.push(type)
    else if (category === 'group') registry.groups.push(type)
    else if (category === 'meta') registry.meta.push(type)
  }

  registry.containers.sort((a, b) => a.localeCompare(b))
  registry.fields.sort((a, b) => a.localeCompare(b))
  registry.groups.sort((a, b) => a.localeCompare(b))
  registry.meta.sort((a, b) => a.localeCompare(b))
  return registry
}

function isConfigurableComponent(entry: ComponentEntry): boolean {
  return entry.internal !== true && entry.configurable !== false
}

function collectReachableSchemaNodeIds(
  schemaNodes: SchemaNodeEntry[] | undefined,
  components: Record<string, ComponentEntry>,
): Set<string> {
  const reachable = new Set<string>()
  if (schemaNodes === undefined) return reachable

  const nodeById = new Map(schemaNodes.map((node) => [node.id, node]))
  const childrenByParent = new Map<string, SchemaNodeEntry[]>()
  for (const node of schemaNodes) {
    if (node.parentId === undefined) continue
    const children = childrenByParent.get(node.parentId) ?? []
    children.push(node)
    childrenByParent.set(node.parentId, children)
  }

  const visit = (id: string | undefined): void => {
    if (id === undefined || reachable.has(id)) return
    const node = nodeById.get(id)
    if (node === undefined) return
    reachable.add(id)
    visit(node.refId)
    for (const child of childrenByParent.get(id) ?? []) visit(child.id)
  }

  for (const entry of Object.values(components)) {
    for (const prop of entry.props) visit(prop.schemaNodeId)
    for (const emit of entry.emits ?? []) visit(emit.schemaNodeId)
  }

  return reachable
}

/**
 * TypeScript 类型守卫：断言值为非 undefined。
 *
 * 专为链式操作（Array.filter / Array.map）设计，避免在 filter 后需要额外类型断言。
 * 例：`arr.filter(isNotUndefined)` 的返回类型会自动收窄为 `T[]`。
 *
 * @param value 待检测值（可能为 T 或 undefined）
 * @returns 若 value 不为 undefined 则返回 true，同时收窄类型为 T
 */
function isNotUndefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

/**
 * SparkNode 骨架结构字段名集合。
 *
 * 这些字段属于节点本体，不属于组件业务 props；投影给 AI payload 时必须过滤，
 * 避免消费层继续生成 `props.id`、`props.type`、`props.children` 这类旧形态。
 */
const STRUCT_KEYS = new Set(['type', 'props', 'children', 'id'])
const VUE_MODEL_PROP = 'modelValue'
const CONFIG_MODEL_PROP = 'value'
const VUE_MODEL_UPDATE_EVENT = 'update:modelValue'

function isConfigurableProp(prop: Pick<PropEntry, 'name'>): boolean {
  return !STRUCT_KEYS.has(prop.name)
}

/**
 * 将从具体前端实现抽取出的 API 名称投影为页面配置层的跨框架语义。
 *
 * 当前组件目录的物理来源是 Vue SFC，因此原始 catalog 中会出现 `modelValue`
 * 和 `update:modelValue`。这两个名字属于 Vue 渲染适配层，不能直接暴露给
 * AI 生成的 rule.json；配置侧统一使用 `value`，再由各前端 renderer 映射。
 */
function sanitizeFrameworkText(text: string | undefined): string | undefined {
  if (text === undefined) return undefined
  return text
    .replaceAll('update:modelValue', 'valueChange')
    .replaceAll('modelValue', 'value')
    .replaceAll('Vue 渲染适配层', '前端渲染适配层')
    .replaceAll('Vue renderer', 'frontend renderer')
}

function normalizeConfigProp(prop: PropEntry): PropEntry {
  const name = prop.name === VUE_MODEL_PROP ? CONFIG_MODEL_PROP : prop.name
  const description = prop.name === VUE_MODEL_PROP
    ? '跨框架配置模型值。页面配置使用 `value` 表达当前值；具体前端渲染器负责映射到自身模型属性。'
    : sanitizeFrameworkText(prop.description)

  return {
    ...prop,
    name,
    ...(description !== undefined ? { description } : {}),
  }
}

function normalizeConfigProps(props: PropEntry[]): PropEntry[] {
  const merged = new Map<string, PropEntry>()
  for (const rawProp of props) {
    const prop = normalizeConfigProp(rawProp)
    const existing = merged.get(prop.name)
    if (existing === undefined) {
      merged.set(prop.name, prop)
      continue
    }

    if (rawProp.name === VUE_MODEL_PROP) {
      const next: PropEntry = { ...prop, ...existing }
      const description = existing.description ?? prop.description
      if (description !== undefined) next.description = description
      else delete next.description
      merged.set(prop.name, next)
      continue
    }

    const next: PropEntry = { ...existing, ...prop }
    const description = prop.description ?? existing.description
    if (description !== undefined) next.description = description
    else delete next.description
    merged.set(prop.name, next)
  }
  return [...merged.values()]
}

function normalizeConfigEmit(emit: EmitEntry): EmitEntry | undefined {
  if (emit.name === VUE_MODEL_UPDATE_EVENT) return undefined
  const description = sanitizeFrameworkText(emit.description)
  const type = sanitizeFrameworkText(emit.type)
  return {
    ...emit,
    ...(type !== undefined ? { type } : {}),
    ...(description !== undefined ? { description } : {}),
  }
}

function normalizeConfigEmits(emits: EmitEntry[]): EmitEntry[] {
  return emits
    .map(normalizeConfigEmit)
    .filter(isNotUndefined)
}

/**
 * 核心水合函数：将 catalog 中的组件条目展开为完整的 HydratedComponentEntry。
 *
 * 处理流程：
 * 1. 从 catalog.components 取得原始条目；
 * 2. 规范化 props / emits 的配置层名称；
 * 3. 对每个属性尝试解析 schema.$ref -> PropSchema；
 * 4. 对每个事件尝试解析 schema.$ref -> PropSchema；
 * 5. 合并 binding 描述符（优先级：entry > bindingDescriptors）。
 *
 * 注意：本函数不会修改传入的 catalog 对象，始终返回新的聚合对象。
 *
 * @param catalog 全局组件目录（单一事实源）
 * @param type    要水合的组件 type 值（如 'r-button'）
 * @returns       水合完成的组件记录，若 type 不存在则返回 null
 */
export function projectHydratedComponent(catalog: ComponentCatalog, type: string): HydratedComponentEntry | null {
  const entry = catalog.components[type]
  if (entry === undefined) return null

  const resolvedBinding = resolveBindingDescriptor(catalog, type, entry)

  const mergedPropsRaw = normalizeConfigProps(entry.props)
  const mergedEmitsRaw = normalizeConfigEmits(entry.emits ?? [])

  const props: HydratedPropEntry[] = mergedPropsRaw.map((prop) => {
    const schema = resolvePropSchema(catalog, prop)
    return {
      ...prop,
      ...(schema !== undefined ? { resolvedSchema: schema } : {}),
    }
  })

  const emits: HydratedEmitEntry[] = mergedEmitsRaw.map((emit) => {
    const schema = resolveEmitSchemas(catalog, emit)
    return {
      ...emit,
      ...(schema !== undefined ? { resolvedSchema: schema } : {}),
    }
  })

  return {
    ...entry,
    ...(resolvedBinding !== undefined ? { binding: resolvedBinding } : {}),
    props,
    emits,
  }
}

/**
 * 解析组件的数据上下文绑定能力描述符（binding）。
 *
 * 优先级（从高到低）：
 * 1. entry.binding（组件自身声明的 binding，最高优先级）；
 * 2. catalog.bindingDescriptors[type]（全局 binding 描述符字典中的配置）。
 *
 * @param catalog        全局组件目录
 * @param type           组件 type（用于查询 bindingDescriptors）
 * @param entry          组件原始记录
 * @returns              解析到的 binding 描述符；所有来源均未定义则返回 undefined
 */
function resolveBindingDescriptor(catalog: ComponentCatalog, type: string, entry: ComponentEntry): CatalogBindingDescriptor | undefined {
  return entry.binding ?? catalog.bindingDescriptors?.[type]
}

/**
 * 判断组件是否声明了任意 emits 事件。
 *
 * 用于过滤"事件驱动"类组件的快速检测，避免每次都完整水合整个组件记录。
 *
 * @param catalog 全局组件目录
 * @param type    组件 type
 * @param entry   组件原始记录
 * @returns       true 表示该组件声明了至少一个 emits 事件
 */
function hasAnyEmit(catalog: ComponentCatalog, type: string, entry: ComponentEntry): boolean {
  if (normalizeConfigEmits(entry.emits ?? []).length > 0) return true
  return false
}

/**
 * 解析属性的 PropSchema，按以下优先级尝试：
 * 1. prop.schemaNodeId -> catalog.schemaNodes 自引用表；
 * 2. 均不存在则返回 undefined。
 *
 * @param catalog 全局组件目录（需包含 schemaNodes）
 * @param prop    待解析的属性记录
 * @returns       解析得到的 PropSchema；若不存在则返回 undefined
 */
function resolvePropSchema(
  catalog: ComponentCatalog,
  prop: PropEntry,
): PropSchema | undefined {
  return resolveSchemaNode(catalog, prop.schemaNodeId)
}

/**
 * 解析事件的 payload schema。
 *
 * 解析策略：
 * 1. emit.schemaNodeId -> catalog.schemaNodes 自引用表；
 * 2. 均不存在则返回 undefined。
 *
 * @param catalog 全局组件目录（需包含 schemaNodes）
 * @param emit    待解析的事件记录
 * @returns       解析得到的 PropSchema；若不存在则返回 undefined
 */
function resolveEmitSchemas(catalog: ComponentCatalog, emit: EmitEntry): PropSchema | undefined {
  return resolveSchemaNode(catalog, emit.schemaNodeId)
}

function resolveSchemaNode(catalog: ComponentCatalog, nodeId: string | undefined): PropSchema | undefined {
  if (nodeId === undefined || catalog.schemaNodes === undefined) return undefined
  const byId = new Map(catalog.schemaNodes.map((node) => [node.id, node]))
  const childrenByParent = new Map<string, SchemaNodeEntry[]>()
  for (const node of catalog.schemaNodes) {
    if (node.parentId === undefined) continue
    const children = childrenByParent.get(node.parentId) ?? []
    children.push(node)
    childrenByParent.set(node.parentId, children)
  }
  for (const children of childrenByParent.values()) {
    children.sort((left, right) => {
      const relation = left.relation.localeCompare(right.relation)
      if (relation !== 0) return relation
      const leftIndex = left.index ?? Number.MAX_SAFE_INTEGER
      const rightIndex = right.index ?? Number.MAX_SAFE_INTEGER
      if (leftIndex !== rightIndex) return leftIndex - rightIndex
      return (left.name ?? '').localeCompare(right.name ?? '')
    })
  }

  const build = (id: string, seen: Set<string>): PropSchema | undefined => {
    if (seen.has(id)) return undefined
    const node = byId.get(id)
    if (node === undefined) return undefined
    const nextSeen = new Set(seen)
    nextSeen.add(id)

    const referenced = node.refId === undefined ? undefined : build(node.refId, nextSeen)
    const schema: PropSchema = {
      ...(referenced ?? {}),
      ...(node.type !== undefined ? { type: node.type } : {}),
      ...(node.title !== undefined ? { title: node.title } : {}),
      ...(node.description !== undefined ? { description: node.description } : {}),
      ...(node.enum !== undefined ? { enum: node.enum } : {}),
      ...(node.const !== undefined ? { const: node.const } : {}),
      ...(node.default !== undefined ? { default: node.default } : {}),
      ...(node.examples !== undefined ? { examples: node.examples } : {}),
    }

    const children = childrenByParent.get(id) ?? []
    const propertyChildren = children.filter((child) => child.relation === 'property')
    if (propertyChildren.length > 0) {
      const properties: Record<string, PropSchema> = {}
      const required: string[] = []
      for (const child of propertyChildren) {
        if (child.name === undefined) continue
        const childSchema = build(child.id, nextSeen)
        if (childSchema !== undefined) properties[child.name] = childSchema
        if (child.required === true) required.push(child.name)
      }
      schema.type = schema.type ?? 'object'
      schema.properties = properties
      if (required.length > 0) schema.required = required
    }

    const itemChild = children.find((child) => child.relation === 'items')
    if (itemChild !== undefined) {
      const itemSchema = build(itemChild.id, nextSeen)
      if (itemSchema !== undefined) schema.items = itemSchema
    }

    const prefixItems = children
      .filter((child) => child.relation === 'prefixItem')
      .map((child) => build(child.id, nextSeen))
      .filter(isNotUndefined)
    if (prefixItems.length > 0) schema.prefixItems = prefixItems

    const oneOf = children
      .filter((child) => child.relation === 'oneOf')
      .map((child) => build(child.id, nextSeen))
      .filter(isNotUndefined)
    if (oneOf.length > 0) schema.oneOf = oneOf

    const anyOf = children
      .filter((child) => child.relation === 'anyOf')
      .map((child) => build(child.id, nextSeen))
      .filter(isNotUndefined)
    if (anyOf.length > 0) schema.anyOf = anyOf

    return schema
  }

  return build(nodeId, new Set())
}

function toPlainPropEntry(prop: HydratedPropEntry): PropEntry {
  const { resolvedSchema: _resolvedSchema, ...plain } = prop
  return plain
}

function toPlainEmitEntry(emit: HydratedEmitEntry): EmitEntry {
  const { resolvedSchema: _resolvedSchema, ...plain } = emit
  return plain
}

/**
 * 公开 catalog 投影：把构建产物中的具体前端实现细节收敛为配置层 catalog。
 *
 * - `modelValue` prop 统一投影为 `value`；
 * - `update:modelValue` 事件不作为页面配置事件暴露；
 * - vue-component-meta 等构建中间结构不进入公开配置目录。
 */
export function projectFrameworkNeutralCatalog(catalog: ComponentCatalog): ComponentCatalog {
  const components: Record<string, ComponentEntry> = {}

  for (const type of Object.keys(catalog.components)) {
    const entry = projectHydratedComponent(catalog, type)
    if (entry === null) continue
    if (!isConfigurableComponent(entry)) continue
    const {
      props,
      emits,
      description,
      notes,
      filePath: _filePath,
      source: _source,
      internal: _internal,
      configurable: _configurable,
      ...rest
    } = entry

    const next: ComponentEntry = {
      ...rest,
      props: props.map(toPlainPropEntry),
      emits: emits.map(toPlainEmitEntry),
    }
    const sanitizedDescription = sanitizeFrameworkText(description)
    const sanitizedNotes = sanitizeFrameworkText(notes)
    if (sanitizedDescription !== undefined) next.description = sanitizedDescription
    if (sanitizedNotes !== undefined) next.notes = sanitizedNotes
    components[type] = next
  }

  const reachableSchemaNodeIds = collectReachableSchemaNodeIds(catalog.schemaNodes, components)

  return {
    version: catalog.version,
    buildTime: catalog.buildTime,
    componentCount: Object.keys(components).length,
    components,
    ...(catalog.schemaNodes !== undefined
      ? { schemaNodes: catalog.schemaNodes.filter((node) => reachableSchemaNodeIds.has(node.id)) }
      : {}),
    ...(catalog.constraints !== undefined ? { constraints: catalog.constraints } : {}),
    ...(catalog.bindingDescriptors !== undefined ? { bindingDescriptors: catalog.bindingDescriptors } : {}),
    ...(catalog.governance !== undefined ? { governance: catalog.governance } : {}),
  }
}


// =========================================================
// 三、FC 投影（Session / ActionSpec / Guide）
// =========================================================

/**
 * AI FC 投影：生成全局组件目录摘要（适用于 queryPayloads）。
 *
 * 输出内容：
 * - 各分类组件数量汇总（total / containers / fields / groups / meta / features）；
 * - 从 components.category 派生的完整分类列表（供 LLM 按类别选择组件）；
 * - 全量组件简述（type + category + description）；
 * - 按数据绑定 / 事件驱动 / 选项驱动三个维度聚合的能力组；
 * - 面向 LLM 的通用配置使用原则（4 条约束规则）。
 *
 * @param catalog 全局组件目录（单一事实源）
 * @returns       可直接返回给 LLM 的目录摘要负载
 */
export function projectComponentDirectory(catalog: ComponentCatalog): ComponentDirectoryPayload {
  const entries = Object.entries(catalog.components).filter(([, e]) => isConfigurableComponent(e))
  const visibleComponents = Object.fromEntries(entries)
  const featureCount = entries.filter(([, e]) => inferCategory(e) === 'feature').length
  const registry = buildComponentRegistry(visibleComponents)

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
    hint: 'queryPayloads 可直接返回该目录摘要；如需查看单组件属性规格，请按组件 type 调用 guidePayload 查阅配置指南。',
    summary: {
      total: entries.length,
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
      '先按 components 的 type/category 选择组件，再按单组件配置指南填写 props。',
      'dataKey 与 binding 必须按 catalog 声明使用，不允许猜测字段。',
      '事件能力以 emits 为准；无 emits 的组件不得编造 on.* 绑定。',
      'required props 必填，default 仅作默认值提示，业务值需显式传入。',
    ],
  }
}

/**
 * AI FC 投影：提炼单组件能力核心规格（适用于 guidePayload）。
 *
 * 输出精简的 ComponentSpec，仅保留 LLM 构造 SparkNode 所需的最小信息：
 * type / category / description / props（含必填标记）/ emits（含描述）。
 * 复杂的 schema 引用不展开（由消费方根据需要进一步查询）。
 *
 * @param catalog 全局组件目录
 * @param type    目标组件 type 值（如 'r-table'）
 * @returns       单组件规格对象；type 不存在时返回 null
 */
export function projectComponentSpec(catalog: ComponentCatalog, type: string): ComponentSpec | null {
  const entry = projectHydratedComponent(catalog, type)
  if (entry === null) return null
  if (!isConfigurableComponent(entry)) return null
  const configurableProps = entry.props.filter(isConfigurableProp)

  return {
    type: entry.type,
    category: inferCategory(entry),
    description: entry.description ?? '',
    props: configurableProps.map(p => ({
      name: p.name,
      type: p.type,
      required: p.required,
      ...(p.default !== undefined ? { default: p.default } : {}),
      ...(p.description !== undefined ? { description: p.description } : {}),
      ...(p.examples !== undefined ? { examples: p.examples } : {}),
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

/**
 * Function 投影：把完整 component catalog 收敛为会话可读的轻量目录。
 *
 * 该投影供业务 payload provider 持有，避免 core session 协议绑定具体组件目录。
 */
export function projectFunctionCatalog(catalog: ComponentCatalog): FunctionCatalog {
  const configurableComponents = Object.fromEntries(
    Object.entries(catalog.components).filter(([, entry]) => isConfigurableComponent(entry)),
  )
  const registry = buildComponentRegistry(configurableComponents)

  const components: Record<string, FunctionComponentEntry> = {}

  for (const type of Object.keys(configurableComponents)) {
    const spec = projectComponentSpec(catalog, type)
    if (spec === null) continue

    const nestingRule = catalog.constraints?.nestingRules[type]

    components[type] = {
      category: spec.category ?? 'feature',
      description: spec.description,
      props: spec.props,
      ...(spec.emits.length > 0 ? { emits: spec.emits } : {}),
      ...(spec.rootFields !== undefined ? { rootFields: spec.rootFields } : {}),
      ...(spec.notes !== undefined ? { notes: spec.notes } : {}),
      ...(spec.binding !== undefined ? { binding: { ...spec.binding } as Record<string, unknown> } : {}),
      ...(nestingRule !== undefined ? { nestingRule } : {}),
    }
  }

  return {
    version: catalog.version,
    buildTime: catalog.buildTime,
    componentCount: Object.keys(components).length,
    registry: {
      containers: [...registry.containers],
      fields: [...registry.fields],
      groups: [...registry.groups],
      meta: [...registry.meta],
    },
    components,
  }
}

/**
 * 内部辅助：根据属性类型字符串推断一个可用于示例展示的占位值。
 *
 * 推断规则（按类型关键字匹配，不区分大小写）：
 * - boolean -> false
 * - number / int / float -> 0
 * - array / [] -> []
 * - record / object / { -> {}
 * - required（必填但无法推断）-> `'<required>'`
 * - 其他（可选）-> `''`
 *
 * @param type     属性类型字符串（如 'string', 'boolean', 'number[]'）
 * @param required 是否为必填属性（影响未能匹配时的兜底值）
 * @returns        适合填入最小配置示例的占位值
 */
function inferExampleValue(type: string, required: boolean): unknown {
  const t = type.toLowerCase()
  if (t.includes('boolean')) return false
  if (t.includes('number') || t.includes('int') || t.includes('float')) return 0
  if (t.includes('array') || t.includes('[]')) return []
  if (t.includes('record<') || t.includes('object') || t.includes('{')) return {}
  if (required) return '<required>'
  return ''
}

/**
 * 内部辅助：将嵌套的 RootFieldEntry 树形结构展开为带层级路径的扁平字符串列表。
 *
 * 例：`[{ name: 'a', children: [{ name: 'b' }] }]` -> `['a', 'a.b']`
 * 路径使用 `.` 分隔，与 DataKey 格式对齐。
 *
 * @param fields 根字段声明列表（可嵌套）
 * @param prefix 当前递归层级的路径前缀（初始调用时为空字符串）
 * @returns      所有字段的扁平路径列表，按深度优先遍历顺序排列
 */
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

/**
 * AI FC 投影：生成单组件详尽配置指导书（适用于辅助 LLM 构造无误的 SparkNode）。
 *
 * 在 `projectComponentSpec` 的基础上额外提供：
 * - 必填 / 可选属性分组（方便 LLM 区分哪些字段必须填写）；
 * - 事件使用指南（含 payload 参数签名）；
 * - 数据绑定能力摘要（selfResolving / dataContainer 等标志位）；
 * - 带占位值的最小安全配置（LLM 可直接作为代码生成的起点）；
 * - Fail-fast 自检清单（LLM 生成完配置后的逐条验证规则）。
 *
 * @param catalog 全局组件目录
 * @param type    目标组件 type 值
 * @returns       详尽配置指导书；type 不存在时返回 null
 */
export function projectComponentConfigGuide(catalog: ComponentCatalog, type: string): ComponentConfigGuide | null {
  const entry = projectHydratedComponent(catalog, type)
  if (entry === null) return null
  if (!isConfigurableComponent(entry)) return null
  const configurableProps = entry.props.filter(isConfigurableProp)

  const requiredProps = configurableProps
    .filter((prop) => prop.required)
    .map((prop) => ({
      name: prop.name,
      type: prop.type,
      ...(prop.default !== undefined ? { default: prop.default } : {}),
      ...(prop.description !== undefined ? { description: prop.description } : {}),
      ...(prop.examples !== undefined ? { examples: prop.examples } : {}),
      ...(prop.resolvedSchema !== undefined ? { schema: prop.resolvedSchema } : {}),
    }))

  const optionalProps = configurableProps
    .filter((prop) => !prop.required)
    .map((prop) => ({
      name: prop.name,
      type: prop.type,
      ...(prop.default !== undefined ? { default: prop.default } : {}),
      ...(prop.description !== undefined ? { description: prop.description } : {}),
      ...(prop.examples !== undefined ? { examples: prop.examples } : {}),
      ...(prop.resolvedSchema !== undefined ? { schema: prop.resolvedSchema } : {}),
    }))

  const eventGuide = entry.emits.map((emit) => ({
    name: emit.name,
    ...(emit.description !== undefined ? { description: emit.description } : {}),
  }))

  const minimalProps = Object.fromEntries(
    configurableProps
      .filter((prop) => prop.required)
      .map((prop) => [prop.name, inferExampleValue(prop.type, true)]),
  )

  const category = inferCategory(entry)
  const rootFieldPaths = flattenRootFieldPaths(entry.rootFields ?? [])
  const subComponentGuides = buildSubComponentGuides(catalog, entry)
  const unresolvedSubComponentGuides = subComponentGuides.filter((item) => !item.resolved)

  // 生成"最低起步配置"：仅包含必填 props，容器类附加空 children 数组
  const minimalConfig = {
    type: entry.type,
    props: minimalProps,
    ...(category === 'container' ? { children: [] } : {}),
  }

  // fail-fast 清单：LLM 在提交配置前应逐条验证
  const failFastChecks = [
    `组件 type 必须精确匹配: ${entry.type}`,
    ...requiredProps.map((prop) => `必填 props 未传: ${prop.name}`),
    ...rootFieldPaths.map((path) => `rootFields 路径应可解析: ${path}`),
    ...unresolvedSubComponentGuides.map((item) => `子组件引用未解析: ${item.type}（来源 props: ${item.fromProps.join(', ')}）`),
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
    ...(subComponentGuides.length > 0 ? { subComponentGuides } : {}),
    minimalConfig,
    failFastChecks,
  }
}
