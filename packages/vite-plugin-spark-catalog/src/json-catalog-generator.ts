import { writeFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { globSync } from 'glob'
import { getOrCreateChecker, extractComponentApiVcm } from './extract-component-api-vcm'
import type { VcmCheckerOptions } from './extract-component-api-vcm'
import {
  toKebabCase,
  inferSkillType,
  createLogger,
  parseSkillMeta,
  normalizePath,
} from './utils'
import type {
  ComponentCatalog,
  ComponentEntry,
  ComponentRegistry,
  PropEntry,
  EmitEntry,
  PropSchema,
  CatalogBindingDescriptor,
  ComponentContractRefs,
  GovernanceContract,
  CatalogCanonicalModel,
  CatalogCanonicalComponent,
} from './component-catalog-schema'

const logger = createLogger('spark-catalog-json')

export interface JsonCatalogOptions {
  featurePatterns?: string[] | undefined; exclude?: string[] | undefined; tsconfigPath?: string | undefined; verbose?: boolean | undefined; includeGlobalProps?: boolean | undefined; vcmCheckerOptions?: VcmCheckerOptions | undefined
}

type SchemaOwner = 'workspace' | 'external'

interface PropEntryWithMeta extends PropEntry {
  __schemaIdentityKey?: string
  __schemaOwner?: SchemaOwner
}

interface SchemaPoolContext {
  index: Map<string, string>
  pool: Record<string, PropSchema>
  sequence: number
}

interface CanonicalDictionaryContext {
  propIndex: Map<string, string>
  emitIndex: Map<string, string>
  props: Record<string, PropEntry>
  emits: Record<string, EmitEntry>
  propSequence: number
  emitSequence: number
}

const STRUCTURAL_PROP_NAMES = new Set(['type', 'id', 'children'])

const CRUD_EVENT_PROP_NAMES = ['onAddRow', 'onEditRow', 'onRemoveRow'] as const
const ROW_EVENT_PROP_NAMES = ['onRowClick', 'onSelectionChange', 'onCurrentChange'] as const
const VISIBILITY_EVENT_PROP_NAMES = ['onOpen', 'onClose', 'onOpened', 'onClosed'] as const

const LOW_SIGNAL_ENUM_VARIANTS = new Set([
  'undefined',
  'null',
  'string',
  'number',
  'boolean',
  'object',
  'unknown',
  'any',
  'never',
  'void',
])

const GOVERNANCE_CONTRACTS: Record<string, GovernanceContract> = {
  'spark:props:component-base': {
    layer: 'props',
    description: '组件基础属性契约（统一 type / id 语义）',
    members: ['type', 'id'],
  },
  'spark:props:children': {
    layer: 'props',
    description: '子节点契约（统一 children 结构语义）',
    members: ['children'],
  },
  'spark:props:table-model': {
    layer: 'props',
    description: 'DataKey 模型契约（统一 dataKey 数据绑定入口）',
    members: ['dataKey'],
  },
  'spark:events:crud': {
    layer: 'events',
    description: '数据容器 CRUD 事件契约',
    members: [...CRUD_EVENT_PROP_NAMES],
  },
  'spark:events:row-interaction': {
    layer: 'events',
    description: '行交互事件契约',
    members: [...ROW_EVENT_PROP_NAMES],
  },
  'spark:events:visibility': {
    layer: 'events',
    description: '可见性生命周期事件契约',
    members: [...VISIBILITY_EVENT_PROP_NAMES],
  },
  'spark:api:base-container': {
    layer: 'api',
    description: '基础数据容器 API 契约（Table/Form/Detail/List）',
    members: ['getDataSource', 'getCurrentRow', 'refresh', 'addRow', 'editRowById', 'removeRow'],
  },
  'spark:api:base-crud': {
    layer: 'api',
    description: '基础 CRUD API 契约（Tree 等扩展容器）',
    members: ['getDataSource', 'addRow', 'editRowById', 'removeRow'],
  },
  'spark:api:visibility': {
    layer: 'api',
    description: '可见性容器 API 契约（Dialog/Drawer）',
    members: ['open', 'close', 'isVisible', 'toggle'],
  },
}

const DEFAULT_CONSTRAINTS: ComponentCatalog['constraints'] = {
  dataKeyPattern: String.raw`^(#[\w-]+@)?[\w-]+@([\w-]+@)?(rows|currentRow|selectedRows|summaryRow|selectionSummaryRow)(\.[\w.]+)?$`,
  htmlTypes: ['div', 'span', 'p', 'a', 'img', 'ul', 'li'],
  validTypePrefixes: ['r-', 'el-', 'Render', 'spark-'],
  validAggregateTypes: ['sum', 'count', 'avg', 'min', 'max', 'join'],
  nonFieldRTypes: ['r-table', 'r-form', 'r-detail', 'r-tree', 'r-list'],
  containerContextMap: {
    'r-table': 'table',
    'r-form': 'form',
    'r-detail': 'detail',
    'r-tree': 'tree',
    'r-list': 'list',
  },
  nestingRules: {},
}

function createSchemaPoolContext(): SchemaPoolContext {
  return {
    index: new Map<string, string>(),
    pool: {},
    sequence: 0,
  }
}

function createCanonicalDictionaryContext(): CanonicalDictionaryContext {
  return {
    propIndex: new Map<string, string>(),
    emitIndex: new Map<string, string>(),
    props: {},
    emits: {},
    propSequence: 0,
    emitSequence: 0,
  }
}

function allocCanonicalPropKey(context: CanonicalDictionaryContext): string {
  context.propSequence += 1
  return `prop_${String(context.propSequence).padStart(5, '0')}`
}

function allocCanonicalEmitKey(context: CanonicalDictionaryContext): string {
  context.emitSequence += 1
  return `emit_${String(context.emitSequence).padStart(5, '0')}`
}

function allocSchemaKey(context: SchemaPoolContext): string {
  context.sequence += 1
  return `schema_${String(context.sequence).padStart(5, '0')}`
}

function pushUnique(target: string[], value: string): void {
  if (!target.includes(value)) target.push(value)
}

function inferCategory(filePath: string, explicitCategory?: string): ComponentEntry['category'] {
  if (explicitCategory === 'container' || explicitCategory === 'field' || explicitCategory === 'group' || explicitCategory === 'meta' || explicitCategory === 'feature') {
    return explicitCategory
  }

  if (filePath.includes('/components/containers/')) return 'container'
  if (filePath.includes('/components/fields/')) return 'field'
  if (filePath.includes('/features/')) return 'feature'
  return 'feature'
}

function inferBinding(props: PropEntry[]): CatalogBindingDescriptor | undefined {
  const names = new Set(props.map((prop) => prop.name))
  const descriptor: CatalogBindingDescriptor = {}

  if (names.has('dataKey')) {
    descriptor.selfResolving = true
    descriptor.dataContainer = true
  }
  if (names.has('field')) descriptor.fieldProvider = true
  if (names.has('options') || names.has('optionKey')) descriptor.hasOptions = true

  const modelValue = props.find((prop) => prop.name === 'modelValue')
  if (modelValue?.type.includes('boolean') === true) descriptor.valueType = 'boolean'
  else if (modelValue?.type.includes('[]') === true || modelValue?.type.includes('Array') === true) descriptor.valueType = 'array'
  else if (modelValue !== undefined) descriptor.valueType = 'string'

  if (names.has('field')) descriptor.bindingDelegate = 'form-element'
  if (names.has('dataKey') && names.has('children')) descriptor.bindingDelegate = 'table'

  return Object.keys(descriptor).length > 0 ? descriptor : undefined
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

function shouldRetainSchema(schema: PropSchema): boolean {
  if (schema.kind === 'enum') {
    const hasLiteralVariant = schema.variants.some((variant) =>
      /^".*"$/.test(variant) || /^'.*'$/.test(variant),
    )
    if (!hasLiteralVariant) {
      return !schema.variants.every((variant) => LOW_SIGNAL_ENUM_VARIANTS.has(variant))
    }
  }
  return true
}

function resolveSchemaRef(
  context: SchemaPoolContext,
  schema: PropSchema,
  identityKey?: string,
): string {
  const dedupeKey = identityKey !== undefined
    ? `identity:${identityKey}`
    : `schema:${stableStringify(schema)}`

  const existing = context.index.get(dedupeKey)
  if (existing !== undefined) return existing

  const ref = allocSchemaKey(context)
  context.index.set(dedupeKey, ref)
  context.pool[ref] = schema
  return ref
}

function compactProps(rawProps: PropEntryWithMeta[], schemaPool: SchemaPoolContext): PropEntry[] {
  const result: PropEntry[] = []

  for (const prop of rawProps) {
    if (STRUCTURAL_PROP_NAMES.has(prop.name)) continue

    const compacted: PropEntry = {
      name: prop.name,
      type: prop.type,
      required: prop.required,
      ...(prop.default !== undefined ? { default: prop.default } : {}),
      ...(prop.description !== undefined ? { description: prop.description } : {}),
    }

    if (prop.schema !== undefined) {
      const isExternalObjectSchema = prop.schema.kind === 'object' && prop.__schemaOwner === 'external'
      if (!isExternalObjectSchema && shouldRetainSchema(prop.schema)) {
        compacted.schemaRef = resolveSchemaRef(schemaPool, prop.schema, prop.__schemaIdentityKey)
      }
    }

    result.push(compacted)
  }

  return result
}

function compactEmits(rawEmits: EmitEntry[], schemaPool: SchemaPoolContext): EmitEntry[] {
  const result: EmitEntry[] = []

  for (const emit of rawEmits) {
    const compacted: EmitEntry = {
      name: emit.name,
      ...(emit.type !== undefined ? { type: emit.type } : {}),
      ...(emit.description !== undefined ? { description: emit.description } : {}),
    }

    if (emit.schema !== undefined && emit.schema.length > 0) {
      const refs: string[] = []
      for (const schema of emit.schema) {
        if (!shouldRetainSchema(schema)) continue
        refs.push(resolveSchemaRef(schemaPool, schema))
      }
      if (refs.length > 0) compacted.schemaRefs = [...new Set(refs)]
    }

    result.push(compacted)
  }

  return result
}

function getCanonicalPropRef(context: CanonicalDictionaryContext, prop: PropEntry): string {
  const key = stableStringify(prop)
  const existing = context.propIndex.get(key)
  if (existing !== undefined) return existing

  const ref = allocCanonicalPropKey(context)
  context.propIndex.set(key, ref)
  context.props[ref] = prop
  return ref
}

function getCanonicalEmitRef(context: CanonicalDictionaryContext, emit: EmitEntry): string {
  const key = stableStringify(emit)
  const existing = context.emitIndex.get(key)
  if (existing !== undefined) return existing

  const ref = allocCanonicalEmitKey(context)
  context.emitIndex.set(key, ref)
  context.emits[ref] = emit
  return ref
}

function toCanonicalComponent(
  entry: ComponentEntry,
  propRefs: string[],
  emitRefs: string[],
): CatalogCanonicalComponent {
  return {
    type: entry.type,
    category: entry.category,
    description: entry.description,
    ...(entry.filePath !== undefined ? { filePath: entry.filePath } : {}),
    propRefs,
    emitRefs,
    source: entry.source,
    ...(entry.binding !== undefined ? { binding: entry.binding } : {}),
    ...(entry.contracts !== undefined ? { contracts: entry.contracts } : {}),
    ...(entry.provides !== undefined ? { provides: entry.provides } : {}),
    ...(entry.consumes !== undefined ? { consumes: entry.consumes } : {}),
    ...(entry.notes !== undefined ? { notes: entry.notes } : {}),
  }
}

function hasAny(names: Set<string>, expected: readonly string[]): boolean {
  return expected.some((name) => names.has(name))
}

function inferApiContracts(type: string): string[] {
  const result: string[] = []
  if (type === 'r-table' || type === 'r-form' || type === 'r-detail' || type === 'r-list') {
    result.push('spark:api:base-container')
  }
  if (type === 'r-tree') {
    result.push('spark:api:base-crud')
  }
  if (type === 'r-dialog' || type === 'r-drawer') {
    result.push('spark:api:visibility')
  }
  return result
}

function inferContracts(type: string, rawProps: PropEntryWithMeta[]): ComponentContractRefs | undefined {
  const names = new Set(rawProps.map((prop) => prop.name))

  const propContracts: string[] = []
  const eventContracts: string[] = []
  const apiContracts = inferApiContracts(type)

  if (names.has('type') || names.has('id')) propContracts.push('spark:props:component-base')
  if (names.has('children')) propContracts.push('spark:props:children')
  if (names.has('dataKey')) propContracts.push('spark:props:table-model')

  if (hasAny(names, CRUD_EVENT_PROP_NAMES)) eventContracts.push('spark:events:crud')
  if (hasAny(names, ROW_EVENT_PROP_NAMES)) eventContracts.push('spark:events:row-interaction')
  if (hasAny(names, VISIBILITY_EVENT_PROP_NAMES)) eventContracts.push('spark:events:visibility')

  const contracts: ComponentContractRefs = {
    ...(propContracts.length > 0 ? { props: propContracts } : {}),
    ...(eventContracts.length > 0 ? { events: eventContracts } : {}),
    ...(apiContracts.length > 0 ? { api: apiContracts } : {}),
  }

  return Object.keys(contracts).length > 0 ? contracts : undefined
}

function collectGovernanceFromComponents(components: Record<string, ComponentEntry>) {
  const usedContractIds = new Set<string>()

  for (const component of Object.values(components)) {
    for (const id of component.contracts?.props ?? []) usedContractIds.add(id)
    for (const id of component.contracts?.events ?? []) usedContractIds.add(id)
    for (const id of component.contracts?.api ?? []) usedContractIds.add(id)
  }

  const contracts: Record<string, GovernanceContract> = {}
  for (const id of usedContractIds) {
    const def = GOVERNANCE_CONTRACTS[id]
    if (def !== undefined) contracts[id] = def
  }

  return Object.keys(contracts).length > 0 ? { contracts } : undefined
}

function buildSortedComponents(
  root: string,
  files: string[],
  includeGlobalProps: boolean,
  tsconfigPath: string,
  checkerOptions: VcmCheckerOptions,
) {
  const checker = getOrCreateChecker(resolve(root, tsconfigPath).replace(/\\/g, '/'), checkerOptions)

  const components: Record<string, ComponentEntry> = {}
  const registry: ComponentRegistry = {
    containers: [],
    fields: [],
    groups: [],
    meta: [],
  }
  const bindingDescriptors: Record<string, CatalogBindingDescriptor> = {}
  const schemaPool = createSchemaPoolContext()
  const canonical = createCanonicalDictionaryContext()
  const canonicalComponents: Record<string, CatalogCanonicalComponent> = {}

  const sortedFiles = [...files].sort((a, b) => a.localeCompare(b))

  for (const file of sortedFiles) {
    const abs = resolve(root, file)
    const type = inferSkillType(abs, toKebabCase(basename(file, '.vue')))
    if (type === null) continue

    const vcmApi = extractComponentApiVcm(checker, abs, file, type, { includeGlobalProps })
    if (vcmApi === null) continue

    const rawProps = vcmApi.props as PropEntryWithMeta[]
    const skillMeta = parseSkillMeta(abs, type)
    const explicitSkillMeta = parseSkillMeta(abs, type, { requireSkillTag: true })
    const normalizedFilePath = normalizePath(vcmApi.filePath)
    const category = inferCategory(normalizedFilePath, skillMeta?.category)

    const props = compactProps(rawProps, schemaPool)
    const emits = compactEmits(vcmApi.emits, schemaPool)
    const binding = inferBinding(props)
    const contracts = inferContracts(type, rawProps)

    const entry: ComponentEntry = {
      type,
      filePath: normalizedFilePath,
      category,
      description: skillMeta?.description ?? `SPARK 组件：${type}`,
      props,
      emits,
      source: explicitSkillMeta === null ? 'vcm' : 'vcm+meta',
      ...(binding !== undefined ? { binding } : {}),
      ...(contracts !== undefined ? { contracts } : {}),
      ...(skillMeta?.provides !== undefined ? { provides: skillMeta.provides } : {}),
      ...(skillMeta?.consumes !== undefined ? { consumes: skillMeta.consumes } : {}),
      ...(skillMeta?.notes !== undefined && skillMeta.notes.length > 0 ? { notes: skillMeta.notes.join('\n') } : {}),
    }

    components[type] = entry

    const propRefs = props.map((prop) => getCanonicalPropRef(canonical, prop))
    const emitRefs = emits.map((emit) => getCanonicalEmitRef(canonical, emit))
    canonicalComponents[type] = toCanonicalComponent(entry, propRefs, emitRefs)

    if (category === 'container') pushUnique(registry.containers, type)
    else if (category === 'field') pushUnique(registry.fields, type)
    else if (category === 'group') pushUnique(registry.groups, type)
    else if (category === 'meta') pushUnique(registry.meta, type)

    if (binding !== undefined) bindingDescriptors[type] = binding
  }

  registry.containers.sort()
  registry.fields.sort()
  registry.groups.sort()
  registry.meta.sort()

  return {
    components,
    registry,
    bindingDescriptors,
    schemaPool: schemaPool.pool,
    canonical: {
      dictionaries: {
        props: canonical.props,
        emits: canonical.emits,
      },
      components: canonicalComponents,
    } as CatalogCanonicalModel,
  }
}

export function generateJsonCatalog(root: string, options: JsonCatalogOptions = {}) {
  const {
    featurePatterns = [],
    exclude = [],
    tsconfigPath = 'tsconfig.catalog.json',
    includeGlobalProps = false,
    vcmCheckerOptions = {},
  } = options
  const patterns = ['./packages/spark-component/src/components/containers/**/Renderer*.vue',
    './packages/spark-component/src/components/fields/**/Field*.vue', ...featurePatterns]
  const files = patterns.flatMap(p => globSync(p, { cwd: root, absolute: false, ignore: exclude }))

  const {
    components,
    registry,
    bindingDescriptors,
    schemaPool,
    canonical,
  } = buildSortedComponents(root, files, includeGlobalProps, tsconfigPath, vcmCheckerOptions)

  const governance = collectGovernanceFromComponents(components)

  const catalog: ComponentCatalog = {
    version: '2.0.0',
    buildTime: new Date().toISOString(),
    componentCount: Object.keys(components).length,
    registry,
    sharedTypes: {},
    components,
    ...(Object.keys(schemaPool).length > 0 ? { schemaPool } : {}),
    constraints: DEFAULT_CONSTRAINTS,
    canonical,
    bindingDescriptors,
    ...(governance !== undefined ? { governance } : {}),
  }

  const outPath = resolve(root, 'packages/spark-ai/src/catalog/component-catalog.json')
  writeFileSync(outPath, JSON.stringify(catalog, null, 2), 'utf-8')
  logger.info(`📦 ${catalog.componentCount} 组件已写入`)
  return catalog
}

