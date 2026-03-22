/**
 * Component API Diff Report（组件 API 差距分析）
 *
 * 对比自动提取的组件 API 与手写文档目录，报告：
 * - 未文档化的 props / emits / capabilities
 * - 无自动提取数据的目录条目（可能过时）
 * - 组件整体覆盖率
 *
 * 用于构建管线的质量门禁（CI 警告）和开发者反馈。
 *
 * @module api-diff-report
 * @since 1.3.0
 */

import type { ComponentApiDescriptor } from './extract-component-api'

/* ==========================================================================
 * 输出类型
 * ========================================================================== */

export interface ComponentGapReport {
  /** 组件注册名 */
  type: string
  /** 提取状态：有 API 提取数据 */
  hasExtractedApi: boolean
  /** 文档状态：在手写目录中有条目 */
  hasCatalogEntry: boolean
  /** 已文档化的 prop 名列表 */
  documentedProps: string[]
  /** 未文档化的 prop 名列表（已提取但未在目录中找到） */
  undocumentedProps: string[]
  /** 目录中提及但未被提取的 prop 名（可能过时或属于 meta 嵌套路径） */
  extraCatalogProps: string[]
  /** 未文档化的 emit 事件名 */
  undocumentedEmits: string[]
  /** 未文档化的能力键（consume） */
  undocumentedConsumes: string[]
  /** 未文档化的能力键（provide） */
  undocumentedProvides: string[]
  /** 覆盖率 0..1 */
  propsCoverage: number
}

export interface DiffReportSummary {
  /** 组件总数 */
  totalComponents: number
  /** 有自动提取 API 的组件数 */
  componentsWithApi: number
  /** 有手写文档的组件数 */
  componentsWithDocs: number
  /** 平均 props 覆盖率 0..1 */
  averagePropsCoverage: number
  /** 完全覆盖（100% props 文档化）的组件数 */
  fullyDocumentedCount: number
  /** 各组件的详细差距报告 */
  components: ComponentGapReport[]
}

/* ==========================================================================
 * 主入口
 * ========================================================================== */

/**
 * 生成差距分析报告
 *
 * @param extractedApis - 自动提取的组件 API 列表
 * @param catalog       - 手写文档目录 Record<componentType, catalogText>
 */
export function generateDiffReport(
  extractedApis: ComponentApiDescriptor[],
  catalog: Record<string, string>,
): DiffReportSummary {
  // 合并两方的组件类型列表
  const allTypes = new Set<string>([
    ...extractedApis.map(a => a.type),
    ...Object.keys(catalog),
  ])

  const apiMap = new Map(extractedApis.map(a => [a.type, a]))
  const reports: ComponentGapReport[] = []

  for (const type of allTypes) {
    const api = apiMap.get(type)
    const catalogText = catalog[type]

    reports.push(analyzeComponent(type, api ?? null, catalogText ?? null))
  }

  // 排序：未覆盖的在前，覆盖率低的在前
  reports.sort((a, b) => a.propsCoverage - b.propsCoverage)

  const componentsWithApi = reports.filter(r => r.hasExtractedApi).length
  const componentsWithDocs = reports.filter(r => r.hasCatalogEntry).length
  const coverages = reports.filter(r => r.hasExtractedApi).map(r => r.propsCoverage)
  const averagePropsCoverage = coverages.length > 0
    ? coverages.reduce((a, b) => a + b, 0) / coverages.length
    : 0
  const fullyDocumentedCount = reports.filter(
    r => r.hasExtractedApi && r.propsCoverage === 1,
  ).length

  return {
    totalComponents: allTypes.size,
    componentsWithApi,
    componentsWithDocs,
    averagePropsCoverage,
    fullyDocumentedCount,
    components: reports,
  }
}

/**
 * 将报告格式化为控制台友好的文本
 */
export function formatDiffReport(summary: DiffReportSummary): string {
  const lines: string[] = [
    '',
    '📊 Component API Coverage Report',
    '═'.repeat(50),
    '',
    `  组件总数:             ${summary.totalComponents}`,
    `  已提取 API:           ${summary.componentsWithApi}`,
    `  已有手写文档:         ${summary.componentsWithDocs}`,
    `  平均 Props 覆盖率:    ${pct(summary.averagePropsCoverage)}`,
    `  完全覆盖组件数:       ${summary.fullyDocumentedCount}`,
    '',
  ]

  // 按状态分类
  const missing = summary.components.filter(c => !c.hasCatalogEntry && c.hasExtractedApi)
  const incomplete = summary.components.filter(
    c => c.hasCatalogEntry && c.hasExtractedApi && c.propsCoverage < 1,
  )
  const full = summary.components.filter(
    c => c.hasCatalogEntry && c.hasExtractedApi && c.propsCoverage === 1,
  )
  const stale = summary.components.filter(c => c.hasCatalogEntry && !c.hasExtractedApi)

  if (missing.length > 0) {
    lines.push('❌ 缺少文档的组件:')
    for (const c of missing) {
      lines.push(
        `  ${c.type} — ${c.undocumentedProps.length} props, ` +
        `${c.undocumentedEmits.length} emits 未文档化`,
      )
    }
    lines.push('')
  }

  if (incomplete.length > 0) {
    lines.push('⚠️ 文档不完整的组件:')
    for (const c of incomplete) {
      lines.push(
        `  ${c.type} (${pct(c.propsCoverage)}) — ` +
        `缺少: ${c.undocumentedProps.join(', ') || '(无)'}`,
      )
    }
    lines.push('')
  }

  if (full.length > 0) {
    lines.push(`✅ 完全覆盖: ${full.map(c => c.type).join(', ')}`)
    lines.push('')
  }

  if (stale.length > 0) {
    lines.push(`🗑️  仅有手写文档（无提取数据）: ${stale.map(c => c.type).join(', ')}`)
    lines.push('')
  }

  return lines.join('\n')
}

/* ==========================================================================
 * 内部实现
 * ========================================================================== */

function analyzeComponent(
  type: string,
  api: ComponentApiDescriptor | null,
  catalogText: string | null,
): ComponentGapReport {
  if (!api) {
    return {
      type,
      hasExtractedApi: false,
      hasCatalogEntry: Boolean(catalogText),
      documentedProps: [],
      undocumentedProps: [],
      extraCatalogProps: [],
      undocumentedEmits: [],
      undocumentedConsumes: [],
      undocumentedProvides: [],
      propsCoverage: 0,
    }
  }

  const documented: string[] = []
  const undocumented: string[] = []

  // 对每个提取到的 prop，检查是否在目录文本中被提及
  for (const prop of api.props) {
    if (catalogText && isPropMentioned(prop.name, catalogText)) {
      documented.push(prop.name)
    } else {
      undocumented.push(prop.name)
    }
  }

  // 检查目录中提及但未被提取的 prop（可能使用了 meta 嵌套路径或过时）
  const extraCatalog: string[] = []
  if (catalogText) {
    const catalogPropNames = extractPropNamesFromCatalog(catalogText)
    const extractedNames = new Set(api.props.map(p => p.name))
    for (const name of catalogPropNames) {
      if (!extractedNames.has(name)) {
        extraCatalog.push(name)
      }
    }
  }

  // Emits 覆盖检查
  const undocumentedEmits = api.emits
    .filter(e => !catalogText || !catalogText.includes(e.name))
    .map(e => e.name)

  // Capabilities 覆盖检查
  const undocumentedConsumes = api.capabilities.consumes
    .filter(k => !catalogText || !catalogText.includes(k))
  const undocumentedProvides = api.capabilities.provides
    .filter(k => !catalogText || !catalogText.includes(k))

  const totalProps = api.props.length
  const propsCoverage = totalProps > 0 ? documented.length / totalProps : 1

  return {
    type,
    hasExtractedApi: true,
    hasCatalogEntry: Boolean(catalogText),
    documentedProps: documented,
    undocumentedProps: undocumented,
    extraCatalogProps: extraCatalog,
    undocumentedEmits,
    undocumentedConsumes,
    undocumentedProvides,
    propsCoverage,
  }
}

/** 检查 prop 名称是否在目录文本中被提及（精确词边界匹配） */
function isPropMentioned(propName: string, catalogText: string): boolean {
  // 精确匹配 propName（词边界），支持 camelCase 和 kebab-case
  const escaped = propName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`\\b${escaped}\\b`, 'i')
  return pattern.test(catalogText)
}

/** 从目录文本中粗略提取 prop 名称（行首标识符 + 冒号模式） */
function extractPropNamesFromCatalog(catalogText: string): string[] {
  const names: string[] = []
  // 匹配模式: `propName:` 或 `propName :` 在行首（忽略前导空白）
  const re = /^\s*([a-zA-Z]\w*)(?:\s*:\s|\s*—)/gm
  let match: RegExpExecArray | null
  while ((match = re.exec(catalogText)) !== null) {
    const name = match[1]
    // 排除标题行和非 prop 关键词
    if (name && !CATALOG_NON_PROP_WORDS.has(name.toLowerCase())) {
      names.push(name)
    }
  }
  return [...new Set(names)]
}

const CATALOG_NON_PROP_WORDS = new Set([
  'props', 'children', 'type', 'meta', 'string', 'number', 'boolean',
  'array', 'object', 'function', 'void', 'null', 'undefined',
])

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(0)}%`
}
