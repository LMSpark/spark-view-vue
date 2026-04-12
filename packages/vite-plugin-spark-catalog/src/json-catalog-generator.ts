/**
 * 组件目录 JSON 生成器
 *
 * 从 vue-component-meta 类型解析 + SFC JSDoc 注解构建单一 component-catalog.json。
 * 纯 Node.js 模块，不依赖 Vite / Vue 运行时。
 *
 * @module json-catalog-generator
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { globSync } from 'glob'
import { getOrCreateChecker, extractComponentApiVcm } from './extract-component-api-vcm'
import type { VcmApiDescriptor } from './extract-component-api-vcm'
import {
  COMPONENT_CATEGORIES,
  SHARED_TYPE_DEFINITIONS,
} from './supplement'
import {
  toKebabCase,
  inferSkillType,
  buildImplicitSkillDescription,
  parseSkillMeta,
  createLogger,
} from './utils'
import type {
  ComponentCatalog,
  ComponentEntry,
  ComponentRegistry,
  PlatformConstraints,
  PropEntry,
  EmitEntry,
  PropSchema,
  ApiSurface,
} from './component-catalog-schema'
import { inferBindingFromVcm, buildAllBindingDescriptors } from './infer-binding'
import { extractApiSurface } from './extract-ts-api'
import type { SkillMeta } from './utils'

const logger = createLogger('spark-catalog-json')

/* --------------------------------------------------------------------------
 * 选项
 * ----------------------------------------------------------------------- */

export interface JsonCatalogOptions {
  /** Feature 组件的 glob 扫描模式（相对于 root） */
  featurePatterns?: string[] | undefined
  /** 排除模式 */
  exclude?: string[] | undefined
  /** 按组件输出独立 JSON 文件的目录（相对于 root），便于检查 */
  perComponentDir?: string | undefined
  /** vue-component-meta 使用的 tsconfig 路径（相对于 root），默认 tsconfig.catalog.json */
  tsconfigPath?: string | undefined
  /** 启用详细日志 */
  verbose?: boolean | undefined
}

/* --------------------------------------------------------------------------
 * 内部扫描（复用 catalog-generator 逻辑）
 * ----------------------------------------------------------------------- */

interface ScannedComponent {
  absolutePath: string
  relativePath: string
  skillType: string
  skillDescription: string
  skillMeta: SkillMeta | null
}

function scanRendererComponents(root: string): ScannedComponent[] {
  const patterns = [
    './packages/spark-component/src/components/containers/**/Renderer*.vue',
    './packages/spark-component/src/components/fields/**/Field*.vue',
  ]
  const results: ScannedComponent[] = []

  for (const pattern of patterns) {
    const files = globSync(pattern, { cwd: root, absolute: false })
    for (const file of files) {
      const absolutePath = resolve(root, file)
      if (!existsSync(absolutePath)) continue

      const fileName = basename(file, '.vue')
      const fallbackType = toKebabCase(fileName)
      const skillType = inferSkillType(absolutePath, fallbackType)
      if (skillType === null) continue

      const meta = parseSkillMeta(absolutePath, skillType)
      results.push({
        absolutePath,
        relativePath: file,
        skillType,
        skillDescription: meta?.description ?? buildImplicitSkillDescription(absolutePath, skillType),
        skillMeta: meta,
      })
    }
  }
  return results
}

function scanFeatureComponents(root: string, patterns: string[], exclude: string[]): ScannedComponent[] {
  const results: ScannedComponent[] = []
  for (const pattern of patterns) {
    const files = globSync(pattern, { cwd: root, absolute: false, ignore: exclude })
    for (const file of files) {
      const absolutePath = resolve(root, file)
      if (!existsSync(absolutePath)) continue

      const fileName = basename(file, '.vue')
      const fallbackType = toKebabCase(fileName)
      const meta = parseSkillMeta(absolutePath, fallbackType, { requireSkillTag: true })
      if (meta === null) {
        console.warn(`[catalog] 跳过 feature 组件（缺失 @skill 注解）: ${file}`)
        continue
      }

      results.push({
        absolutePath,
        relativePath: file,
        skillType: meta.type,
        skillDescription: meta.description,
        skillMeta: meta,
      })
    }
  }
  return results
}

/* --------------------------------------------------------------------------
 * 分类判定（目录推断 + SFC @category 覆盖）
 * ----------------------------------------------------------------------- */

function resolveCategory(
  skillType: string,
  relativePath: string,
  sfcCategory?: string,
): ComponentEntry['category'] {
  // 优先级 1：SFC @category 注解
  if (sfcCategory !== undefined) {
    const lower = sfcCategory.toLowerCase()
    if (lower === 'container') return 'container'
    if (lower === 'group') return 'group'
    if (lower === 'meta') return 'meta'
    if (lower === 'field') return 'field'
    if (lower === 'feature') return 'feature'
  }

  // 优先级 2：COMPONENT_CATEGORIES（el-* 等第三方组件显式分类）
  const explicitCat = COMPONENT_CATEGORIES[skillType]
  if (explicitCat === 'container') return 'container'
  if (explicitCat === 'group') return 'group'
  if (explicitCat === 'meta') return 'meta'

  // 优先级 3：目录结构推断
  const normalizedPath = relativePath.replace(/\\/g, '/')
  if (normalizedPath.includes('/containers/')) return 'container'
  if (normalizedPath.includes('/fields/')) return 'field'
  if (normalizedPath.includes('/display/')) return 'field'

  // 优先级 4：前缀约定
  if (skillType.startsWith('r-')) return 'field'
  return 'feature'
}

/* --------------------------------------------------------------------------
 * 平台约束
 * ----------------------------------------------------------------------- */

function buildPlatformConstraints(): PlatformConstraints {
  return {
    dataKeyPattern: String.raw`^(#[\w-]+@)?[\w-]+@([\w-]+@)?(rows|currentRow|selectedRows|summaryRow|selectionSummaryRow)(\.[\w.]+)?$`,
    htmlTypes: [
      'a', 'article', 'aside', 'b', 'blockquote', 'br', 'button', 'code', 'del',
      'details', 'div', 'em', 'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3',
      'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'input', 'label', 'li', 'main',
      'nav', 'ol', 'option', 'p', 'pre', 'section', 'select', 'small', 'span',
      'strong', 'summary', 'table', 'tbody', 'td', 'textarea', 'tfoot', 'th',
      'thead', 'tr', 'u', 'ul',
    ],
    validTypePrefixes: ['r-', 'el-', 'Render', 'spark-'],
    validAggregateTypes: ['sum', 'count', 'avg', 'min', 'max', 'join'],
    nonFieldRTypes: [
      'r-table', 'r-form', 'r-detail', 'r-list', 'r-tree',
      'r-tabs', 'r-collapse', 'r-dialog', 'r-drawer', 'r-steps', 'r-section', 'r-block',
      'r-column-group',
    ],
    containerContextMap: {
      'r-table': 'table',
      'r-form': 'form',
      'r-detail': 'detail',
      'r-list': 'list',
      'r-tree': 'tree',
    },
    nestingRules: {
      'el-table': {
        allowedChildren: ['el-table-column', 'Render*'],
        forbiddenChildren: ['r-*'],
        note: 'el-table 内只能用 el-table-column 或 Render* 函数',
      },
      'r-table': {
        allowedChildren: ['r-*', 'r-column-group'],
        forbiddenChildren: ['el-table-column'],
        note: 'r-table 内强制使用 r-* 字段组件，禁止 el-table-column',
      },
      'r-form': {
        allowedChildren: ['r-*'],
        note: 'r-form 内放 r-* 字段组件',
      },
      'r-detail': {
        allowedChildren: ['r-*'],
        note: 'r-detail 内放 r-* 字段组件',
      },
      'r-tabs': {
        allowedChildren: ['r-tab-pane'],
        note: 'r-tabs 内放 r-tab-pane',
      },
    },
  }
}

/* --------------------------------------------------------------------------
 * 核心：构建 ComponentEntry（h(type, props, children) 完全投影）
 * ----------------------------------------------------------------------- */

function buildComponentEntry(
  skillType: string,
  description: string,
  api: VcmApiDescriptor | null,
  relativePath: string,
  meta: SkillMeta | null,
): ComponentEntry {
  const category = resolveCategory(skillType, relativePath, meta?.category)

  // Props: VCM 提取 — h(type, props, children) 完全投影
  // 仅过滤框架内部 prop（config），其余全部保留
  const props: PropEntry[] = api !== null
    ? api.props
      .filter(p => p.name !== 'config')
      .map((p) => {
        const schemaIdentityKey = (p as PropEntryWithIdentity).__schemaIdentityKey
        const schemaOwner = (p as PropEntryWithOwnership).__schemaOwner
        return {
          name: p.name,
          type: p.type,
          required: p.required,
          ...(p.default !== undefined ? { default: p.default } : {}),
          ...(p.description !== undefined ? { description: p.description } : {}),
          ...(p.schema !== undefined ? { schema: p.schema } : {}),
          ...(schemaIdentityKey !== undefined ? { __schemaIdentityKey: schemaIdentityKey } : {}),
          ...(schemaOwner !== undefined ? { __schemaOwner: schemaOwner } : {}),
        }
      })
    : []

  // Emits: VCM 格式（type + schema，无 payload）
  const emits: EmitEntry[] = api?.emits ?? []

  const notes = meta?.notes !== undefined && meta.notes.length > 0
    ? meta.notes.join('\n')
    : undefined

  // Provides / Consumes from SFC @provides / @consumes
  const provides = meta?.provides !== undefined && meta.provides.length > 0 ? meta.provides : undefined
  const consumes = meta?.consumes !== undefined && meta.consumes.length > 0 ? meta.consumes : undefined

  // Source
  const hasVcm = api !== null
  const hasSfcMeta = meta !== null
  let source: ComponentEntry['source']
  if (hasVcm && hasSfcMeta) source = 'vcm+meta'
  else if (hasVcm) source = 'vcm'
  else source = 'meta'

  return {
    type: skillType,
    ...(api?.filePath !== undefined ? { filePath: api.filePath } : {}),
    category,
    description,
    props,
    emits,
    ...(api?.hasIndexSignature !== undefined ? { hasIndexSignature: api.hasIndexSignature } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(provides !== undefined ? { provides } : {}),
    ...(consumes !== undefined ? { consumes } : {}),
    source,
    ...(() => {
      const b = inferBindingFromVcm(skillType, props, category, meta?.binding)
      return b !== undefined ? { binding: b } : {}
    })(),
  }
}

function buildComponents(
  apiMap: Map<string, VcmApiDescriptor>,
  descriptionMap: Map<string, string>,
  metaMap: Map<string, SkillMeta | null>,
  pathMap: Map<string, string>,
): Record<string, ComponentEntry> {
  const components: Record<string, ComponentEntry> = {}

  // 1. 已扫描组件（有 VCM 或 SkillMeta）
  const allKeys = new Set([...apiMap.keys(), ...metaMap.keys()])
  for (const key of allKeys) {
    const api = apiMap.get(key) ?? null
    const desc = descriptionMap.get(key) ?? ''
    const meta = metaMap.get(key) ?? null
    const relPath = pathMap.get(key) ?? ''
    components[key] = buildComponentEntry(key, desc, api, relPath, meta)
  }

  return components
}

function buildRegistry(components: Record<string, ComponentEntry>): ComponentRegistry {
  const registry: ComponentRegistry = {
    containers: [],
    fields: [],
    groups: [],
    meta: [],
  }

  for (const [key, entry] of Object.entries(components)) {
    if (entry.category === 'container') registry.containers.push(key)
    else if (entry.category === 'field') registry.fields.push(key)
    else if (entry.category === 'group') registry.groups.push(key)
    else if (entry.category === 'meta') registry.meta.push(key)
  }

  registry.containers.sort()
  registry.fields.sort()
  registry.groups.sort()
  registry.meta.sort()

  return registry
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
  return `{${entries.join(',')}}`
}

interface CompactSchemasResult {
  components: Record<string, ComponentEntry>
  schemaPool: Record<string, PropSchema>
}

type PropEntryWithIdentity = PropEntry & { __schemaIdentityKey?: string }

const SYSTEM_OBJECT_TYPES = new Set([
  'Date',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'FocusEvent',
  'InputEvent',
  'SubmitEvent',
  'PointerEvent',
  'WheelEvent',
  'DragEvent',
  'TouchEvent',
  'CompositionEvent',
  'CSSProperties',
  'CSSStyleDeclaration',
  'File',
  'Blob',
  'FormData',
  'URL',
])

type SchemaOwner = 'workspace' | 'external'

type PropEntryWithOwnership = PropEntryWithIdentity & { __schemaOwner?: SchemaOwner }

const INTERNAL_TYPE_ALIAS_SCHEMAS: Record<string, PropSchema> = {
  SparkTextChild: {
    kind: 'enum',
    type: 'SparkTextChild',
    variants: ['string', 'number'],
  },
  RendererFooterConfigProps: {
    kind: 'object',
    type: 'RendererFooterConfigProps',
    properties: {
      class: {
        name: 'class',
        type: 'string',
        required: false,
      },
      width: {
        name: 'width',
        type: 'string | number',
        required: false,
      },
    },
  },
}

function includesTypeToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`).test(text)
}

function schemaMentionsType(schema: PropSchema, typeName: string): boolean {
  if (includesTypeToken(schema.type, typeName)) return true

  if (schema.kind === 'object') {
    return Object.values(schema.properties).some((property) => includesTypeToken(property.type, typeName))
  }
  if (schema.kind === 'array') {
    return schema.itemTypes.some((itemType) => includesTypeToken(itemType, typeName))
  }
  if (schema.kind === 'event') {
    return schema.paramTypes.some((paramType) => includesTypeToken(paramType, typeName))
  }
  return schema.variants.some((variant) => includesTypeToken(variant, typeName))
}

function isSystemObjectType(typeName: string): boolean {
  const normalized = typeName.trim()
  if (SYSTEM_OBJECT_TYPES.has(normalized)) return true
  return /^((Mouse|Keyboard|Focus|Pointer|Touch|Wheel|Input|Drag|Composition)Event)$/.test(normalized)
}

function isLikelyInternalStructuredType(typeName: string): boolean {
  const normalized = typeName.trim()
  if (normalized.length === 0) return false

  return (
    /^I[A-Z]/.test(normalized)
    || /^Spark[A-Z]/.test(normalized)
    || normalized.endsWith("Children")
    || normalized.endsWith("Node")
    || /(Policy|Context)$/.test(normalized)
  )
}

function shouldKeepStructuredSchema(schema: PropSchema, owner: SchemaOwner | undefined): boolean {
  if (schema.kind !== 'object' && schema.kind !== 'array') return false
  if (owner === 'workspace') return true
  if (owner === 'external') return false
  return !isSystemObjectType(schema.type) && isLikelyInternalStructuredType(schema.type)
}

function compactComponentSchemas(
  components: Record<string, ComponentEntry>,
  discoveredSchemas?: PropSchema[],
): CompactSchemasResult {
  const schemaPool: Record<string, PropSchema> = {}
  const schemaIdByLookup = new Map<string, string>()
  const schemaHashById = new Map<string, string>()
  const pickTypeBasedSchemaId = (schema: PropSchema): string => {
    const typeName = schema.type.trim()
    return typeName.length > 0 ? typeName : 'schema'
  }

  const resolveSchemaIdCollision = (candidate: string, hash: string): string => {
    const existingHash = schemaHashById.get(candidate)
    if (existingHash === undefined || existingHash === hash) return candidate

    for (let suffix = 2; ; suffix += 1) {
      const nextCandidate = `${candidate}#${suffix}`
      const nextHash = schemaHashById.get(nextCandidate)
      if (nextHash === undefined || nextHash === hash) return nextCandidate
    }
  }

  const registerSchema = (schema: PropSchema, identityKey?: string): string => {
    const hash = stableStringify(schema)
    const lookupKeys = [
      `hash:${hash}`,
      ...(identityKey !== undefined ? [`identity:${identityKey}`] : []),
    ]

    for (const lookupKey of lookupKeys) {
      const existing = schemaIdByLookup.get(lookupKey)
      if (existing !== undefined) return existing
    }

    const schemaId = resolveSchemaIdCollision(pickTypeBasedSchemaId(schema), hash)

    for (const lookupKey of lookupKeys) {
      schemaIdByLookup.set(lookupKey, schemaId)
    }
    schemaHashById.set(schemaId, hash)
    schemaPool[schemaId] = schema
    return schemaId
  }

  const compactedComponents: Record<string, ComponentEntry> = {}
  for (const [type, entry] of Object.entries(components)) {
    const props: PropEntry[] = entry.props.map((prop) => {
      const propWithIdentity = prop as PropEntryWithOwnership
      const inlineSchema = prop.schema
      if (inlineSchema === undefined) return prop

      const {
        schema: _dropped,
        __schemaIdentityKey: _identity,
        __schemaOwner: _owner,
        ...rest
      } = propWithIdentity
      if (shouldKeepStructuredSchema(inlineSchema, propWithIdentity.__schemaOwner)) {
        return {
          ...rest,
          schemaRef: registerSchema(
            inlineSchema,
            inlineSchema.kind === 'object' ? propWithIdentity.__schemaIdentityKey : undefined,
          ),
        }
      }
      return rest
    })

    const emits: EmitEntry[] = entry.emits.map((emit) => {
      const inlineSchemas = emit.schema
      if (inlineSchemas === undefined) return emit

      const { schema: _dropped, ...rest } = emit
      const structuredSchemas = inlineSchemas.filter((s) => shouldKeepStructuredSchema(s, undefined))
      if (structuredSchemas.length === 0) return rest

      return {
        ...rest,
        schemaRefs: structuredSchemas.map((schema) => registerSchema(schema)),
      }
    })

    compactedComponents[type] = {
      ...entry,
      props,
      emits,
    }
  }

  // 补充内部类型别名：当现有 schema 文本引用了别名类型时，注入对应 schema 条目。
  for (const [typeName, schema] of Object.entries(INTERNAL_TYPE_ALIAS_SCHEMAS)) {
    const isReferenced = Object.values(schemaPool).some((poolSchema) => schemaMentionsType(poolSchema, typeName))
    if (isReferenced) {
      registerSchema(schema)
    }
  }

  // 注册从 VCM schema 树中递归发现的嵌套 object schema（如 FilterItemConfig），
  // 仅当某个 prop 的 type 文本确实引用了该类型名时才加入 schemaPool 并建立 schemaRef 链接。
  if (discoveredSchemas !== undefined) {
    // 按类型名去重，优先保留属性更多的定义
    type ObjectPropSchema = Extract<PropSchema, { kind: 'object' }>
    const candidatesByType = new Map<string, ObjectPropSchema>()
    for (const schema of discoveredSchemas) {
      if (schema.kind !== 'object') continue
      const typeName = schema.type.trim()
      if (typeName.length === 0 || typeName.startsWith('{') || isSystemObjectType(typeName)) continue
      const existing = candidatesByType.get(typeName)
      if (existing === undefined || Object.keys(schema.properties).length > Object.keys(existing.properties).length) {
        candidatesByType.set(typeName, schema)
      }
    }

    for (const [typeName, schema] of candidatesByType) {
      // 检查是否有至少一个 prop 的 type 文本引用该类型名
      let linked = false
      for (const entry of Object.values(compactedComponents)) {
        for (const prop of entry.props) {
          if (prop.schemaRef !== undefined) continue
          if (includesTypeToken(prop.type, typeName)) {
            if (!linked) {
              registerSchema(schema)
              linked = true
            }
            prop.schemaRef = typeName
          }
        }
      }
    }
  }

  return {
    components: compactedComponents,
    schemaPool,
  }
}

function buildCatalogDocument(
  components: Record<string, ComponentEntry>,
  apiSurface?: ApiSurface,
  discoveredSchemas?: PropSchema[],
): ComponentCatalog {
  const compacted = compactComponentSchemas(components, discoveredSchemas)

  return {
    version: '2.0.0',
    buildTime: new Date().toISOString(),
    componentCount: Object.keys(compacted.components).length,
    registry: buildRegistry(compacted.components),
    sharedTypes: SHARED_TYPE_DEFINITIONS,
    components: compacted.components,
    schemaPool: compacted.schemaPool,
    ...(apiSurface !== undefined ? { apiSurface } : {}),
    constraints: buildPlatformConstraints(),
    bindingDescriptors: buildAllBindingDescriptors(compacted.components),
  }
}

/* --------------------------------------------------------------------------
 * 公共 API
 * ----------------------------------------------------------------------- */

/**
 * 生成单文件 component-catalog.json（rich catalog）并写入文件
 */
export function generateJsonCatalog(root: string, options: JsonCatalogOptions = {}): ComponentCatalog {
  const {
    featurePatterns = [],
    exclude = [],
    tsconfigPath = 'tsconfig.catalog.json',
    verbose = false,
  } = options

  // 1. 扫描组件
  const renderers = scanRendererComponents(root)
  const features = scanFeatureComponents(root, featurePatterns, exclude)
  if (verbose) {
    logger.info(`🔬 Renderer: ${renderers.length}, Feature: ${features.length}`)
  }

  // 2. VCM 提取（vue-component-meta 完整类型解析）
  const tsconfigAbsolute = resolve(root, tsconfigPath).replace(/\\/g, '/')
  const checker = getOrCreateChecker(tsconfigAbsolute)
  const apiMap = new Map<string, VcmApiDescriptor>()
  for (const comp of [...renderers, ...features]) {
    const api = extractComponentApiVcm(
      checker,
      comp.absolutePath,
      comp.relativePath,
      comp.skillType,
    )
    if (api !== null) apiMap.set(comp.skillType, api)
  }

  const descriptionMap = new Map<string, string>()
  const metaMap = new Map<string, SkillMeta | null>()
  const pathMap = new Map<string, string>()

  // 从扫描结果收集描述、元数据、路径
  for (const comp of [...renderers, ...features]) {
    descriptionMap.set(comp.skillType, comp.skillDescription)
    metaMap.set(comp.skillType, comp.skillMeta)
    pathMap.set(comp.skillType, comp.relativePath)
  }

  const components = buildComponents(apiMap, descriptionMap, metaMap, pathMap)

  // 收集所有 VCM 结果中递归发现的嵌套 object schema
  const allDiscoveredSchemas: PropSchema[] = []
  for (const vcm of apiMap.values()) {
    allDiscoveredSchemas.push(...vcm.discoveredSchemas)
  }

  // 3. API 全息表面提取（DataView / DataSet / SparkData / IScriptContext / IPageServiceCapability）
  const apiSurface = extractApiSurface(root)

  const catalog = buildCatalogDocument(components, apiSurface, allDiscoveredSchemas)

  logger.info(`📦 组件目录已构建: ${catalog.componentCount} 条目`)

  const catalogOutputPath = resolve(root, 'packages/spark-ai/src/catalog/component-catalog.json')
  writeFileSync(catalogOutputPath, JSON.stringify(catalog, null, 2), 'utf-8')
  logger.info(`📄 Catalog JSON 已写入: ${catalogOutputPath}`)

  // 按组件输出独立 JSON（便于逐一检查，仅在显式指定 perComponentDir 时）
  if (options.perComponentDir !== undefined) {
    const dirAbsolute = resolve(root, options.perComponentDir)
    if (!existsSync(dirAbsolute)) mkdirSync(dirAbsolute, { recursive: true })
    for (const [key, entry] of Object.entries(catalog.components)) {
      const filePath = resolve(dirAbsolute, `${key}.json`)
      writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8')
    }
    logger.info(`📂 按组件独立 JSON 已输出: ${options.perComponentDir}/ (${catalog.componentCount} 文件)`)
  }

  return catalog
}

/* --------------------------------------------------------------------------
 * DevSystem Rule Editor 目录生成
 * ----------------------------------------------------------------------- */
