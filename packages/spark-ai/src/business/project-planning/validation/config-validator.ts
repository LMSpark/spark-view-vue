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

interface RuleValidationContext {
  issues: ConfigValidationIssue[]
  scriptFunctions: Set<string>
  tableNames: Set<string>
  tableDataKeys: Map<string, string>
  tablesWithHighlight: Set<string>
  tablesUsingCurrentRow: Set<string>
}

type JsonInputSpec = {
  fileName: 'rule.json' | 'pagedata.json'
  category: ConfigValidationCategory
  severity: ConfigValidationSeverity
  message: string
  suggestion: string
}

type JsonInputFileName = JsonInputSpec['fileName']
type ParsedJsonMap = Partial<Record<JsonInputFileName, unknown>>

type ValidationInputs = {
  ruleJson: unknown
  pageDataJson: unknown
  scriptFunctions: Set<string>
  tableNames: Set<string>
}

type RenderContext = 'table' | 'form' | 'detail' | 'list' | 'tree'

import { DATAKEY_RE, HTML_TYPES, VALID_TYPE_PREFIXES, CONTAINER_CONTEXT_MAP, NON_FIELD_R_TYPES } from './shared-constants'

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

const TOP_LEVEL_PROP_RULES: ReadonlyArray<{ propName: 'style' | 'class'; suggestion: string }> = [
  { propName: 'style', suggestion: '请将 style 移入 props: { style: {...} }。' },
  { propName: 'class', suggestion: '请将 class 移入 props: { class: "..." }。' },
]

const JSON_INPUT_SPECS: readonly JsonInputSpec[] = [
  {
    fileName: 'rule.json',
    category: 'component',
    severity: 'error',
    message: 'rule.json 不是有效 JSON，无法执行结构校验',
    suggestion: '请先修复 rule.json 语法再重试。',
  },
  {
    fileName: 'pagedata.json',
    category: 'dataKey',
    severity: 'warning',
    message: 'pagedata.json 不是有效 JSON，跳过表引用校验',
    suggestion: '请修复 pagedata.json 语法以启用表引用校验。',
  },
]

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function parseJson(content: string | undefined): unknown {
  const trimmed = content?.trim()
  if (trimmed === undefined || trimmed === '') return null
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}

function extractScriptFunctions(script: string | undefined): Set<string> {
  const names = new Set<string>()
  const scriptText = asNonEmptyString(script)
  if (scriptText === null) return names

  const declarationPattern = /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gu
  const arrowPattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gu
  const functionExprPattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\b/gu

  for (const pattern of [declarationPattern, arrowPattern, functionExprPattern]) {
    for (const match of scriptText.matchAll(pattern)) {
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

function parseDataKeyTable(dataKey: string): { tableName: string | null; crossPage: boolean } | null {
  if (!DATAKEY_RE.test(dataKey)) return null
  const parts = dataKey.split('@')
  if (parts[0]?.startsWith('#')) {
    return { tableName: parts[1] ?? null, crossPage: true }
  }
  return { tableName: parts[0] ?? null, crossPage: false }
}

function addIfNonEmpty(target: Set<string>, value: unknown): void {
  const text = asNonEmptyString(value)
  if (text !== null) target.add(text)
}

function extractTableNames(pageData: unknown): Set<string> {
  const names = new Set<string>()
  const root = asRecord(pageData)
  if (root === null) return names

  const tables = root['tables']
  if (Array.isArray(tables)) {
    for (const item of tables) {
      const record = asRecord(item)
      addIfNonEmpty(names, record?.['tableName'])
    }
    return names
  }

  const tableMap = asRecord(tables)
  if (tableMap !== null) {
    for (const key of Object.keys(tableMap)) {
      addIfNonEmpty(names, key)
    }
  }

  return names
}

function extractFieldName(node: Record<string, unknown>): string | null {
  return asNonEmptyString(node['field'])
}

function isSparkFieldType(typeName: string): boolean {
  return typeName.startsWith('r-') && !NON_FIELD_R_TYPES.has(typeName)
}

function isTableContainerType(typeName: string): boolean {
  return typeName === 'r-table' || typeName === 'el-table'
}

function pushMissingScriptFunctionIssue(
  issues: ConfigValidationIssue[],
  category: Extract<ConfigValidationCategory, 'render' | 'handler'>,
  functionName: string,
  path: string,
): void {
  const message = category === 'render'
    ? `渲染函数「${functionName}」未在 script.js 中定义`
    : `事件处理函数「${functionName}」未在 script.js 中定义`
  const suggestion = category === 'render'
    ? `请在 script.js 中添加 function ${functionName}() { ... }。`
    : `请在 script.js 中补充 ${functionName} 函数实现。`
  pushIssue(issues, category, 'error', message, path, suggestion)
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
            `聚合配置「${loc}.${field}」应为对象 { type: "sum"|"avg"|... }`,
            loc,
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

function validateNodeTypeAndContainer(
  node: Record<string, unknown>,
  path: string,
  context: RuleValidationContext,
): void {
  const typeName = node['type']
  if (typeof typeName !== 'string') return

  if (!isLikelyComponentType(typeName)) {
    pushIssue(
      context.issues,
      'component',
      'warning',
      `组件类型「${typeName}」可能未注册`,
      `${path}.type`,
      '优先使用 r-*/el-*/Render* 或已注册的 kebab-case 组件。',
    )
  }

  if (typeName.startsWith('Render') && !context.scriptFunctions.has(typeName)) {
    pushMissingScriptFunctionIssue(context.issues, 'render', typeName, `${path}.type`)
  }

  if (typeName.startsWith('r-') && typeof node['name'] === 'string' && node['field'] === undefined) {
    pushIssue(
      context.issues,
      'component',
      'warning',
      `「${typeName}」使用了 name 属性「${node['name']}」，请改用 field`,
      `${path}.name`,
      '字段绑定请使用 field 声明。',
    )
  }

  if (!isTableContainerType(typeName)) return

  const dataKey = node['dataKey']
  if (typeof dataKey !== 'string') return

  const parsed = parseDataKeyTable(dataKey)
  const tableName = parsed?.tableName
  if (tableName === null || tableName === undefined) return

  context.tableDataKeys.set(tableName, path)
  const props = asRecord(node['props'])
  if (props?.['highlightCurrentRow'] === true) {
    context.tablesWithHighlight.add(tableName)
  }
}

function validateNodeDataKey(
  node: Record<string, unknown>,
  path: string,
  context: RuleValidationContext,
): void {
  const dataKey = node['dataKey']
  if (typeof dataKey !== 'string') return

  const parsed = parseDataKeyTable(dataKey)
  if (!parsed) {
    pushIssue(
      context.issues,
      'dataKey',
      'error',
      `DataKey「${dataKey}」格式不正确`,
      `${path}.dataKey`,
      '格式应为 table@field 或 table@viewId@field（支持 #scope 前缀）。',
    )
    return
  }

  if (!parsed.crossPage && parsed.tableName !== null && context.tableNames.size > 0 && !context.tableNames.has(parsed.tableName)) {
    pushIssue(
      context.issues,
      'dataKey',
      'error',
      `DataKey 引用的表「${parsed.tableName}」在 pagedata.json 中不存在`,
      `${path}.dataKey`,
      '请校对 dataKey 表名与 pagedata.json tables 定义。',
    )
  }

  if (parsed.tableName !== null && dataKey.includes('@currentRow')) {
    context.tablesUsingCurrentRow.add(parsed.tableName)
  }
}

function validateNodeHandlers(
  node: Record<string, unknown>,
  path: string,
  context: RuleValidationContext,
): void {
  const events = asRecord(node['on'])
  if (events === null) return

  for (const [eventName, handler] of Object.entries(events)) {
    const trimmed = asNonEmptyString(handler)
    if (trimmed === null) continue
    if (!context.scriptFunctions.has(trimmed)) {
      pushMissingScriptFunctionIssue(context.issues, 'handler', trimmed, `${path}.on.${eventName}`)
    }
  }
}

function validateRuleNode(
  node: Record<string, unknown>,
  path: string,
  context: RuleValidationContext,
): void {
  for (const validator of RULE_NODE_VALIDATORS) {
    validator(node, path, context)
  }
}

const RULE_NODE_VALIDATORS: ReadonlyArray<(
  node: Record<string, unknown>,
  path: string,
  context: RuleValidationContext,
) => void> = [
  validateNodeTypeAndContainer,
  validateNodeDataKey,
  validateNodeHandlers,
]

function validateCurrentRowHighlightConsistency(context: RuleValidationContext): void {
  for (const tableName of context.tablesUsingCurrentRow) {
    if (!context.tableDataKeys.has(tableName) || context.tablesWithHighlight.has(tableName)) continue
    pushIssue(
      context.issues,
      'component',
      'warning',
      `表「${tableName}」被 @currentRow 引用，但对应 r-table 未声明 highlightCurrentRow`,
      context.tableDataKeys.get(tableName) ?? 'rules',
      '请在该 r-table 的 props 中添加 "highlightCurrentRow": true，否则当前行无高亮效果。',
    )
  }
}

function validateTopLevelPropPlacement(nodes: RuleNodeSnapshot[], issues: ConfigValidationIssue[]): void {
  for (const { node, path } of nodes) {
    const typeName = node['type']
    if (typeof typeName !== 'string') continue

    const props = asRecord(node['props'])
    for (const { propName, suggestion } of TOP_LEVEL_PROP_RULES) {
      if (node[propName] === undefined || props?.[propName] !== undefined) continue
      pushIssue(
        issues,
        'component',
        'warning',
        `节点「${typeName}」的 ${propName} 写在顶层，应移入 props 内`,
        `${path}.${propName}`,
        suggestion,
      )
    }
  }
}

function reportInvalidJsonInputs(
  files: GeneratedPageFiles,
  parsedJson: ParsedJsonMap,
  issues: ConfigValidationIssue[],
): void {
  for (const spec of JSON_INPUT_SPECS) {
    if (files[spec.fileName] === undefined || parsedJson[spec.fileName] !== null) continue
    pushIssue(
      issues,
      spec.category,
      spec.severity,
      spec.message,
      spec.fileName,
      spec.suggestion,
    )
  }
}

function createRuleValidationContext(
  issues: ConfigValidationIssue[],
  scriptFunctions: Set<string>,
  tableNames: Set<string>,
): RuleValidationContext {
  return {
    issues,
    scriptFunctions,
    tableNames,
    tableDataKeys: new Map<string, string>(),
    tablesWithHighlight: new Set<string>(),
    tablesUsingCurrentRow: new Set<string>(),
  }
}

function prepareValidationInputs(files: GeneratedPageFiles): ValidationInputs {
  const ruleJson = parseJson(files['rule.json'])
  const pageDataJson = parseJson(files['pagedata.json'])
  return {
    ruleJson,
    pageDataJson,
    scriptFunctions: extractScriptFunctions(files['script.js']),
    tableNames: extractTableNames(pageDataJson),
  }
}

function collectRuleNodesFromJson(
  ruleJson: unknown,
  issues: ConfigValidationIssue[],
): RuleNodeSnapshot[] {
  const nodes: RuleNodeSnapshot[] = []
  if (ruleJson === null) return nodes
  collectRuleNodes(ruleJson, 'rules', nodes)
  validateContextAwareStructure(ruleJson, 'rules', issues, null)
  return nodes
}

export function validateGeneratedConfig(files: GeneratedPageFiles): ConfigValidationReport {
  const issues: ConfigValidationIssue[] = []

  const { ruleJson, pageDataJson, scriptFunctions, tableNames } = prepareValidationInputs(files)

  reportInvalidJsonInputs(files, {
    'rule.json': ruleJson,
    'pagedata.json': pageDataJson,
  }, issues)

  const nodes = collectRuleNodesFromJson(ruleJson, issues)

  const context = createRuleValidationContext(issues, scriptFunctions, tableNames)

  for (const { node, path } of nodes) {
    validateRuleNode(node, path, context)
  }

  validateCurrentRowHighlightConsistency(context)
  validateTopLevelPropPlacement(nodes, issues)

  validateAggregatesConfig(pageDataJson, issues)

  const summary = buildSummary(issues)
  return {
    valid: summary.errors === 0,
    summary,
    issues,
  }
}
