/**
 * 组件目录投影层 (Catalog Projections)
 *
 * 核心目标：从单一事实源 component-catalog.json 中，根据不同的消费场景提取适当且聚焦的数据子集。
 * 设计保证：本文件中所有对外暴露及内部辅助函数均严格遵守纯函数 (Pure Function) 范式，无任何副作用。
 *
 * 主要消费场景：
 * 1. AI Function Calling (FC) 场景——为 LLM 在分析页面上下文与组装 UI 时（session.describe /
 *    stills.actionSpec）提供精简、无冗余的组件视图，最小化 Token 开销。
 * 2. DevSystem（开发者平台）场景——为 rule.json 内建的图形化配置编辑器提供组件选取、属性下拉、
 *    枚举推断与默认值提示等元数据结构。
 *
 * 依赖关系：本文件仅依赖 ./types 与 component-catalog.json，不引入任何框架或运行时副作用。
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
  PropSchemaProperty,
  RootFieldEntry,
} from './types'
import type { StillsCatalog, StillsComponentEntry } from './stills-catalog-types'

// ══════════════════════════════════════════════════════════════
// 第一部分：接口定义区 (Exported Projection Types)
// 定义各投影场景输出的结构契约，供消费层类型推导与运行时校验
// ══════════════════════════════════════════════════════════════

/**
 * LLM 目录摘要负载——告知大模型当前应用环境可用的全部组件总览。
 *
 * 由 `projectFcDirectory` 生成，适合作为 session.describe 的响应体直接返回。
 * 包含：组件总数统计、registry 分类列表、能力分组（数据绑定 / 事件驱动 / 选项驱动）
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
  /** 原始注册表，按分类列出全部组件 type */
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
 * 由 `projectFcSpec` 生成，适合作为 stills.actionSpec 的消费目标。
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
  props: Array<Pick<PropEntry, 'name' | 'type' | 'required'> & { default?: string; description?: string }>
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
 * 由 `projectFcConfigGuide` 生成。除基本规格外，还内置：
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
  requiredProps: Array<{ name: string; type: string; default?: string; description?: string }>
  /** 可选属性列表（含类型、默认值与描述） */
  optionalProps: Array<{ name: string; type: string; default?: string; description?: string }>
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
}

/**
 * 水合后的属性记录。
 * 在 PropEntry 基础上，附加了通过 schemaRef 解析得到的内联 PropSchema（若存在）。
 */
export interface HydratedPropEntry extends PropEntry {
  /** 已解析的属性 schema（来自 schemaPool 引用或属性直接声明的 schema） */
  schema?: PropSchema
}

/**
 * 水合后的事件记录。
 * 在 EmitEntry 基础上，附加了通过 schemaRefs 批量解析得到的 payload schema 列表（若存在）。
 */
export interface HydratedEmitEntry {
  /** 事件名 */
  name: string
  /** 事件类型标注（如 'change' / 'click'） */
  type?: string
  /** 事件语义描述 */
  description?: string
  /** 已解析的 payload schema 数组 */
  schema?: PropSchema[]
  /** payload 参数列表（显式声明版，优先于 schema 使用） */
  payload?: Array<{ name: string; type: string }>
}

/**
 * 完全水合的组件记录——本文件大多数投影逻辑的底层数据结构。
 *
 * 通过解析 canonical 字典、合并 props / emits 并解析 schema 引用得到。
 * 与原始 ComponentEntry 的区别：props / emits 已被替换为含内联 schema 的水合形态。
 */
export interface HydratedComponentEntry extends Omit<ComponentEntry, 'props' | 'emits'> {
  /** 已水合的属性列表（含内联 schema） */
  props: HydratedPropEntry[]
  /** 已水合的事件列表（含内联 payload schema） */
  emits: HydratedEmitEntry[]
}


// ══════════════════════════════════════════════════════════════
// 第二部分：公共底层解析与水合 (Core Resolution & Hydration)
// 将 canonical 引用模式展开为完整的聚合形态，为上层投影提供数据支撑
// ══════════════════════════════════════════════════════════════

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
 * 核心水合函数：将 catalog 中通过 canonical 引用描述的组件展开为完整的 HydratedComponentEntry。
 *
 * 处理流程：
 * 1. 从 catalog.components 取得原始条目；
 * 2. 解析 canonical propRefs / emitRefs（若存在），展开为完整属性/事件列表；
 * 3. 将 canonical 与条目本身的属性/事件进行名称合并（条目覆盖 canonical）；
 * 4. 对每个属性尝试解析 schemaRef -> PropSchema；
 * 5. 对每个事件尝试批量解析 schemaRefs -> PropSchema[]；
 * 6. 合并 binding 描述符（优先级：entry > canonical > bindingDescriptors）。
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

  const canonicalEntry = catalog.canonical?.components[type]
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
    ...(resolvedBinding !== undefined ? { binding: resolvedBinding } : {}),
    props,
    emits,
  }
}

/**
 * 将 canonical 中的 propRefs 数组展开为完整的 PropEntry 列表。
 *
 * propRefs 是 canonical 组件引用 dictionaries.props 中属性记录的键名列表。
 * 若当前组件未声明 canonical，则返回空数组（退回到组件自身 entry.props）。
 *
 * @param catalog        全局组件目录（需包含 canonical.dictionaries.props）
 * @param type           组件 type（仅用于错误提示）
 * @param canonicalEntry 该组件对应的 canonical 记录（可能为 undefined）
 * @returns              展开后的属性列表；canonical 不存在时返回空数组
 * @throws               dictionaries.props 缺失或 propRef 未命中时 fail-fast 抛出
 */
function resolveCanonicalProps(catalog: ComponentCatalog, type: string, canonicalEntry: CatalogCanonicalComponent | undefined): PropEntry[] {
  if (canonicalEntry === undefined) return []
  const dict = catalog.canonical?.dictionaries.props
  if (dict === undefined) throw new Error(`component-catalog canonical.props 缺失: ${type}`)

  return canonicalEntry.propRefs.map((ref) => {
    const prop = dict[ref]
    if (prop === undefined) throw new Error(`component-catalog canonical propRef 未解析: ${type}.${ref}`)
    return prop
  })
}

/**
 * 将 canonical 中的 emitRefs 数组展开为完整的 EmitEntry 列表。
 *
 * emitRefs 是 canonical 组件引用 dictionaries.emits 中事件记录的键名列表。
 * 若当前组件未声明 canonical，则返回空数组（退回到组件自身 entry.emits）。
 *
 * @param catalog        全局组件目录（需包含 canonical.dictionaries.emits）
 * @param type           组件 type（仅用于错误提示）
 * @param canonicalEntry 该组件对应的 canonical 记录（可能为 undefined）
 * @returns              展开后的事件列表；canonical 不存在时返回空数组
 * @throws               dictionaries.emits 缺失或 emitRef 未命中时 fail-fast 抛出
 */
function resolveCanonicalEmits(catalog: ComponentCatalog, type: string, canonicalEntry: CatalogCanonicalComponent | undefined): EmitEntry[] {
  if (canonicalEntry === undefined) return []
  const dict = catalog.canonical?.dictionaries.emits
  if (dict === undefined) throw new Error(`component-catalog canonical.emits 缺失: ${type}`)

  return canonicalEntry.emitRefs.map((ref) => {
    const emit = dict[ref]
    if (emit === undefined) throw new Error(`component-catalog canonical emitRef 未解析: ${type}.${ref}`)
    return emit
  })
}

/**
 * 按属性名合并两组 PropEntry 列表，实现"子级覆盖基类"的继承语义。
 *
 * 合并规则：
 * - 以 base（canonical 扩展出的基础属性）为底；
 * - incoming（组件 entry 本体的 props）中同名属性会与 base 中的同名条目做浅合并（incoming 优先）；
 * - 仅出现在 incoming 中的新属性直接追加。
 *
 * @param base     基础属性列表（通常来自 canonical propRefs 展开结果）
 * @param incoming 覆盖属性列表（通常来自组件 entry.props）
 * @returns        合并后的属性列表，顺序与 base 插入顺序一致，incoming 新增项追加在后
 */
function mergePropsByName(base: PropEntry[], incoming: PropEntry[]): PropEntry[] {
  const merged = new Map<string, PropEntry>()
  for (const prop of base) merged.set(prop.name, prop)
  for (const prop of incoming) merged.set(prop.name, { ...merged.get(prop.name), ...prop })
  return [...merged.values()]
}

/**
 * 按事件名合并两组 EmitEntry 列表，实现"子级覆盖基类"的继承语义。
 *
 * 合并规则与 mergePropsByName 一致：base 作为底，incoming 中同名事件浅合并覆盖，新增事件追加。
 *
 * @param base     基础事件列表（通常来自 canonical emitRefs 展开结果）
 * @param incoming 覆盖事件列表（通常来自组件 entry.emits）
 * @returns        合并后的事件列表
 */
function mergeEmitsByName(base: EmitEntry[], incoming: EmitEntry[]): EmitEntry[] {
  const merged = new Map<string, EmitEntry>()
  for (const emit of base) merged.set(emit.name, emit)
  for (const emit of incoming) merged.set(emit.name, { ...merged.get(emit.name), ...emit })
  return [...merged.values()]
}

/**
 * 解析组件的数据上下文绑定能力描述符（binding）。
 *
 * 优先级（从高到低）：
 * 1. entry.binding（组件自身声明的 binding，最高优先级）；
 * 2. canonicalEntry.binding（canonical 中继承的通用 binding）；
 * 3. catalog.bindingDescriptors[type]（全局 binding 描述符字典中的配置）。
 *
 * @param catalog        全局组件目录
 * @param type           组件 type（用于查询 bindingDescriptors）
 * @param entry          组件原始记录
 * @param canonicalEntry 组件 canonical 记录（可能为 undefined）
 * @returns              解析到的 binding 描述符；所有来源均未定义则返回 undefined
 */
function resolveBindingDescriptor(catalog: ComponentCatalog, type: string, entry: ComponentEntry, canonicalEntry?: CatalogCanonicalComponent): CatalogBindingDescriptor | undefined {
  return entry.binding ?? canonicalEntry?.binding ?? catalog.bindingDescriptors?.[type]
}

/**
 * 判断组件是否声明了任意 emits 事件（包括通过 canonical 继承的事件）。
 *
 * 用于过滤"事件驱动"类组件的快速检测，避免每次都完整水合整个组件记录。
 *
 * @param catalog 全局组件目录
 * @param type    组件 type
 * @param entry   组件原始记录
 * @returns       true 表示该组件声明了至少一个 emits 事件
 */
function hasAnyEmit(catalog: ComponentCatalog, type: string, entry: ComponentEntry): boolean {
  if ((entry.emits ?? []).length > 0) return true
  const canonicalEntry = catalog.canonical?.components[type]
  return (canonicalEntry?.emitRefs.length ?? 0) > 0
}

/**
 * 解析属性的 PropSchema，按以下优先级尝试：
 * 1. prop.schema（属性直接内联声明的 schema，优先级最高）；
 * 2. catalog.schemaPool[prop.schemaRef]（通过 schemaRef 从全局 schema 池中查取）；
 * 3. 均不存在则返回 undefined。
 *
 * @param catalog 全局组件目录（需包含 schemaPool）
 * @param prop    待解析的属性记录
 * @returns       解析得到的 PropSchema；若不存在则返回 undefined
 */
function resolvePropSchema(
  catalog: ComponentCatalog,
  prop: PropEntry,
  visited: Set<string> = new Set(),
): PropSchema | undefined {
  if (prop.schema !== undefined) return prop.schema
  if (prop.schemaRef === undefined) return undefined

  // "component:X" 引用：从 catalog.components[X].props 递归展开为 object schema
  if (prop.schemaRef.startsWith('component:')) {
    const componentType = prop.schemaRef.slice('component:'.length)
    // 防环：已访问过的组件类型不再递归
    if (visited.has(componentType)) return undefined
    const referencedEntry = catalog.components[componentType]
    if (referencedEntry !== undefined) {
      const nextVisited = new Set(visited)
      nextVisited.add(componentType)
      const properties: Record<string, PropSchemaProperty> = {}
      for (const refProp of referencedEntry.props) {
        const nestedSchema = resolvePropSchema(catalog, refProp, nextVisited)
        properties[refProp.name] = {
          name: refProp.name,
          type: refProp.type,
          ...(refProp.required ? { required: refProp.required } : {}),
          ...(refProp.description !== undefined ? { description: refProp.description } : {}),
          ...(nestedSchema !== undefined ? { schema: nestedSchema } : {}),
        }
      }
      return { kind: 'object', type: componentType, properties }
    }
    return undefined
  }

  return catalog.schemaPool?.[prop.schemaRef]
}

/**
 * 批量解析事件的 payload schema 列表。
 *
 * 解析策略：
 * 1. emit.schema（已内联的 schema 数组）非空时直接返回；
 * 2. emit.schemaRefs 存在时，从 catalog.schemaPool 批量查取，过滤掉未命中的引用；
 * 3. 均不满足则返回 undefined。
 *
 * @param catalog 全局组件目录（需包含 schemaPool）
 * @param emit    待解析的事件记录
 * @returns       解析得到的 PropSchema 数组；若不存在则返回 undefined
 */
function resolveEmitSchemas(catalog: ComponentCatalog, emit: EmitEntry): PropSchema[] | undefined {
  if (emit.schema !== undefined && emit.schema.length > 0) return emit.schema
  if (emit.schemaRefs === undefined || emit.schemaRefs.length === 0) return undefined

  const schemas = emit.schemaRefs.map((ref) => catalog.schemaPool?.[ref]).filter(isNotUndefined)
  return schemas.length > 0 ? schemas : undefined
}


// ══════════════════════════════════════════════════════════════
// 第三部分：FC 投影——Session 与 AI 动作规范 (AI FC Projections)
// 为大语言模型的 UI 生成提供简要目录、单组件规格与配置指导书
// ══════════════════════════════════════════════════════════════

/**
 * AI FC 投影：生成全局组件目录摘要（适用于 session.describe）。
 *
 * 输出内容：
 * - 各分类组件数量汇总（total / containers / fields / groups / meta / features）；
 * - registry 完整分类列表（供 LLM 按类别选择组件）；
 * - 全量组件简述（type + category + description）；
 * - 按数据绑定 / 事件驱动 / 选项驱动三个维度聚合的能力组；
 * - 面向 LLM 的通用配置使用原则（4 条约束规则）。
 *
 * 注意：本函数会在 registry 缺失时 fail-fast 抛出，避免生成无效的空摘要。
 *
 * @param catalog 全局组件目录（单一事实源）
 * @returns       可直接返回给 LLM 的目录摘要负载
 * @throws        catalog.registry 缺失时抛出
 */
export function projectComponentDirectory(catalog: ComponentCatalog): ComponentDirectoryPayload {
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
    hint: 'session.describe 可直接返回该目录摘要；如需查看单组件属性规格，请按组件 type 调用 catalog.guide 查阅配置指南。',
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

/**
 * AI FC 投影：提炼单组件能力核心规格（适用于 catalog.guide / queryComponentGuide）。
 *
 * 输出精简的 FcComponentSpec，仅保留 LLM 构造 SparkNode 所需的最小信息：
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

/**
 * Stills 投影：把完整 component catalog 收敛为会话可读的轻量目录。
 *
 * 该投影用于 `createSession()` 默认注入，确保 `catalog.query` 只依赖
 * session.catalog，不依赖运行时兜底分支。
 */
export function projectStillsCatalog(catalog: ComponentCatalog): StillsCatalog {
  const registry = catalog.registry
  if (registry === undefined) {
    throw new Error('component-catalog registry 缺失：无法构建 StillsCatalog')
  }

  const components: Record<string, StillsComponentEntry> = {}

  for (const type of Object.keys(catalog.components)) {
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
 * 在 `projectFcSpec` 的基础上额外提供：
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

  const requiredProps = entry.props
    .filter((prop) => prop.required)
    .map((prop) => ({
      name: prop.name,
      type: prop.type,
      ...(prop.default !== undefined ? { default: prop.default } : {}),
      ...(prop.description !== undefined ? { description: prop.description } : {}),
      ...(prop.schema !== undefined ? { schema: prop.schema } : {}),
    }))

  const optionalProps = entry.props
    .filter((prop) => !prop.required)
    .map((prop) => ({
      name: prop.name,
      type: prop.type,
      ...(prop.default !== undefined ? { default: prop.default } : {}),
      ...(prop.description !== undefined ? { description: prop.description } : {}),
      ...(prop.schema !== undefined ? { schema: prop.schema } : {}),
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


// ══════════════════════════════════════════════════════════════
// 第四部分：DevSystem 投影——规则编辑器支撑 (DevSystem UI Projections)
// 为图形化 rule.json 配置编辑器提供组件选取、属性枚举、默认值回填等元数据
// ══════════════════════════════════════════════════════════════

/**
 * DevSystem 内部常量：SparkNode 骨架结构字段名集合。
 *
 * 这些字段属于节点的固定骨架，不是用户可配置的业务属性，
 * 在生成属性下拉列表时需要将其过滤掉，避免让用户误操作。
 */
const STRUCT_KEYS = new Set(['type', 'props', 'children', 'id'])

/**
 * DevSystem 投影：获取全量组件 type 列表（按字母序排列）。
 *
 * 来源：registry.containers + registry.fields + registry.groups + registry.meta
 * 以及 catalog.components 中的全部 type（保证不遗漏未归类的组件）。
 * 结果用于 DevSystem 的组件类型选择下拉框。
 *
 * @param catalog 全局组件目录
 * @returns       去重并按字母序排列的全量组件 type 数组
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

/**
 * DevSystem 投影：生成「组件 type -> 可配置属性名列表」映射表。
 *
 * 属性名列表已过滤掉骨架字段（STRUCT_KEYS），只保留业务可配置的属性。
 * 用于 DevSystem 的属性名选择下拉框，以及 rule.json 编辑器的属性补全。
 *
 * @param catalog 全局组件目录
 * @returns       `{ [type]: string[] }` 形式的属性名映射表
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
 * DevSystem 投影：生成「组件 type -> 属性名 -> 枚举值列表」三层嵌套映射表。
 *
 * 枚举值来源（优先级从高到低）：
 * 1. 属性类型字符串中的字面量联合（如 `"left" | "right" | "center"`）；
 * 2. 属性 schema.kind === 'enum' 时的 variants 数组。
 *
 * 无可用枚举值的属性不会出现在结果中（而非以空数组出现）。
 * 用于 DevSystem 中属性值的下拉选择器。
 *
 * @param catalog 全局组件目录
 * @returns       `{ [type]: { [propName]: string[] } }` 形式的枚举映射表
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
 * 内部辅助：从属性的类型字符串中提取字面量联合枚举值。
 *
 * 匹配规则：查找所有 `"..."` 格式的双引号字面量（非空字符串）。
 * 例：`'"left" | "right" | "center"'` -> `['left', 'right', 'center']`
 *
 * 结果少于 2 个枚举值时视为无效（可能是普通字符串类型），返回空数组。
 *
 * @param typeStr 属性的 type 字段字符串
 * @returns       提取到的枚举值数组（至少 2 个才有效），否则返回 `[]`
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

/**
 * 内部辅助：从 PropSchema 中提取 enum 类型的 variants 列表。
 *
 * 仅当 schema.kind === 'enum' 时有效，其他 schema 类型或 undefined 均返回空数组。
 * 过滤空字符串变体，保证输出的枚举项均有实际意义。
 *
 * @param schema 已解析的 PropSchema（可能为 undefined）
 * @returns      枚举变体字符串数组；不适用时返回 `[]`
 */
function parseEnumFromSchema(schema: PropSchema | undefined): string[] {
  if (schema?.kind !== 'enum') return []
  return schema.variants.filter((variant) => variant.length > 0)
}

/**
 * 内部辅助：从组件描述文本中萃取适合用作 UI 短标签的中文前缀词。
 *
 * 萃取规则：
 * 1. 取描述文本最开头的连续中文字符序列；
 * 2. 去除末尾的通用性后缀词（'容器' / '组件' / '字段' / '节点' / '页面'）；
 * 3. 剩余长度 >= 2 才返回，否则返回空字符串（避免单字无意义标签）。
 *
 * 例：`'图表分析组件，基于...'` -> `'图表分析'`
 *
 * @param description 组件描述字符串
 * @returns           短标签字符串（长度 >= 2）；无法萃取则返回 `''`
 */
function extractShortLabel(description: string): string {
  const match = /^([\u4e00-\u9fff]+)/.exec(description)
  if (!match?.[1]) return ''
  const label = match[1].replace(/(?:容器|组件|字段|节点|页面)$/, '')
  return label.length >= 2 ? label : ''
}

/**
 * DevSystem 投影：生成「组件 type -> '[短标签] type'」展示标签映射表。
 *
 * 短标签通过 `extractShortLabel` 从组件描述中萃取。若无法萃取，则直接使用 type 值。
 * 例：`r-chart` -> `'[图表分析] r-chart'`
 *
 * 用于 DevSystem 的组件选择器，在下拉列表中提供更易识别的中文语义前缀。
 *
 * @param catalog 全局组件目录
 * @returns       `{ [type]: string }` 形式的展示标签映射表
 */
export function projectDevTypeLabels(catalog: ComponentCatalog): Record<string, string> {
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
 * 内部辅助：根据属性类型字符串和显式声明的默认值，推断 DevSystem 回填时的初始值。
 *
 * 推断优先级：
 * 1. declaredDefault 非空时优先使用：先尝试 JSON.parse，失败则直接作为字符串返回；
 * 2. 类型字符串包含 'number' -> 0；
 * 3. 类型字符串包含 'boolean' -> false；
 * 4. 类型字符串包含 '[]' 或 'Array' -> []；
 * 5. 降级为 `''`（空字符串，适用于大多数文本类属性）。
 *
 * @param typeStr        属性类型字符串（如 'string', 'number', 'boolean[]'）
 * @param declaredDefault 属性声明的 default 字段（可能为 undefined）
 * @returns              推断得到的初始值
 */
function inferDefaultFromPropType(typeStr: string, declaredDefault?: string): unknown {
  if (declaredDefault !== undefined) {
    try { return JSON.parse(declaredDefault) as unknown } catch { /* fall through */ }
    return declaredDefault
  }
  if (typeStr.includes('number')) return 0
  if (typeStr.includes('boolean')) return false
  if (typeStr.includes('[]') || typeStr.includes('Array')) return []
  return ''
}

/**
 * DevSystem 投影：生成「组件 type -> 必填属性名 -> 默认值」映射表。
 *
 * 仅包含 required 标记为 true 且不属于骨架字段（STRUCT_KEYS）的属性。
 * 默认值通过 `inferDefaultFromPropType` 推断，优先使用 catalog 中的声明值。
 *
 * 用于 DevSystem 在新建规则节点时自动批量回填必填属性的初始值，
 * 减少用户手动填写的工作量并降低漏填风险。
 *
 * @param catalog 全局组件目录
 * @returns       `{ [type]: { [propName]: unknown } }` 形式的必填属性默认值映射表
 */
export function projectDevRequiredProps(catalog: ComponentCatalog): Record<string, Record<string, unknown>> {
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
