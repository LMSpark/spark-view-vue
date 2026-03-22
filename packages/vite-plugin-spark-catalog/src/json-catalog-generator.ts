/**
 * 组件目录 JSON 生成器
 *
 * 从 AST 提取 + 补充数据合并，输出 component-catalog.json。
 * 纯 Node.js 模块，不依赖 Vite / Vue。
 *
 * @module json-catalog-generator
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { globSync } from 'glob'
import { extractComponentApi } from './extract-component-api'
import type { ComponentApiDescriptor } from './extract-component-api'
import {
  CATALOG_OVERRIDES,
  CATALOG_ADDENDUMS,
  COMPONENT_CATEGORIES,
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
 * 从 override 文本解析根级字段（简化提取）
 * ----------------------------------------------------------------------- */

function parseRootFieldsFromOverride(overrideText: string): ComponentEntry['rootFields'] {
  // 提取形如 【根级字段 — XXX】 段落中的行
  const rootFieldSections = overrideText.matchAll(/【根级字段[^】]*】\n([\s\S]*?)(?=\n【|$)/g)
  const fields: NonNullable<ComponentEntry['rootFields']> = []

  for (const section of rootFieldSections) {
    const sectionContent = section[1] ?? ''
    const lines = sectionContent.split('\n').filter(l => l.trim() !== '')
    for (const line of lines) {
      // 匹配 "name: type — description" 或 "name: type" 模式
      const match = /^(\S+?):\s*(\S+)(?:\s*—\s*(.+))?$/.exec(line.trim())
      if (match !== null) {
        fields.push({
          name: match[1] ?? '',
          type: match[2] ?? 'unknown',
          description: match[3] ?? '',
        })
      }
    }
  }

  return fields.length > 0 ? fields : undefined
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
 * 核心：构建 ComponentEntry
 * ----------------------------------------------------------------------- */

function buildComponentEntry(
  skillType: string,
  description: string,
  api: ComponentApiDescriptor | null,
  hasOverride: boolean,
  hasAddendum: boolean,
): ComponentEntry {
  const category = resolveCategory(skillType)
  const overrideText = CATALOG_OVERRIDES[skillType]
  const addendumText = CATALOG_ADDENDUMS[skillType]

  // Props
  const props: PropEntry[] = api !== null
    ? api.props
      .filter(p => p.name !== 'config' && p.name !== 'sparkChildren')
      .map(p => ({
        name: p.name,
        type: p.type,
        required: p.required,
        ...(p.default !== undefined ? { default: p.default } : {}),
        ...(p.description !== undefined ? { description: p.description } : {}),
      }))
    : []

  // Emits
  const emits: EmitEntry[] = api?.emits ?? []

  // Capabilities
  const capabilities = api?.capabilities ?? { consumes: [], provides: [] }

  // Root fields from override text
  const rootFields = hasOverride && overrideText !== undefined
    ? parseRootFieldsFromOverride(overrideText)
    : undefined

  // Notes: addendum text or override text (for meta/container without AST)
  let notes: string | undefined
  if (hasOverride && overrideText !== undefined && api === null) {
    notes = overrideText
  }
  if (addendumText !== undefined) {
    notes = notes !== undefined ? `${notes}\n\n${addendumText}` : addendumText
  }

  // Source
  let source: ComponentEntry['source'] = 'ast'
  if (hasOverride) source = 'override'
  else if (hasAddendum && api !== null) source = 'ast+addendum'
  else if (hasAddendum) source = 'addendum'

  return {
    type: skillType,
    category,
    description,
    props,
    emits,
    capabilities,
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
    verbose = false,
  } = options

  // 1. 扫描组件
  const renderers = scanRendererComponents(root)
  const features = scanFeatureComponents(root, featurePatterns, exclude)
  if (verbose) {
    logger.info(`🔬 Renderer: ${renderers.length}, Feature: ${features.length}`)
  }

  // 2. AST 提取
  const apiMap = new Map<string, ComponentApiDescriptor>()
  for (const comp of [...renderers, ...features]) {
    if (comp.skillType in CATALOG_OVERRIDES) continue
    try {
      const source = readFileSync(comp.absolutePath, 'utf-8')
      const api = extractComponentApi(source, comp.relativePath, comp.skillType)
      if (api !== null) apiMap.set(comp.skillType, api)
    } catch {
      // skip
    }
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
    components,
    constraints: buildPlatformConstraints(),
  }

  // 6. 写入文件
  const outputAbsolute = resolve(root, outputPath)
  writeFileSync(outputAbsolute, JSON.stringify(catalog, null, 2), 'utf-8')
  logger.info(`📦 组件目录 JSON 已生成: ${outputPath} (${catalog.componentCount} 条目)`)

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
