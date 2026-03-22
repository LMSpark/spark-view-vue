/**
 * 基于 component-catalog.json 的 AI 生成内容校验器
 *
 * 所有校验规则从 {@link ComponentCatalog} JSON 读取，
 * 零前端依赖，可在任何 Node.js / 云端环境运行。
 *
 * @module catalog-validator
 */

import type {
  ComponentCatalog,
  ComponentEntry,
  NestingRule,
  PlatformConstraints,
} from './component-catalog-schema'

/* --------------------------------------------------------------------------
 * 公共类型（与 spark-ai config-validator 兼容）
 * ----------------------------------------------------------------------- */

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

export interface GeneratedPageFiles {
  'rule.json'?: string
  'pagedata.json'?: string
  'script.js'?: string
  'style.css'?: string
}

/* --------------------------------------------------------------------------
 * 公共 API
 * ----------------------------------------------------------------------- */

/**
 * 基于 JSON 目录校验 AI 生成的页面配置
 *
 * 比 `spark-ai/config-validator` 更强：
 * - 组件 type 可与目录中的注册表精确匹配
 * - Props 名称校验（检测不存在的 prop）
 * - 嵌套规则校验（来自 catalog.constraints.nestingRules）
 * - 平台约束校验（dataKey、aggregates）
 *
 * 所有规则来自 catalog JSON，无硬编码常量。
 */
export function validateWithCatalog(
  catalog: ComponentCatalog,
  files: GeneratedPageFiles,
): ConfigValidationReport {
  const issues: ConfigValidationIssue[] = []
  const constraints = catalog.constraints
  const dataKeyRe = new RegExp(constraints.dataKeyPattern)
  const htmlTypes = new Set(constraints.htmlTypes)
  const knownTypes = new Set(Object.keys(catalog.components))

  // Parse inputs
  const ruleJson = parseJson(files['rule.json'])
  const pageDataJson = parseJson(files['pagedata.json'])
  const scriptFunctions = extractScriptFunctions(files['script.js'])
  const tableNames = extractTableNames(pageDataJson)

  // --- JSON validity ---
  if (files['rule.json'] !== undefined && ruleJson === null) {
    pushIssue(issues, 'component', 'error',
      'rule.json 不是有效 JSON，无法执行结构校验', 'rule.json',
      '请先修复 rule.json 语法再重试。')
  }
  if (files['pagedata.json'] !== undefined && pageDataJson === null) {
    pushIssue(issues, 'dataKey', 'warning',
      'pagedata.json 不是有效 JSON，跳过表引用校验', 'pagedata.json',
      '请修复 pagedata.json 语法以启用表引用校验。')
  }

  // --- Collect nodes ---
  const nodes: RuleNodeSnapshot[] = []
  if (ruleJson !== null) {
    collectRuleNodes(ruleJson, 'rules', nodes)
  }

  // Cross-check accumulators
  const tableDataKeys = new Map<string, string>()
  const tablesWithHighlight = new Set<string>()
  const tablesUsingCurrentRow = new Set<string>()

  // --- Per-node checks ---
  for (const { node, path } of nodes) {
    const typeName = typeof node['type'] === 'string' ? node['type'] : ''

    if (typeName !== '') {
      // 1) Component type validation
      validateComponentType(typeName, path, issues, {
        catalog, htmlTypes, knownTypes, validTypePrefixes: constraints.validTypePrefixes,
      })

      // 2) Render function reference
      if (typeName.startsWith('Render') && !scriptFunctions.has(typeName)) {
        pushIssue(issues, 'render', 'error',
          `渲染函数「${typeName}」未在 script.js 中定义`, `${path}.type`,
          `请在 script.js 中添加 function ${typeName}() { ... }。`)
      }

      // 3) name vs field
      if (typeName.startsWith('r-') && typeof node['name'] === 'string' && node['field'] === undefined) {
        pushIssue(issues, 'component', 'warning',
          `「${typeName}」使用了 name 属性「${node['name']}」，请改用 field`, `${path}.name`,
          '字段绑定请使用 field 声明。')
      }

      // 4) Props validation (against catalog)
      validateProps(typeName, node, path, issues, catalog)

      // 5) Required props check
      validateRequiredProps(typeName, node, path, issues, catalog)

      // 6) Emit event-name validation
      validateEmitNames(typeName, node, path, issues, catalog)

      // 7) Collect r-table info for highlight cross-check
      if (typeName === 'r-table' || typeName === 'el-table') {
        collectTableInfo(node, path, tableDataKeys, tablesWithHighlight, dataKeyRe)
      }
    }

    // 8) DataKey validation
    validateDataKey(node, path, issues, dataKeyRe, tableNames, tablesUsingCurrentRow)

    // 9) Event handler references
    validateEventHandlers(node, path, issues, scriptFunctions)

    // 10) Style/class top-level check
    validateStyleClassPlacement(node, path, issues)
  }

  // --- Context-aware structure ---
  if (ruleJson !== null) {
    validateContextAwareStructure(ruleJson, 'rules', issues, null, constraints)
  }

  // --- Nesting rules ---
  if (ruleJson !== null) {
    validateNestingRules(ruleJson, 'rules', issues, constraints.nestingRules)
  }

  // --- Cross-checks ---
  for (const tableName of tablesUsingCurrentRow) {
    if (tableDataKeys.has(tableName) && !tablesWithHighlight.has(tableName)) {
      pushIssue(issues, 'component', 'warning',
        `表「${tableName}」被 @currentRow 引用，但对应 r-table 未声明 highlightCurrentRow`,
        tableDataKeys.get(tableName) ?? 'rules',
        '请在该 r-table 的 props 中添加 "highlightCurrentRow": true，否则当前行无高亮效果。')
    }
  }

  // --- Aggregates ---
  validateAggregatesConfig(pageDataJson, issues, new Set(constraints.validAggregateTypes))

  const summary = buildSummary(issues)
  return { valid: summary.errors === 0, summary, issues }
}

/* --------------------------------------------------------------------------
 * 内部辅助
 * ----------------------------------------------------------------------- */

interface RuleNodeSnapshot {
  node: Record<string, unknown>
  path: string
}

// ─── JSON / script 解析 ───

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
  const patterns = [
    /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gu,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gu,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\b/gu,
  ]
  for (const pattern of patterns) {
    for (const match of script.matchAll(pattern)) {
      const name = match[1]
      if (name !== undefined) names.add(name)
    }
  }
  return names
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
      if (typeof tableName === 'string' && tableName.trim() !== '') names.add(tableName)
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

// ─── 节点采集 ───

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

// ─── issue 构建 ───

function pushIssue(
  issues: ConfigValidationIssue[],
  category: ConfigValidationCategory,
  severity: ConfigValidationSeverity,
  message: string,
  path: string,
  suggestion?: string,
): void {
  issues.push({
    category,
    severity,
    message,
    path,
    ...(suggestion !== undefined ? { suggestion } : {}),
  })
}

function buildSummary(issues: ConfigValidationIssue[]): ConfigValidationSummary {
  const byCategory: Record<ConfigValidationCategory, number> = {
    dataKey: 0, handler: 0, render: 0, component: 0,
  }
  let errors = 0
  let warnings = 0
  for (const issue of issues) {
    byCategory[issue.category] += 1
    if (issue.severity === 'error') errors += 1
    else warnings += 1
  }
  return { total: issues.length, errors, warnings, byCategory }
}

// ─── 组件 type 校验 ───

interface ComponentTypeContext {
  catalog: ComponentCatalog
  htmlTypes: Set<string>
  knownTypes: Set<string>
  validTypePrefixes: string[]
}

function validateComponentType(
  typeName: string,
  path: string,
  issues: ConfigValidationIssue[],
  ctx: ComponentTypeContext,
): void {
  // HTML 原生标签、Render 函数、目录中已知组件 → 通过
  if (ctx.htmlTypes.has(typeName)) return
  if (typeName.startsWith('Render')) return
  if (ctx.knownTypes.has(typeName)) return

  // 前缀匹配（el-* 等第三方组件）
  const hasValidPrefix = ctx.validTypePrefixes.some(prefix => typeName.startsWith(prefix))
  if (hasValidPrefix) return

  // kebab-case 双段检查（自定义组件）
  if (/^[a-z][a-z0-9-]*$/u.test(typeName) && typeName.includes('-')) return

  pushIssue(issues, 'component', 'warning',
    `组件类型「${typeName}」可能未注册`, `${path}.type`,
    '优先使用 r-*/el-*/Render* 或已注册的 kebab-case 组件。')
}

// ─── Props 校验 ───

function validateProps(
  typeName: string,
  node: Record<string, unknown>,
  path: string,
  issues: ConfigValidationIssue[],
  catalog: ComponentCatalog,
): void {
  const entry: ComponentEntry | undefined = catalog.components[typeName]
  if (entry === undefined) return
  if (entry.props.length === 0) return

  const props = asRecord(node['props'])
  if (props === null) return

  const knownPropNames = new Set(entry.props.map(p => p.name))
  // sparkChildren, config 是框架透传，不报
  knownPropNames.add('sparkChildren')
  knownPropNames.add('config')
  // 通用 HTML 属性
  knownPropNames.add('style')
  knownPropNames.add('class')
  knownPropNames.add('id')

  for (const propName of Object.keys(props)) {
    if (!knownPropNames.has(propName)) {
      pushIssue(issues, 'component', 'warning',
        `组件「${typeName}」不存在 prop「${propName}」`,
        `${path}.props.${propName}`,
        `已知 props: ${entry.props.map(p => p.name).join(', ')}`)
    }
  }
}

// ─── Required props 校验 ───

/** 框架透传或通用 prop，不应视为缺失 */
const FRAMEWORK_PROPS = new Set(['sparkChildren', 'config', 'style', 'class', 'id'])

function validateRequiredProps(
  typeName: string,
  node: Record<string, unknown>,
  path: string,
  issues: ConfigValidationIssue[],
  catalog: ComponentCatalog,
): void {
  const entry: ComponentEntry | undefined = catalog.components[typeName]
  if (entry === undefined) return

  const requiredProps = entry.props.filter(p => p.required && !FRAMEWORK_PROPS.has(p.name))
  if (requiredProps.length === 0) return

  const providedProps = asRecord(node['props'])
  const providedKeys = providedProps !== null ? new Set(Object.keys(providedProps)) : new Set<string>()

  for (const prop of requiredProps) {
    if (!providedKeys.has(prop.name)) {
      pushIssue(issues, 'component', 'warning',
        `组件「${typeName}」缺少必填 prop「${prop.name}」（类型: ${prop.type}）`,
        `${path}.props`,
        `请添加 props.${prop.name}。`)
    }
  }
}

// ─── Emit 事件名校验 ───

function validateEmitNames(
  typeName: string,
  node: Record<string, unknown>,
  path: string,
  issues: ConfigValidationIssue[],
  catalog: ComponentCatalog,
): void {
  const entry: ComponentEntry | undefined = catalog.components[typeName]
  if (entry === undefined) return
  if (entry.emits.length === 0) return

  const events = asRecord(node['on'])
  if (events === null) return

  const knownEmits = new Set(entry.emits.map(e => e.name))

  for (const eventName of Object.keys(events)) {
    if (!knownEmits.has(eventName)) {
      pushIssue(issues, 'component', 'warning',
        `组件「${typeName}」未声明事件「${eventName}」`,
        `${path}.on.${eventName}`,
        `已知 emits: ${entry.emits.map(e => e.name).join(', ')}。如该事件来自原生 DOM，可忽略此警告。`)
    }
  }
}

// ─── DataKey 校验 ───

function parseDataKeyTable(dataKey: string, re: RegExp): { tableName: string | null; crossPage: boolean } {
  if (!re.test(dataKey)) return { tableName: null, crossPage: false }
  const parts = dataKey.split('@')
  if (parts.length === 0) return { tableName: null, crossPage: false }
  if (parts[0]?.startsWith('#')) {
    return { tableName: parts[1] ?? null, crossPage: true }
  }
  return { tableName: parts[0] ?? null, crossPage: false }
}

function validateDataKey(
  node: Record<string, unknown>,
  path: string,
  issues: ConfigValidationIssue[],
  dataKeyRe: RegExp,
  tableNames: Set<string>,
  tablesUsingCurrentRow: Set<string>,
): void {
  const dataKey = node['dataKey']
  if (typeof dataKey !== 'string') return

  if (!dataKeyRe.test(dataKey)) {
    pushIssue(issues, 'dataKey', 'error',
      `DataKey「${dataKey}」格式不正确`, `${path}.dataKey`,
      '格式应为 table@field 或 table@viewId@field（支持 #scope 前缀）。')
    return
  }

  const parsed = parseDataKeyTable(dataKey, dataKeyRe)
  if (!parsed.crossPage && parsed.tableName !== null && tableNames.size > 0 && !tableNames.has(parsed.tableName)) {
    pushIssue(issues, 'dataKey', 'error',
      `DataKey 引用的表「${parsed.tableName}」在 pagedata.json 中不存在`, `${path}.dataKey`,
      '请校对 dataKey 表名与 pagedata.json tables 定义。')
  }
  if (parsed.tableName !== null && dataKey.includes('@currentRow')) {
    tablesUsingCurrentRow.add(parsed.tableName)
  }
}

// ─── Event handler 校验 ───

function validateEventHandlers(
  node: Record<string, unknown>,
  path: string,
  issues: ConfigValidationIssue[],
  scriptFunctions: Set<string>,
): void {
  const events = asRecord(node['on'])
  if (events === null) return
  for (const [eventName, handler] of Object.entries(events)) {
    if (typeof handler !== 'string') continue
    const trimmed = handler.trim()
    if (trimmed === '' || scriptFunctions.has(trimmed)) continue
    pushIssue(issues, 'handler', 'error',
      `事件处理函数「${trimmed}」未在 script.js 中定义`, `${path}.on.${eventName}`,
      `请在 script.js 中补充 ${trimmed} 函数实现。`)
  }
}

// ─── Style/class 位置 ───

function validateStyleClassPlacement(
  node: Record<string, unknown>,
  path: string,
  issues: ConfigValidationIssue[],
): void {
  if (typeof node['type'] !== 'string') return
  const props = asRecord(node['props'])
  if (node['style'] !== undefined && props?.['style'] === undefined) {
    pushIssue(issues, 'component', 'warning',
      `节点「${node['type']}」的 style 写在顶层，应移入 props 内`, `${path}.style`,
      '请将 style 移入 props: { style: {...} }。')
  }
  if (node['class'] !== undefined && props?.['class'] === undefined) {
    pushIssue(issues, 'component', 'warning',
      `节点「${node['type']}」的 class 写在顶层，应移入 props 内`, `${path}.class`,
      '请将 class 移入 props: { class: "..." }。')
  }
}

// ─── 容器语境校验 ───

type RenderContext = 'table' | 'form' | 'detail' | 'list' | 'tree'

function validateContextAwareStructure(
  value: unknown,
  path: string,
  issues: ConfigValidationIssue[],
  inheritedContext: RenderContext | null,
  constraints: PlatformConstraints,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      validateContextAwareStructure(item, `${path}[${index}]`, issues, inheritedContext, constraints))
    return
  }
  const node = asRecord(value)
  if (node === null) return

  const typeName = typeof node['type'] === 'string' ? node['type'] : ''
  const containerCtx = constraints.containerContextMap[typeName] as RenderContext | undefined
  const currentContext: RenderContext | null = typeName === ''
    ? inheritedContext
    : (containerCtx ?? inheritedContext)

  // el-table-column inside r-table
  if (typeName === 'el-table-column' && inheritedContext === 'table') {
    pushIssue(issues, 'component', 'warning',
      'r-table 子节点不建议使用 el-table-column，建议使用 r-* 字段组件按父语境渲染',
      `${path}.type`,
      '请改为 r-text / r-number / r-select 等 r-* 字段组件，并通过 field 绑定列。')
  }

  // Field without parent container
  const nonFieldRTypes = new Set(constraints.nonFieldRTypes)
  if (typeName !== '' && isSparkFieldType(typeName, nonFieldRTypes) && inheritedContext === null) {
    const fieldName = extractFieldName(node)
    if (fieldName !== null) {
      pushIssue(issues, 'component', 'warning',
        `字段组件「${typeName}(${fieldName})」缺少父容器语境（table/form/detail/list/tree）`,
        path,
        '请将字段组件放入 r-table / r-form / r-detail / r-list / r-tree 容器，以便自动感知父语境渲染。')
    }
  }

  const children = node['children']
  if (Array.isArray(children)) {
    children.forEach((item, index) =>
      validateContextAwareStructure(item, `${path}.children[${index}]`, issues, currentContext, constraints))
  }
}

function isSparkFieldType(typeName: string, nonFieldRTypes: Set<string>): boolean {
  return typeName.startsWith('r-') && !nonFieldRTypes.has(typeName)
}

function extractFieldName(node: Record<string, unknown>): string | null {
  if (typeof node['field'] === 'string' && node['field'].trim() !== '') return node['field']
  const meta = asRecord(node['meta'])
  const data = asRecord(meta?.['data'])
  if (typeof data?.['field'] === 'string' && data['field'].trim() !== '') return data['field']
  return null
}

// ─── 嵌套规则校验 ───

function validateNestingRules(
  value: unknown,
  path: string,
  issues: ConfigValidationIssue[],
  nestingRules: Record<string, NestingRule>,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      validateNestingRules(item, `${path}[${index}]`, issues, nestingRules))
    return
  }
  const node = asRecord(value)
  if (node === null) return

  const typeName = typeof node['type'] === 'string' ? node['type'] : ''
  const rule: NestingRule | undefined = nestingRules[typeName]
  const children = node['children']

  if (rule !== undefined && Array.isArray(children)) {
    const allowedSet = new Set(rule.allowedChildren)
    const forbiddenSet = new Set(rule.forbiddenChildren ?? [])
    const hasWildcard = allowedSet.has('*')

    for (const [index, child] of children.entries()) {
      const childNode = asRecord(child)
      if (childNode === null) continue
      const childType = typeof childNode['type'] === 'string' ? childNode['type'] : ''
      if (childType === '') continue

      const childPath = `${path}.children[${index}]`

      if (forbiddenSet.has(childType)) {
        pushIssue(issues, 'component', 'error',
          `「${typeName}」禁止嵌套子组件「${childType}」`, `${childPath}.type`,
          rule.note ?? `「${typeName}」的合法子组件: ${rule.allowedChildren.join(', ')}`)
      } else if (!hasWildcard && !allowedSet.has(childType) && !matchesPrefixPattern(childType, allowedSet)) {
        pushIssue(issues, 'component', 'warning',
          `「${typeName}」下放置了不常见的子组件「${childType}」`, `${childPath}.type`,
          rule.note ?? `建议的子组件: ${rule.allowedChildren.join(', ')}`)
      }
    }
  }

  if (Array.isArray(children)) {
    children.forEach((item, index) =>
      validateNestingRules(item, `${path}.children[${index}]`, issues, nestingRules))
  }
}

/** 支持前缀匹配模式（如 "r-*" 匹配 "r-text"） */
function matchesPrefixPattern(typeName: string, allowedSet: Set<string>): boolean {
  for (const pattern of allowedSet) {
    if (pattern.endsWith('*') && typeName.startsWith(pattern.slice(0, -1))) {
      return true
    }
  }
  return false
}

// ─── r-table highlight 交叉引用 ───

function collectTableInfo(
  node: Record<string, unknown>,
  path: string,
  tableDataKeys: Map<string, string>,
  tablesWithHighlight: Set<string>,
  dataKeyRe: RegExp,
): void {
  const dk = node['dataKey']
  if (typeof dk !== 'string') return
  const parsed = parseDataKeyTable(dk, dataKeyRe)
  if (parsed.tableName === null) return
  tableDataKeys.set(parsed.tableName, path)
  const props = asRecord(node['props'])
  if (props?.['highlightCurrentRow'] === true) {
    tablesWithHighlight.add(parsed.tableName)
  }
}

// ─── Aggregates 校验 ───

function validateAggregatesConfig(
  pageDataJson: unknown,
  issues: ConfigValidationIssue[],
  validAggregateTypes: Set<string>,
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
    if (topAgg !== null) aggSources.push({ agg: topAgg, loc: `tables.${tableName}.aggregates` })

    const views = asRecord(table['views'])
    if (views !== null) {
      for (const [viewId, viewValue] of Object.entries(views)) {
        const viewAgg = asRecord(asRecord(viewValue)?.['aggregates'])
        if (viewAgg !== null) aggSources.push({ agg: viewAgg, loc: `tables.${tableName}.views.${viewId}.aggregates` })
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
        if (typeof aggType !== 'string' || !validAggregateTypes.has(aggType)) {
          pushIssue(issues, 'dataKey', 'warning',
            `聚合「${loc}.${field}.type」值「${String(aggType)}」不合法`,
            `${loc}.${field}.type`,
            `合法的聚合类型：${[...validAggregateTypes].join(', ')}`)
        }
      }
    }
  }
}
