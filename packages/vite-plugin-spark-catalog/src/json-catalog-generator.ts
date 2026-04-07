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
import { inferBindingFromVcm, buildAllBindingDescriptors } from './infer-binding'

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
 * 容器内部兼容 Props 过滤（容器组件专用）
 *
 * 容器组件对外规范已经统一为 children + dock + props.docks + on.*。
 * 运行时内部仍可能存在兼容用 prop/attr 名（例如旧的 rowActionsXxx / filterXxx），
 * 但这些名字不应出现在最终 AI catalog 中，因此对有 override 的容器组件统一过滤。
 * ----------------------------------------------------------------------- */

/**
 * 兼容层内部 prop 名前缀。
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
        if (p.name === 'config') return false
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
  else source = 'override' // fallback for pure-text entries

  return {
    type: skillType,
    category,
    description,
    props,
    emits,
    ...(exposed !== undefined ? { exposed } : {}),
    ...(slots !== undefined ? { slots } : {}),
    ...(rootFields !== undefined ? { rootFields } : {}),
    ...(notes !== undefined ? { notes } : {}),
    source,
    ...(() => { const b = inferBindingFromVcm(skillType, props, category); return b !== undefined ? { binding: b } : {} })(),
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
    outputPath = 'packages/spark-ai/src/catalog/component-catalog.json',
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
    bindingDescriptors: buildAllBindingDescriptors(components),
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
 * SAP Catalog 裁剪 + 输出
 * 类型与 spark-ai/catalog/sap-catalog-types.ts 保持同构
 * ----------------------------------------------------------------------- */

interface SapPropEntry {
  name: string
  type: string
  required: boolean
  default?: string
  description?: string
}

interface SapEmitEntry {
  name: string
  description?: string
  type?: string
}

interface SapRootFieldEntry {
  name: string
  type: string
  description: string
}

interface SapNestingRule {
  allowedChildren: string[]
  forbiddenChildren?: string[]
  note?: string
}

interface SapComponentEntry {
  category: string
  description: string
  props: SapPropEntry[]
  emits?: SapEmitEntry[]
  rootFields?: SapRootFieldEntry[]
  notes?: string
  binding?: Record<string, unknown>
  nestingRule?: SapNestingRule
}

interface SapCatalog {
  version: string
  buildTime: string
  componentCount: number
  registry: {
    containers: string[]
    fields: string[]
    groups: string[]
    meta: string[]
  }
  components: Record<string, SapComponentEntry>
}

/**
 * 从完整 VCM ComponentCatalog 裁剪出 SAP 版。
 * props 合并 rootFields，附带 emits / notes / binding / nestingRule。
 */
export function trimToSapCatalog(catalog: ComponentCatalog): SapCatalog {
  const components: Record<string, SapComponentEntry> = {}
  for (const [type, entry] of Object.entries(catalog.components)) {
    // props: 合并 entry.props + entry.rootFields（去重）
    const seen = new Set<string>()
    const props: SapPropEntry[] = []
    for (const p of entry.props) {
      seen.add(p.name)
      const sp: SapPropEntry = { name: p.name, type: p.type, required: p.required }
      if (p.default !== undefined) sp.default = p.default
      if (p.description) sp.description = p.description
      props.push(sp)
    }
    if (entry.rootFields) {
      for (const rf of entry.rootFields) {
        if (seen.has(rf.name)) continue
        seen.add(rf.name)
        const sp: SapPropEntry = { name: rf.name, type: rf.type, required: false }
        if (rf.description) sp.description = rf.description
        props.push(sp)
      }
    }

    const comp: SapComponentEntry = {
      category: entry.category,
      description: entry.description,
      props,
    }

    // emits
    if (entry.emits.length > 0) {
      comp.emits = entry.emits.map(e => {
        const se: SapEmitEntry = { name: e.name }
        if (e.description) se.description = e.description
        if (e.type) se.type = e.type
        return se
      })
    }

    // rootFields（原始结构保留，供 AI 区分根级 vs props 内字段）
    if (entry.rootFields && entry.rootFields.length > 0) {
      comp.rootFields = entry.rootFields.map(f => ({
        name: f.name,
        type: f.type,
        description: f.description,
      }))
    }

    if (entry.notes) comp.notes = entry.notes
    if (entry.binding) comp.binding = { ...entry.binding }

    // nestingRule
    const nesting = catalog.constraints.nestingRules[type]
    if (nesting) {
      const rule: SapNestingRule = { allowedChildren: nesting.allowedChildren }
      if (nesting.forbiddenChildren && nesting.forbiddenChildren.length > 0) {
        rule.forbiddenChildren = nesting.forbiddenChildren
      }
      if (nesting.note) rule.note = nesting.note
      comp.nestingRule = rule
    }

    components[type] = comp
  }
  return {
    version: '1.0.0',
    buildTime: catalog.buildTime,
    componentCount: Object.keys(components).length,
    registry: { ...catalog.registry },
    components,
  }
}

/**
 * 从 SapCatalog 生成 Markdown 提示文本。
 * 按 category 分组，每组一个表格列出 type/description/props 名列表。
 */
export function generateSapPrompt(catalog: SapCatalog): string {
  const lines: string[] = [
    '## 可用组件目录（SAP Catalog）',
    '',
    `共 ${catalog.componentCount} 个组件，构建时间 ${catalog.buildTime}`,
    '',
  ]

  const categories: Array<{ key: string; label: string; types: string[] }> = [
    { key: 'container', label: '容器组件', types: catalog.registry.containers },
    { key: 'field', label: '字段组件', types: catalog.registry.fields },
    { key: 'group', label: '分组组件', types: catalog.registry.groups },
    { key: 'meta', label: '元概念', types: catalog.registry.meta },
  ]

  // feature 类不在 registry 中，从 components 中提取
  const featureTypes = Object.entries(catalog.components)
    .filter(([, e]) => e.category === 'feature')
    .map(([t]) => t)
    .sort()
  if (featureTypes.length > 0) {
    categories.push({ key: 'feature', label: '功能组件', types: featureTypes })
  }

  for (const cat of categories) {
    if (cat.types.length === 0) continue
    lines.push(`### ${cat.label} (${cat.types.length})`)
    lines.push('')
    lines.push('| type | description | props |')
    lines.push('|------|-------------|-------|')
    for (const type of cat.types) {
      const entry = catalog.components[type]
      if (entry === undefined) continue
      const propNames = entry.props.map(p => p.name).join(', ')
      const desc = entry.description.replace(/\|/g, '\\|')
      lines.push(`| ${type} | ${desc} | ${propNames} |`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * 生成 SAP Catalog TS 常量文件内容。
 */
export function generateSapCatalogTs(catalog: SapCatalog): string {
  return `/**
 * SAP 组件目录（轻量版）
 *
 * ⚠️ 自动生成 — 请勿手动编辑
 *
 * 由 vite-plugin-spark-catalog 在 build / dev 时生成。
 * 重新生成：pnpm run dev 或 pnpm run build
 * 生成时间：${catalog.buildTime}
 * 条目数量：${catalog.componentCount}
 */
import type { SapCatalog } from './sap-catalog-types'

export const SAP_CATALOG: SapCatalog = ${JSON.stringify(catalog, null, 2)} as const
`
}

/**
 * 生成 SAP Catalog 三件套文件（JSON + Markdown prompt + TS 常量）
 */
export function generateSapCatalogFiles(root: string, fullCatalog: ComponentCatalog): SapCatalog {
  const sapCatalog = trimToSapCatalog(fullCatalog)

  // 1. sap-catalog.json
  const jsonPath = resolve(root, 'packages/spark-ai/src/catalog/sap-catalog.json')
  writeFileSync(jsonPath, JSON.stringify(sapCatalog, null, 2), 'utf-8')

  // 2. sap-catalog-prompt.md
  const promptPath = resolve(root, 'packages/spark-ai/src/catalog/sap-catalog-prompt.md')
  writeFileSync(promptPath, generateSapPrompt(sapCatalog), 'utf-8')

  // 3. sap-catalog.ts
  const tsPath = resolve(root, 'packages/spark-ai/src/catalog/sap-catalog.ts')
  writeFileSync(tsPath, generateSapCatalogTs(sapCatalog), 'utf-8')

  logger.info(`🔧 SAP Catalog 已生成: JSON + Markdown + TS (${sapCatalog.componentCount} 条目)`)

  return sapCatalog
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

/**
 * 生成 DevSystem rule editor 组件目录文件。
 *
 * 写入 `src/views/app/dev-system/policies/_generated-catalog.ts`，
 * 由 ruleJsonSchema.ts 一次性 import 后自动驱动组件类型下拉。
 * 内容随构建自动更新，无需手动维护。
 */
export function generateDevSystemCatalog(root: string, catalog: ComponentCatalog): void {
  // 1. 收集所有组件类型
  const allTypes = new Set<string>([
    ...catalog.registry.containers,
    ...catalog.registry.fields,
    ...catalog.registry.groups,
    ...catalog.registry.meta,
  ])
  for (const type of Object.keys(catalog.components)) {
    allTypes.add(type)
  }
  const sortedTypes = [...allTypes].sort()

  // 1.5 各组件的分类、描述与 API 摘要
  interface EmitInfo { name: string; description?: string; type?: string }
  interface RootFieldInfo { name: string; type: string; description: string }
  interface ComponentInfo {
    category: string
    description: string
    emits?: EmitInfo[]
    rootFields?: RootFieldInfo[]
    notes?: string
    binding?: Record<string, unknown>
  }
  const componentDescriptions: Record<string, ComponentInfo> = {}
  for (const [type, entry] of Object.entries(catalog.components)) {
    const info: ComponentInfo = {
      category: entry.category,
      description: entry.description,
    }
    if (entry.emits.length > 0) {
      info.emits = entry.emits.map(e => {
        const ei: EmitInfo = { name: e.name }
        if (e.description) ei.description = e.description
        if (e.type) ei.type = e.type
        return ei
      })
    }
    if (entry.rootFields && entry.rootFields.length > 0) {
      info.rootFields = entry.rootFields.map(f => ({
        name: f.name,
        type: f.type,
        description: f.description,
      }))
    }
    if (entry.notes) {
      info.notes = entry.notes
    }
    if (entry.binding) {
      info.binding = { ...entry.binding }
    }
    componentDescriptions[type] = info
  }

  // 2. 各组件的属性名列表（排除结构键）
  const structKeys = new Set(['type', 'props', 'children', 'id'])
  const propNames: Record<string, string[]> = {}
  for (const [type, entry] of Object.entries(catalog.components)) {
    propNames[type] = entry.props
      .filter(p => !structKeys.has(p.name))
      .map(p => p.name)
  }

  // 3. 各组件各属性的枚举值选项
  const propEnums: Record<string, Record<string, string[]>> = {}
  for (const [type, entry] of Object.entries(catalog.components)) {
    const enumsForType: Record<string, string[]> = {}
    for (const prop of entry.props) {
      if (structKeys.has(prop.name)) continue
      const parsed = parseEnumFromTypeString(prop.type)
      if (parsed.length > 0) {
        enumsForType[prop.name] = parsed
      }
    }
    if (Object.keys(enumsForType).length > 0) {
      propEnums[type] = enumsForType
    }
  }

  // 4. 各组件各属性的类型字符串
  const propTypes: Record<string, Record<string, string>> = {}
  for (const [type, entry] of Object.entries(catalog.components)) {
    const typesForComp: Record<string, string> = {}
    for (const prop of entry.props) {
      if (structKeys.has(prop.name)) continue
      typesForComp[prop.name] = prop.type
    }
    if (Object.keys(typesForComp).length > 0) {
      propTypes[type] = typesForComp
    }
  }

  // 5. 各组件各属性的描述
  const propDescriptions: Record<string, Record<string, string>> = {}
  for (const [type, entry] of Object.entries(catalog.components)) {
    const descsForComp: Record<string, string> = {}
    for (const prop of entry.props) {
      if (structKeys.has(prop.name)) continue
      if (prop.description && prop.description.length > 0) {
        descsForComp[prop.name] = prop.description
      }
    }
    if (Object.keys(descsForComp).length > 0) {
      propDescriptions[type] = descsForComp
    }
  }

  // 7. 每个组件的完整 API 规格（props + rootFields 合并，构建自动生成）
  interface PropSpec { name: string; type: string; required: boolean; default?: string; description?: string }
  const componentApi: Record<string, PropSpec[]> = {}
  for (const [type, entry] of Object.entries(catalog.components)) {
    const seen = new Set<string>()
    const specs: PropSpec[] = []

    // 7a. 先收 props（过滤结构键）
    for (const p of entry.props) {
      if (structKeys.has(p.name)) continue
      seen.add(p.name)
      const spec: PropSpec = { name: p.name, type: p.type, required: p.required }
      if (p.default !== undefined) spec.default = p.default
      if (p.description) spec.description = p.description
      specs.push(spec)
    }

    // 7b. 再合并 rootFields（容器/字段组件的实际配置项，补充 props 未覆盖的）
    if (entry.rootFields) {
      for (const rf of entry.rootFields) {
        if (seen.has(rf.name)) continue
        seen.add(rf.name)
        const spec: PropSpec = { name: rf.name, type: rf.type, required: false }
        if (rf.description) spec.description = rf.description
        specs.push(spec)
      }
    }

    componentApi[type] = specs
  }

  // 8. 组件嵌套规则（哪些组件内可放哪些子组件）
  const nestingRules: Record<string, { allowedChildren: string[]; forbiddenChildren?: string[]; note?: string }> = {}
  if (Object.keys(catalog.constraints.nestingRules).length > 0) {
    for (const [type, rule] of Object.entries(catalog.constraints.nestingRules)) {
      const entry: { allowedChildren: string[]; forbiddenChildren?: string[]; note?: string } = {
        allowedChildren: rule.allowedChildren,
      }
      if (rule.forbiddenChildren && rule.forbiddenChildren.length > 0) {
        entry.forbiddenChildren = rule.forbiddenChildren
      }
      if (rule.note) {
        entry.note = rule.note
      }
      nestingRules[type] = entry
    }
  }

  // 8. 写入文件
  const content = `/**
 * DevSystem 组件目录（自动生成）
 *
 * ⚠️ 请勿手动编辑 — 由 vite-plugin-spark-catalog 构建时生成
 * 重新生成：pnpm run dev 或 pnpm run build
 * 生成时间：${catalog.buildTime}
 * 条目数量：${sortedTypes.length}
 */

/** 全部已注册组件类型（排序后，用于 type 字段下拉） */
export const COMPONENT_TYPES: string[] = ${JSON.stringify(sortedTypes, null, 2)}

/** 各组件的元信息（分类、描述、事件、根级字段、注释、数据绑定配置） */
export const COMPONENT_DESCRIPTIONS: Record<string, {
  category: string
  description: string
  emits?: Array<{ name: string; description?: string; type?: string }>
  rootFields?: Array<{ name: string; type: string; description: string }>
  notes?: string
  binding?: Record<string, unknown>
}> = ${JSON.stringify(componentDescriptions, null, 2)}

/** 各组件类型的可用属性名列表（不含结构键 type/props/children/id） */
export const COMPONENT_PROP_NAMES: Record<string, string[]> = ${JSON.stringify(propNames, null, 2)}

/** 各组件各属性的枚举值选项（仅限有明确枚举值的属性） */
export const COMPONENT_PROP_ENUMS: Record<string, Record<string, string[]>> = ${JSON.stringify(propEnums, null, 2)}

/** 各组件各属性的 TypeScript 类型字符串 */
export const COMPONENT_PROP_TYPES: Record<string, Record<string, string>> = ${JSON.stringify(propTypes, null, 2)}

/** 各组件各属性的描述文本（仅含有描述的属性） */
export const COMPONENT_PROP_DESCRIPTIONS: Record<string, Record<string, string>> = ${JSON.stringify(propDescriptions, null, 2)}

/** 组件嵌套规则（哪些组件内可放哪些子组件类型） */
export const COMPONENT_NESTING_RULES: Record<string, {
  allowedChildren: string[]
  forbiddenChildren?: string[]
  note?: string
}> = ${JSON.stringify(nestingRules, null, 2)}

/** 每个组件的完整 props API 规格（name / type / required / default / description） */
export const COMPONENT_API: Record<string, Array<{
  name: string
  type: string
  required: boolean
  default?: string
  description?: string
}>> = ${JSON.stringify(componentApi, null, 2)}
`
  const outputPath = resolve(root, 'src/views/app/dev-system/policies/_generated-catalog.ts')
  writeFileSync(outputPath, content, 'utf-8')
  logger.info(`🎨 DevSystem 组件目录已生成: ${sortedTypes.length} 个组件类型`)
}
