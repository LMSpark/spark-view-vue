export interface GeneratedPageFiles {
  'rule.json'?: string
  'pagedata.json'?: string
  'script.js'?: string
  'style.css'?: string
}

export type ConfigValidationCategory = 'dataKey' | 'handler' | 'render' | 'component'
export type ConfigValidationSeverity = 'error' | 'warning'

export interface ConfigValidationIssue {
  category: ConfigValidationCategory
  severity: ConfigValidationSeverity
  message: string
  path: string
  suggestion?: string
}

export interface ConfigValidationSummary {
  total: number
  errors: number
  warnings: number
  byCategory: Record<ConfigValidationCategory, number>
}

export interface ConfigValidationReport {
  valid: boolean
  summary: ConfigValidationSummary
  issues: ConfigValidationIssue[]
}

interface RuleNodeSnapshot {
  node: Record<string, unknown>
  path: string
}

type RenderContext = 'table' | 'form' | 'detail' | 'list' | 'tree'

import { DATAKEY_RE, HTML_TYPES, VALID_TYPE_PREFIXES } from './shared-constants'

const EMPTY_SUMMARY: ConfigValidationSummary = {
  total: 0,
  errors: 0,
  warnings: 0,
  byCategory: {
    dataKey: 0,
    handler: 0,
    render: 0,
    component: 0,
  },
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function parseJson(content: string | undefined): unknown {
  if (content === undefined) return null
  const trimmed = content.trim()
  if (trimmed === '') return null
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}

function extractScriptFunctions(script: string | undefined): Set<string> {
  const names = new Set<string>()
  if (script === undefined || script.trim() === '') return names

  const declarationPattern = /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gu
  const arrowPattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gu
  const functionExprPattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\b/gu

  for (const pattern of [declarationPattern, arrowPattern, functionExprPattern]) {
    for (const match of script.matchAll(pattern)) {
      const name = match[1]
      if (name !== undefined) names.add(name)
    }
  }

  return names
}

function collectRuleNodes(value: unknown, path: string, out: RuleNodeSnapshot[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectRuleNodes(item, `${path}[${index}]`, out))
    return
  }

  const node = asRecord(value)
  if (node === null) return
  out.push({ node, path })

  const children = node['children']
  if (Array.isArray(children)) {
    children.forEach((item, index) => collectRuleNodes(item, `${path}.children[${index}]`, out))
  }
}

function isLikelyComponentType(typeName: string): boolean {
  if (HTML_TYPES.has(typeName)) return true
  if (VALID_TYPE_PREFIXES.some(prefix => typeName.startsWith(prefix))) return true
  return /^[a-z][a-z0-9-]*$/u.test(typeName) && typeName.includes('-')
}

function parseDataKeyTable(dataKey: string): { tableName: string | null; crossPage: boolean } {
  if (!DATAKEY_RE.test(dataKey)) {
    return { tableName: null, crossPage: false }
  }
  const parts = dataKey.split('@')
  if (parts.length === 0) return { tableName: null, crossPage: false }
  if (parts[0]?.startsWith('#')) {
    return { tableName: parts[1] ?? null, crossPage: true }
  }
  return { tableName: parts[0] ?? null, crossPage: false }
}

function extractTableNames(pageData: unknown): Set<string> {
  const names = new Set<string>()
  const root = asRecord(pageData)
  if (root === null) return names

  const tables = root['tables']
  if (Array.isArray(tables)) {
    for (const item of tables) {
      const record = asRecord(item)
      const tableName = record?.['tableName']
      if (typeof tableName === 'string' && tableName.trim() !== '') {
        names.add(tableName)
      }
    }
    return names
  }

  const tableMap = asRecord(tables)
  if (tableMap !== null) {
    for (const key of Object.keys(tableMap)) {
      if (key.trim() !== '') names.add(key)
    }
  }

  return names
}

const CONTAINER_CONTEXT_MAP: Record<string, RenderContext> = {
  'r-table': 'table',
  'r-form': 'form',
  'r-detail': 'detail',
  'r-list': 'list',
  'r-tree': 'tree',
}

const NON_FIELD_R_TYPES = new Set([
  'r-table', 'r-form', 'r-detail', 'r-list', 'r-tree',
  'r-tabs', 'r-collapse', 'r-dialog', 'r-drawer', 'r-steps', 'r-section', 'r-block',
  'r-column-group',
])

function extractFieldName(node: Record<string, unknown>): string | null {
  if (typeof node['field'] === 'string' && node['field'].trim() !== '') {
    return node['field']
  }
  const meta = asRecord(node['meta'])
  const data = asRecord(meta?.['data'])
  if (typeof data?.['field'] === 'string' && data['field'].trim() !== '') {
    return data['field']
  }
  return null
}

function isSparkFieldType(typeName: string): boolean {
  return typeName.startsWith('r-') && !NON_FIELD_R_TYPES.has(typeName)
}

function validateContextAwareStructure(
  value: unknown,
  path: string,
  issues: ConfigValidationIssue[],
  inheritedContext: RenderContext | null,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateContextAwareStructure(item, `${path}[${index}]`, issues, inheritedContext))
    return
  }

  const node = asRecord(value)
  if (node === null) return

  const typeName = typeof node['type'] === 'string' ? node['type'] : ''
  const currentContext = typeName === ''
    ? inheritedContext
    : (CONTAINER_CONTEXT_MAP[typeName] ?? inheritedContext)

  if (typeName === 'el-table-column' && inheritedContext === 'table') {
    pushIssue(
      issues,
      'component',
      'warning',
      'r-table 子节点不建议使用 el-table-column，建议使用 r-* 字段组件按父语境渲染',
      `${path}.type`,
      '请改为 r-text / r-number / r-select 等 r-* 字段组件，并通过 field 绑定列。',
    )
  }

  const fieldName = extractFieldName(node)
  if (typeName !== '' && fieldName !== null && isSparkFieldType(typeName) && inheritedContext === null) {
    pushIssue(
      issues,
      'component',
      'warning',
      `字段组件「${typeName}(${fieldName})」缺少父容器语境（table/form/detail/list/tree）`,
      path,
      '请将字段组件放入 r-table / r-form / r-detail / r-list / r-tree 容器，以便自动感知父语境渲染。',
    )
  }

  const children = node['children']
  if (Array.isArray(children)) {
    children.forEach((item, index) => validateContextAwareStructure(item, `${path}.children[${index}]`, issues, currentContext))
  }
}

function pushIssue(
  issues: ConfigValidationIssue[],
  category: ConfigValidationCategory,
  severity: ConfigValidationSeverity,
  message: string,
  path: string,
  suggestion?: string,
): void {
  issues.push({ category, severity, message, path, ...(suggestion !== undefined ? { suggestion } : {}) })
}

function buildSummary(issues: ConfigValidationIssue[]): ConfigValidationSummary {
  if (issues.length === 0) return { ...EMPTY_SUMMARY, byCategory: { ...EMPTY_SUMMARY.byCategory } }

  const byCategory: Record<ConfigValidationCategory, number> = {
    dataKey: 0,
    handler: 0,
    render: 0,
    component: 0,
  }

  let errors = 0
  let warnings = 0

  for (const issue of issues) {
    byCategory[issue.category] += 1
    if (issue.severity === 'error') errors += 1
    else warnings += 1
  }

  return {
    total: issues.length,
    errors,
    warnings,
    byCategory,
  }
}

const VALID_AGGREGATE_TYPES = new Set(['sum', 'count', 'avg', 'min', 'max', 'join'])

function validateAggregatesConfig(
  pageDataJson: unknown,
  issues: ConfigValidationIssue[],
): void {
  const root = asRecord(pageDataJson)
  if (root === null) return

  const tables = asRecord(root['tables'])
  if (tables === null) return

  for (const [tableName, tableValue] of Object.entries(tables)) {
    const table = asRecord(tableValue)
    if (table === null) continue

    // aggregates 可在表顶层、或 views.{viewId} 内
    const aggSources: Array<{ agg: Record<string, unknown>; loc: string }> = []

    const topAgg = asRecord(table['aggregates'])
    if (topAgg !== null) {
      aggSources.push({ agg: topAgg, loc: `tables.${tableName}.aggregates` })
    }

    const views = asRecord(table['views'])
    if (views !== null) {
      for (const [viewId, viewValue] of Object.entries(views)) {
        const viewAgg = asRecord(asRecord(viewValue)?.['aggregates'])
        if (viewAgg !== null) {
          aggSources.push({ agg: viewAgg, loc: `tables.${tableName}.views.${viewId}.aggregates` })
        }
      }
    }

    for (const { agg, loc } of aggSources) {
      for (const [field, aggValue] of Object.entries(agg)) {
        const aggDef = asRecord(aggValue)
        if (aggDef === null) {
          pushIssue(issues, 'dataKey', 'warning',
            `聚合配置「${loc}.${field}」应为对象 { type: "sum"|"avg"|... }`, loc,
            '聚合定义格式：{ type: "sum" } 或 { type: "join", field: "name" }')
          continue
        }
        const aggType = aggDef['type']
        if (typeof aggType !== 'string' || !VALID_AGGREGATE_TYPES.has(aggType)) {
          pushIssue(issues, 'dataKey', 'warning',
            `聚合「${loc}.${field}.type」值「${String(aggType)}」不合法`,
            `${loc}.${field}.type`,
            `合法的聚合类型：${[...VALID_AGGREGATE_TYPES].join(', ')}`)
        }
      }
    }
  }
}

export function validateGeneratedConfig(files: GeneratedPageFiles): ConfigValidationReport {
  const issues: ConfigValidationIssue[] = []

  const ruleJson = parseJson(files['rule.json'])
  const pageDataJson = parseJson(files['pagedata.json'])
  const scriptFunctions = extractScriptFunctions(files['script.js'])
  const tableNames = extractTableNames(pageDataJson)

  if (files['rule.json'] !== undefined && ruleJson === null) {
    pushIssue(
      issues,
      'component',
      'error',
      'rule.json 不是有效 JSON，无法执行结构校验',
      'rule.json',
      '请先修复 rule.json 语法再重试。',
    )
  }

  if (files['pagedata.json'] !== undefined && pageDataJson === null) {
    pushIssue(
      issues,
      'dataKey',
      'warning',
      'pagedata.json 不是有效 JSON，跳过表引用校验',
      'pagedata.json',
      '请修复 pagedata.json 语法以启用表引用校验。',
    )
  }

  const nodes: RuleNodeSnapshot[] = []
  if (ruleJson !== null) {
    collectRuleNodes(ruleJson, 'rules', nodes)
    validateContextAwareStructure(ruleJson, 'rules', issues, null)
  }

  // 收集所有 dataKey 用于 highlightCurrentRow 交叉检查
  const tableDataKeys = new Map<string, string>() // tableName → path（最后一个 r-table 的路径）
  const tablesWithHighlight = new Set<string>()    // 有 highlightCurrentRow 的表名
  const tablesUsingCurrentRow = new Set<string>()  // 使用 @currentRow 的表名

  for (const { node, path } of nodes) {
    const typeName = node['type']
    if (typeof typeName === 'string') {
      if (!isLikelyComponentType(typeName)) {
        pushIssue(
          issues,
          'component',
          'warning',
          `组件类型「${typeName}」可能未注册`,
          `${path}.type`,
          '优先使用 r-*/el-*/Render* 或已注册的 kebab-case 组件。',
        )
      }

      if (typeName.startsWith('Render') && !scriptFunctions.has(typeName)) {
        pushIssue(
          issues,
          'render',
          'error',
          `渲染函数「${typeName}」未在 script.js 中定义`,
          `${path}.type`,
          `请在 script.js 中添加 function ${typeName}() { ... }。`,
        )
      }

      // 检测 name 属性（应使用 field）
      if (typeName.startsWith('r-') && typeof node['name'] === 'string' && node['field'] === undefined) {
        pushIssue(
          issues,
          'component',
          'warning',
          `「${typeName}」使用了 name 属性「${node['name']}」，请改用 field`,
          `${path}.name`,
          '字段绑定请使用 field 声明。',
        )
      }

      // 收集 r-table 的 highlightCurrentRow 信息
      if (typeName === 'r-table' || typeName === 'el-table') {
        const dk = node['dataKey']
        if (typeof dk === 'string') {
          const tbl = parseDataKeyTable(dk)
          if (tbl.tableName !== null) {
            tableDataKeys.set(tbl.tableName, path)
            const props = asRecord(node['props'])
            if (props?.['highlightCurrentRow'] === true) {
              tablesWithHighlight.add(tbl.tableName)
            }
          }
        }
      }
    }

    const dataKey = node['dataKey']
    if (typeof dataKey === 'string') {
      if (!DATAKEY_RE.test(dataKey)) {
        pushIssue(
          issues,
          'dataKey',
          'error',
          `DataKey「${dataKey}」格式不正确`,
          `${path}.dataKey`,
          '格式应为 table@field 或 table@viewId@field（支持 #scope 前缀）。',
        )
      } else {
        const parsed = parseDataKeyTable(dataKey)
        if (!parsed.crossPage && parsed.tableName !== null && tableNames.size > 0 && !tableNames.has(parsed.tableName)) {
          pushIssue(
            issues,
            'dataKey',
            'error',
            `DataKey 引用的表「${parsed.tableName}」在 pagedata.json 中不存在`,
            `${path}.dataKey`,
            '请校对 dataKey 表名与 pagedata.json tables 定义。',
          )
        }
        // 记录使用 @currentRow 的表名
        if (parsed.tableName !== null && dataKey.includes('@currentRow')) {
          tablesUsingCurrentRow.add(parsed.tableName)
        }
      }
    }

    const events = asRecord(node['on'])
    if (events !== null) {
      for (const [eventName, handler] of Object.entries(events)) {
        if (typeof handler !== 'string') continue
        const trimmed = handler.trim()
        if (trimmed === '') continue
        if (!scriptFunctions.has(trimmed)) {
          pushIssue(
            issues,
            'handler',
            'error',
            `事件处理函数「${trimmed}」未在 script.js 中定义`,
            `${path}.on.${eventName}`,
            `请在 script.js 中补充 ${trimmed} 函数实现。`,
          )
        }
      }
    }
  }

  // 交叉检查：使用 @currentRow 的表是否有对应的 highlightCurrentRow
  for (const tableName of tablesUsingCurrentRow) {
    if (tableDataKeys.has(tableName) && !tablesWithHighlight.has(tableName)) {
      pushIssue(
        issues,
        'component',
        'warning',
        `表「${tableName}」被 @currentRow 引用，但对应 r-table 未声明 highlightCurrentRow`,
        tableDataKeys.get(tableName) ?? 'rules',
        '请在该 r-table 的 props 中添加 "highlightCurrentRow": true，否则当前行无高亮效果。',
      )
    }
  }

  // 交叉检查：style / class 放在节点顶层而非 props 内
  for (const { node, path } of nodes) {
    if (node['style'] !== undefined && typeof node['type'] === 'string') {
      const props = asRecord(node['props'])
      if (props?.['style'] === undefined) {
        pushIssue(
          issues,
          'component',
          'warning',
          `节点「${node['type']}」的 style 写在顶层，应移入 props 内`,
          `${path}.style`,
          '请将 style 移入 props: { style: {...} }。',
        )
      }
    }
    if (node['class'] !== undefined && typeof node['type'] === 'string') {
      const props = asRecord(node['props'])
      if (props?.['class'] === undefined) {
        pushIssue(
          issues,
          'component',
          'warning',
          `节点「${node['type']}」的 class 写在顶层，应移入 props 内`,
          `${path}.class`,
          '请将 class 移入 props: { class: "..." }。',
        )
      }
    }
  }

  // 交叉检查：aggregates 配置的合法性
  validateAggregatesConfig(pageDataJson, issues)

  const summary = buildSummary(issues)
  return {
    valid: summary.errors === 0,
    summary,
    issues,
  }
}
