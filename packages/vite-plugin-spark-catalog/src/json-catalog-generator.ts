/**
 * 组件目录 JSON 生成器
 *
 * 从 vue-component-meta 类型解析 + 补充数据合并，输出 component-catalog.json。
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
  PlatformConstraints,
  PropEntry,
  EmitEntry,
  ExposedEntry,
  SlotEntry,
} from './component-catalog-schema'

const logger = createLogger('spark-catalog-json')

/* --------------------------------------------------------------------------
 * 选项
 * ----------------------------------------------------------------------- */

export interface JsonCatalogOptions {
  /** Feature 组件的 glob 扫描模式（相对于 root） */
  featurePatterns?: string[] | undefined
  /** 排除模式 */
  exclude?: string[] | undefined
  /** 输出 JSON 文件路径（相对于 root） */
  outputPath?: string | undefined
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
}

function scanRendererComponents(root: string): ScannedComponent[] {
  const patterns = [
    './packages/spark-component/src/renderer/containers/*.vue',
    './packages/spark-component/src/renderer/fields/*.vue',
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

      results.push({
        absolutePath,
        relativePath: file,
        skillType,
        skillDescription: buildImplicitSkillDescription(absolutePath, skillType),
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
      })
    }
  }
  return results
}

/* --------------------------------------------------------------------------
 * 分类判定
 * ----------------------------------------------------------------------- */

function resolveCategory(skillType: string): ComponentEntry['category'] {
  const explicitCat = COMPONENT_CATEGORIES[skillType]
  if (explicitCat === 'container') return 'container'
  if (explicitCat === 'group') return 'group'
  if (explicitCat === 'meta') return 'meta'
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
 * 从 override 文本解析能力链
 * ----------------------------------------------------------------------- */

function parseCapabilitiesFromOverride(
  overrideText: string,
): { consumes: string[]; provides: string[] } | null {
  const consumeMatch = /consumes:\s*(.+)/i.exec(overrideText)
  const provideMatch = /provides:\s*(.+)/i.exec(overrideText)
  if (consumeMatch === null && provideMatch === null) return null

  const parseLine = (line: string): string[] =>
    line.split(/[,，]/)
      .map(s => s.trim())
      .filter(s => s !== '' && /^[A-Z_]+$/.test(s))

  return {
    consumes: consumeMatch !== null ? parseLine(consumeMatch[1] ?? '') : [],
    provides: provideMatch !== null ? parseLine(provideMatch[1] ?? '') : [],
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
 * bindRules 内部 Props 过滤（容器组件专用）
 *
 * 容器组件的 SparkNode 根级字段（toolbar / actions / filter / on）
 * 由 bindRules 拆解后注入为 Vue 内部 Props（如 toolbar → toolbar + toolbarPosition + toolbarClass）。
 * 这些内部 Props 名与 rule.json 字段名不同，rootFields 已用 rule.json 格式描述，
 * VCM 提取的内部名会误导 AI → 对有 override 的容器组件过滤。
 * ----------------------------------------------------------------------- */

/**
 * bindRules 拆解 SparkNode 根级字段后产生的容器内部 prop 名前缀。
 * 仅对有 override（= rootFields 已描述）的容器组件执行过滤。
 * 字段组件的同名 props（如 r-select.filterable）不受影响。
 */
const CONTAINER_INTERNAL_PROP_PREFIXES = [
  'toolbar',
  'rowActions',
  'itemActions',
  'headerActions',
  'footerActions',
  'filter',
] as const

/** 字段组件上允许保留的同前缀 Props（不误杀） */
const FIELD_PROP_WHITELIST = new Set([
  'filterable',
  'filterPlaceholder',
  'filterMethod',
  'filterMode',
])

function isContainerInternalProp(propName: string): boolean {
  if (FIELD_PROP_WHITELIST.has(propName)) return false
  return CONTAINER_INTERNAL_PROP_PREFIXES.some(prefix => {
    if (propName === prefix) return true
    // camelCase 复合名：prefix + UpperCase（如 toolbarPosition, filterColumns）
    if (propName.startsWith(prefix) && propName.length > prefix.length) {
      const nextChar = propName[prefix.length]
      return nextChar === nextChar?.toUpperCase() && nextChar !== nextChar?.toLowerCase()
    }
    return false
  })
}

/** 类型包含 SparkNode → 已有 sharedTypes 单例定义，props 中无需重复 */
function isSparkNodeTypeProp(propType: string): boolean {
  return propType.includes('SparkNode')
}

/* --------------------------------------------------------------------------
 * 核心：构建 ComponentEntry
 * ----------------------------------------------------------------------- */

function buildComponentEntry(
  skillType: string,
  description: string,
  api: VcmApiDescriptor | null,
  hasOverride: boolean,
  hasAddendum: boolean,
): ComponentEntry {
  const category = resolveCategory(skillType)
  const overrideText = CATALOG_OVERRIDES[skillType]
  const addendumText = CATALOG_ADDENDUMS[skillType]

  // Props: 始终优先 VCM 提取（过滤内部 props）
  // 对有 override 的容器组件，额外过滤 bindRules 内部 props（rootFields 已描述）
  const filterContainerProps = hasOverride
  const props: PropEntry[] = api !== null
    ? api.props
      .filter(p => {
        if (p.name === 'config' || p.name === 'sparkChildren') return false
        // SparkNode 类型 props → sharedTypes 已定义，逐组件展示无意义
        if (isSparkNodeTypeProp(p.type)) return false
        // 容器内部 props → rootFields 已用 rule.json 格式描述
        if (filterContainerProps && isContainerInternalProp(p.name)) return false
        return true
      })
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

  // Exposed: VCM 提取
  const exposed: ExposedEntry[] | undefined =
    api !== null && api.exposed.length > 0 ? api.exposed : undefined

  // Slots: VCM 提取
  const slots: SlotEntry[] | undefined =
    api !== null && api.slots.length > 0 ? api.slots : undefined

  // Capabilities: VCM AST 提取 + override 文本补充
  let capabilities = api?.capabilities ?? { consumes: [], provides: [] }
  if (hasOverride && overrideText !== undefined) {
    const overrideCaps = parseCapabilitiesFromOverride(overrideText)
    if (overrideCaps !== null) {
      // 合并：AST 有的保留，override 补充缺失的
      const mergedConsumes = [...new Set([...capabilities.consumes, ...overrideCaps.consumes])]
      const mergedProvides = [...new Set([...capabilities.provides, ...overrideCaps.provides])]
      capabilities = { consumes: mergedConsumes, provides: mergedProvides }
    }
  }

  // Root fields from override text
  const rootFields = hasOverride && overrideText !== undefined
    ? parseRootFieldsFromOverride(overrideText)
    : undefined

  // Notes: override 原文始终保留（辅助 AI 阅读），addendum 追加
  let notes: string | undefined
  if (hasOverride && overrideText !== undefined) {
    notes = overrideText
  }
  if (addendumText !== undefined) {
    notes = notes !== undefined ? `${notes}\n\n${addendumText}` : addendumText
  }

  // Source
  const prefix = api !== null ? 'vcm' : ''
  let source: ComponentEntry['source']
  if (prefix !== '' && hasOverride) source = 'vcm+override'
  else if (prefix !== '' && hasAddendum) source = 'vcm+addendum'
  else if (prefix !== '') source = 'vcm'
  else if (hasOverride) source = 'override'
  else if (hasAddendum) source = 'addendum'
  else source = 'ast' // fallback for pure-text entries

  return {
    type: skillType,
    category,
    description,
    props,
    emits,
    capabilities,
    ...(exposed !== undefined ? { exposed } : {}),
    ...(slots !== undefined ? { slots } : {}),
    ...(rootFields !== undefined ? { rootFields } : {}),
    ...(notes !== undefined ? { notes } : {}),
    source,
  }
}

/* --------------------------------------------------------------------------
 * 公共 API
 * ----------------------------------------------------------------------- */

/**
 * 生成 component-catalog.json 并写入文件
 */
export function generateJsonCatalog(root: string, options: JsonCatalogOptions = {}): ComponentCatalog {
  const {
    featurePatterns = [],
    exclude = [],
    outputPath = 'packages/spark-ai/src/component-catalog.json',
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

  // 3. 构建组件条目
  const components: Record<string, ComponentEntry> = {}
  const descriptionMap = new Map<string, string>()

  // 从扫描结果收集描述
  for (const comp of [...renderers, ...features]) {
    descriptionMap.set(comp.skillType, comp.skillDescription)
  }

  // Override 条目（包含未被扫描到的元概念组件）
  for (const key of Object.keys(CATALOG_OVERRIDES)) {
    const api = apiMap.get(key) ?? null
    const desc = descriptionMap.get(key) ?? extractDescriptionFromOverride(key)
    components[key] = buildComponentEntry(key, desc, api, true, key in CATALOG_ADDENDUMS)
  }

  // AST 条目
  for (const [key, api] of apiMap) {
    if (key in components) continue // 已有 override
    const desc = descriptionMap.get(key) ?? ''
    components[key] = buildComponentEntry(key, desc, api, false, key in CATALOG_ADDENDUMS)
  }

  // 纯 Addendum 条目
  for (const key of Object.keys(CATALOG_ADDENDUMS)) {
    if (key in components) continue
    const desc = descriptionMap.get(key) ?? ''
    components[key] = buildComponentEntry(key, desc, null, false, true)
  }

  // 4. 构建注册表
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

  // 排序
  registry.containers.sort()
  registry.fields.sort()
  registry.groups.sort()
  registry.meta.sort()

  // 5. 组装目录
  const catalog: ComponentCatalog = {
    version: '2.0.0',
    buildTime: new Date().toISOString(),
    componentCount: Object.keys(components).length,
    registry,
    sharedTypes: SHARED_TYPE_DEFINITIONS,
    components,
    constraints: buildPlatformConstraints(),
  }

  // 6. 写入文件
  const outputAbsolute = resolve(root, outputPath)
  writeFileSync(outputAbsolute, JSON.stringify(catalog, null, 2), 'utf-8')
  logger.info(`📦 组件目录 JSON 已生成: ${outputPath} (${catalog.componentCount} 条目)`)

  // 7. 按组件输出独立 JSON（便于逐一检查）
  if (options.perComponentDir !== undefined) {
    const dirAbsolute = resolve(root, options.perComponentDir)
    if (!existsSync(dirAbsolute)) mkdirSync(dirAbsolute, { recursive: true })
    for (const [key, entry] of Object.entries(components)) {
      const filePath = resolve(dirAbsolute, `${key}.json`)
      writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8')
    }
    logger.info(`📂 按组件独立 JSON 已输出: ${options.perComponentDir}/ (${Object.keys(components).length} 文件)`)
  }

  return catalog
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
