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

      // SparkNode v3: 检测废弃的 name 属性（应使用 field）
      if (typeName.startsWith('r-') && typeof node['name'] === 'string' && node['field'] === undefined) {
        pushIssue(
          issues,
          'component',
          'warning',
          `「${typeName}」使用了废弃的 name 属性「${node['name']}」`,
          `${path}.name`,
          'SparkNode v3 已将 name 改为 field，请改用 field 声明字段绑定。',
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

  const summary = buildSummary(issues)
  return {
    valid: summary.errors === 0,
    summary,
    issues,
  }
}
