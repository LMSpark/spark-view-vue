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
  CATALOG_OVERRIDES,
  CATALOG_ADDENDUMS,
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
  RawComponentCatalog,
  RawComponentEntry,
  PlatformConstraints,
  PropEntry,
  EmitEntry,
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
      if (fileName === 'FieldContextRenderer') continue

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
      const meta = parseSkillMeta(absolutePath, toKebabCase(fileName))
      if (meta === null) continue

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
 * 从 override 文本解析根级字段
 * ----------------------------------------------------------------------- */

/**
 * 匹配 override 文本中的字段行：`name: type — description`
 *
 * 支持两种格式：
 * 1. 【根级字段 — XXX】段落内的行（r-table 等）
 * 2. 扁平行格式（r-form, r-dialog 等没有段落标记的容器）
 *
 * 排除 `【xxx】` 标题行、空行、纯说明行（不含 `: ` 分隔符的行）
 */
function parseRootFieldsFromOverride(overrideText: string): ComponentEntry['rootFields'] {
  const fields: NonNullable<ComponentEntry['rootFields']> = []

  // 策略 1：有 【根级字段】 段落标记 → 只从这些段落提取
  const rootFieldSections = [...overrideText.matchAll(/【根级字段[^】]*】\n([\s\S]*?)(?=\n【|$)/g)]
  if (rootFieldSections.length > 0) {
    for (const section of rootFieldSections) {
      parseFieldLines(section[1] ?? '', fields)
    }
    return fields.length > 0 ? fields : undefined
  }

  // 策略 2：无段落标记 → 从全文的 **title** 标题行之后逐行解析
  // 跳过首行（**type** — 描述）、【xxx】标题行、纯说明行
  const lines = overrideText.split('\n')
  let pastTitle = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (!pastTitle) {
      // 跳过 **xxx** 标题行
      if (trimmed.startsWith('**')) { pastTitle = true; continue }
      continue
    }
    // 跳过段落标题、空行
    if (trimmed === '' || trimmed.startsWith('【')) continue
    // 跳过纯文字说明行（不含 `: ` 的行）
    if (!trimmed.includes(': ')) continue
    // 跳过 children/consumes/provides 说明行
    if (/^(?:children|consumes|provides)\b/i.test(trimmed)) continue

    parseFieldLine(trimmed, fields)
  }

  return fields.length > 0 ? fields : undefined
}

/** 解析多行字段文本 */
function parseFieldLines(text: string, fields: NonNullable<ComponentEntry['rootFields']>): void {
  const lines = text.split('\n').filter(l => l.trim() !== '')
  for (const line of lines) {
    parseFieldLine(line.trim(), fields)
  }
}

/**
 * 解析单行字段定义：`name: type — description` 或 `name: type`
 * 类型允许含 `|` 和空格（如 `number | string`、`'left' | 'right'`）
 */
function parseFieldLine(trimmed: string, fields: NonNullable<ComponentEntry['rootFields']>): void {
  // 增强正则：name 后跟 `: ` 再跟类型（可含空格和管道符），可选 ` — ` 描述
  const match = /^([\w$.[\]]+):\s+(.+?)(?:\s+—\s+(.+))?$/.exec(trimmed)
  if (match === null) return

  const name = match[1] ?? ''
  let type = match[2] ?? 'unknown'
  const description = match[3] ?? ''

  // 类型中可能残留描述（无 — 分隔时），取第一个有意义的类型 token
  // 例如 "string 筛选区 CSS 类名" → 实际有 — 分隔的不会走到这里
  if (description === '' && /\s/.test(type)) {
    // 无描述时，type 不应含空格（除非是联合类型 `number | string`）
    if (!/[|'"]/.test(type)) {
      // 不是联合类型，截取第一个 token
      const spaceIdx = type.indexOf(' ')
      if (spaceIdx > 0) type = type.substring(0, spaceIdx)
    }
  }

  if (name !== '') {
    fields.push({ name, type, description })
  }
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
  hasOverride: boolean,
  hasAddendum: boolean,
): ComponentEntry {
  const category = resolveCategory(skillType, relativePath, meta?.category)
  const overrideText = CATALOG_OVERRIDES[skillType]
  const addendumText = CATALOG_ADDENDUMS[skillType]

  // Props: VCM 提取 — h(type, props, children) 完全投影
  // 仅过滤框架内部 prop（config），其余全部保留
  const props: PropEntry[] = api !== null
    ? api.props
      .filter(p => p.name !== 'config')
      .map(p => ({
        name: p.name,
        type: p.type,
        required: p.required,
        ...(p.default !== undefined ? { default: p.default } : {}),
        ...(p.description !== undefined ? { description: p.description } : {}),
        ...(p.schema !== undefined ? { schema: p.schema } : {}),
      }))
    : []

  // Emits: VCM 格式（type + schema，无 payload）
  const emits: EmitEntry[] = api?.emits ?? []

  // Root fields from override text
  const rootFields = hasOverride && overrideText !== undefined
    ? parseRootFieldsFromOverride(overrideText)
    : undefined

  // Notes: 合并 SFC @notes + override + addendum
  let notes: string | undefined
  if (meta?.notes !== undefined && meta.notes.length > 0) {
    notes = meta.notes.join('\n')
  }
  if (hasOverride && overrideText !== undefined) {
    notes = notes !== undefined ? `${notes}\n\n${overrideText}` : overrideText
  }
  if (hasAddendum && addendumText !== undefined) {
    notes = notes !== undefined ? `${notes}\n\n${addendumText}` : addendumText
  }

  // Provides / Consumes from SFC @provides / @consumes
  const provides = meta?.provides !== undefined && meta.provides.length > 0 ? meta.provides : undefined
  const consumes = meta?.consumes !== undefined && meta.consumes.length > 0 ? meta.consumes : undefined

  // Source
  const hasVcm = api !== null
  const hasSfcMeta = meta !== null
  let source: ComponentEntry['source']
  if (hasVcm && (hasOverride || hasSfcMeta)) source = 'vcm+override'
  else if (hasVcm) source = 'vcm'
  else if (hasOverride || hasSfcMeta) source = 'override'
  else source = 'override' // fallback for pure-text entries

  return {
    type: skillType,
    category,
    description,
    props,
    emits,
    ...(rootFields !== undefined ? { rootFields } : {}),
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
    const hasOverride = key in CATALOG_OVERRIDES
    const hasAddendum = key in CATALOG_ADDENDUMS
    components[key] = buildComponentEntry(key, desc, api, relPath, meta, hasOverride, hasAddendum)
  }

  // 2. CATALOG_OVERRIDES 中的纯文本条目（el-* 等无 SFC 的组件）
  for (const key of Object.keys(CATALOG_OVERRIDES)) {
    if (key in components) continue
    const desc = descriptionMap.get(key) ?? extractDescriptionFromOverride(key)
    components[key] = buildComponentEntry(key, desc, null, '', null, true, key in CATALOG_ADDENDUMS)
  }

  // 3. CATALOG_ADDENDUMS 中的纯补充条目
  for (const key of Object.keys(CATALOG_ADDENDUMS)) {
    if (key in components) continue
    const desc = descriptionMap.get(key) ?? ''
    components[key] = buildComponentEntry(key, desc, null, '', null, false, true)
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

function buildCatalogDocument(
  components: Record<string, ComponentEntry>,
  apiSurface?: ApiSurface,
): ComponentCatalog {
  return {
    version: '2.0.0',
    buildTime: new Date().toISOString(),
    componentCount: Object.keys(components).length,
    registry: buildRegistry(components),
    sharedTypes: SHARED_TYPE_DEFINITIONS,
    components,
    ...(apiSurface !== undefined ? { apiSurface } : {}),
    constraints: buildPlatformConstraints(),
    bindingDescriptors: buildAllBindingDescriptors(components),
  }
}

function buildRawCatalogDocument(apiMap: Map<string, VcmApiDescriptor>): RawComponentCatalog {
  const sortedEntries = [...apiMap.entries()].sort(([left], [right]) => left.localeCompare(right, 'en'))
  const components: Record<string, RawComponentEntry> = Object.fromEntries(
    sortedEntries.map(([type, api]) => [type, {
      type: api.type,
      filePath: api.filePath,
      props: api.props,
      emits: api.emits,
      hasIndexSignature: api.hasIndexSignature,
    }]),
  )
  return {
    version: '2.0.0',
    buildTime: new Date().toISOString(),
    componentCount: sortedEntries.length,
    components,
  }
}

/* --------------------------------------------------------------------------
 * 公共 API
 * ----------------------------------------------------------------------- */

/**
 * 生成 raw component-catalog.json 与 AI component-catalog.ai.json 并写入文件
 */
export function generateJsonCatalog(root: string, options: JsonCatalogOptions = {}): RawComponentCatalog {
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

  // 3. API 全息表面提取（DataView / DataSet / SparkData / IScriptContext / IPageServiceCapability）
  const apiSurface = extractApiSurface(root)

  const rawCatalog = buildRawCatalogDocument(apiMap)
  const catalog = buildCatalogDocument(components, apiSurface)

  logger.info(`📦 Raw 目录已构建: ${rawCatalog.componentCount} 条目`)
  logger.info(`📦 组件目录已构建: ${catalog.componentCount} 条目`)

  const rawOutputPath = resolve(root, 'packages/spark-ai/src/catalog/component-catalog.json')
  const catalogOutputPath = resolve(root, 'packages/spark-ai/src/catalog/component-catalog.ai.json')
  writeFileSync(rawOutputPath, JSON.stringify(rawCatalog, null, 2), 'utf-8')
  writeFileSync(catalogOutputPath, JSON.stringify(catalog, null, 2), 'utf-8')
  logger.info(`📄 Raw JSON 已写入: ${rawOutputPath}`)
  logger.info(`📄 Catalog JSON 已写入: ${catalogOutputPath}`)

  // 按组件输出独立 JSON（便于逐一检查，仅在显式指定 perComponentDir 时）
  if (options.perComponentDir !== undefined) {
    const dirAbsolute = resolve(root, options.perComponentDir)
    if (!existsSync(dirAbsolute)) mkdirSync(dirAbsolute, { recursive: true })
    for (const [key, entry] of Object.entries(rawCatalog.components)) {
      const filePath = resolve(dirAbsolute, `${key}.json`)
      writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8')
    }
    logger.info(`📂 按组件独立 JSON 已输出: ${options.perComponentDir}/ (${rawCatalog.componentCount} 文件)`)
  }

  return rawCatalog
}

/* --------------------------------------------------------------------------
 * 辅助
 * ----------------------------------------------------------------------- */

/** 从 override 文本中提取 **type** — 描述 的描述部分 */
function extractDescriptionFromOverride(key: string): string {
  const text = CATALOG_OVERRIDES[key]
  if (text === undefined) return ''
  const match = /^\*\*\S+\*\*\s*—\s*(.+)$/m.exec(text)
  return match?.[1] ?? key
}

/* --------------------------------------------------------------------------
 * DevSystem Rule Editor 目录生成
 * ----------------------------------------------------------------------- */
