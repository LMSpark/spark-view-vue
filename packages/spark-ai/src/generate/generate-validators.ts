/**
 * Generate Validators — 双重校验器。
 *
 * 1. Tool-layer 校验：每个 emit* 调用时实时检查产物基本合法性
 * 2. Semantic-layer 校验：阶段完成后交叉一致性检查
 *
 * @module generate-validators
 */

import type { Phase } from './generate-tools-catalog'

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

/** 生成产物（可选，逐步填充） */
export interface GenerateArtifacts {
  pagedata?: string
  ruleJson?: string
  scriptJs?: string
  styleCss?: string
}

export interface ToolLayerValidationResult {
  passed: boolean
  issues: string[]
}

export interface SemanticValidationResult {
  passed: boolean
  issues: string[]
  /** 是否需要回溯到上一阶段 */
  requiresBacktrack: boolean
}

// ═══════════════════════════════════════════════════════════
// Tool-layer 校验 — emit* 调用时实时检查
// ═══════════════════════════════════════════════════════════

/**
 * 校验单个 emit* 工具提交的内容基本合法性。
 *
 * 此校验不检查语义正确性（交叉引用），只检查：
 * - JSON 语法合法
 * - 顶层结构存在关键字段
 */
export function validateToolLayerEmit(
  toolName: string,
  content: unknown,
): ToolLayerValidationResult {
  switch (toolName) {
    case 'emitPagedata':
      return validatePagedataStructure(content)
    case 'emitRuleJson':
      return validateRuleJsonStructure(content)
    case 'emitScriptJs':
      return validateScriptJsBasic(content)
    case 'emitStyleCss':
      return validateStyleCssBasic(content)
    default:
      return { passed: true, issues: [] }
  }
}

function validatePagedataStructure(content: unknown): ToolLayerValidationResult {
  const issues: string[] = []

  if (typeof content === 'string') {
    try {
      content = JSON.parse(content) as unknown
    } catch {
      return { passed: false, issues: ['pagedata.json 不是有效 JSON'] }
    }
  }

  if (typeof content !== 'object' || content === null) {
    return { passed: false, issues: ['pagedata.json 必须是 JSON 对象'] }
  }

  const root = content as Record<string, unknown>
  const dataset = root['dataset'] as Record<string, unknown> | undefined

  if (dataset === undefined || typeof dataset !== 'object') {
    issues.push('pagedata.json 顶层必须有 dataset 字段')
    return { passed: false, issues }
  }

  if (typeof dataset['dataSetName'] !== 'string') {
    issues.push('dataset.dataSetName 必须是字符串')
  }

  const tables = dataset['tables']
  if (typeof tables !== 'object' || tables === null) {
    issues.push('dataset.tables 必须是对象')
    return { passed: false, issues }
  }

  // 检查每张表
  for (const [tableName, tableValue] of Object.entries(tables as Record<string, unknown>)) {
    if (typeof tableValue !== 'object' || tableValue === null) {
      issues.push(`tables.${tableName} 必须是对象`)
      continue
    }

    const table = tableValue as Record<string, unknown>
    if (!Array.isArray(table['columns'])) {
      issues.push(`tables.${tableName} 缺少 columns 数组`)
    }

    // 检查是否有 views.default
    const views = table['views'] as Record<string, unknown> | undefined
    if (views === undefined || typeof views !== 'object') {
      issues.push(`tables.${tableName} 缺少 views.default`)
    } else if (views['default'] === undefined) {
      issues.push(`tables.${tableName}.views 缺少 default 视图`)
    }

    // 检查是否有表根级 rows（错误结构）
    if (table['rows'] !== undefined) {
      issues.push(`tables.${tableName} 不应有表根级 rows，行数据应放在 views.default.rows 中`)
    }

    // 检查是否有 isPrimaryKey
    if (Array.isArray(table['columns'])) {
      const hasPk = (table['columns'] as Array<Record<string, unknown>>).some(
        col => col['isPrimaryKey'] === true
      )
      if (!hasPk) {
        issues.push(`tables.${tableName} 没有标记 isPrimaryKey 的列`)
      }
    }
  }

  return { passed: issues.length === 0, issues }
}

function validateRuleJsonStructure(content: unknown): ToolLayerValidationResult {
  const issues: string[] = []

  if (typeof content === 'string') {
    try {
      content = JSON.parse(content) as unknown
    } catch {
      return { passed: false, issues: ['rule.json 不是有效 JSON'] }
    }
  }

  if (!Array.isArray(content)) {
    issues.push('rule.json 顶层必须是数组')
    return { passed: false, issues }
  }

  if (content.length === 0) {
    issues.push('rule.json 不能为空数组')
    return { passed: false, issues }
  }

  // 检查根节点有 type
  const nodes = content as unknown[]
  for (let i = 0; i < nodes.length; i++) {
    const node: unknown = nodes[i]
    if (typeof node !== 'object' || node === null) {
      issues.push(`rules[${i}] 不是有效对象`)
      continue
    }
    if (typeof (node as Record<string, unknown>)['type'] !== 'string') {
      issues.push(`rules[${i}] 缺少 type 字段`)
    }
  }

  return { passed: issues.length === 0, issues }
}

function validateScriptJsBasic(content: unknown): ToolLayerValidationResult {
  const issues: string[] = []

  if (typeof content !== 'string') {
    return { passed: false, issues: ['script.js 内容必须是字符串'] }
  }

  if (content.trim() === '') {
    return { passed: false, issues: ['script.js 不能为空'] }
  }

  // 检查是否有 __init__ 函数
  if (!/function\s+__init__\s*\(/u.test(content)) {
    issues.push('script.js 中必须定义 function __init__() { ... }')
  }

  // 检查禁止事项
  if (/\bimport\s+/u.test(content)) {
    issues.push('script.js 禁止使用 import 语句')
  }
  if (/\bElMessage\b/u.test(content)) {
    issues.push('script.js 禁止使用 ElMessage，请改用 $page.showMessage')
  }
  if (/\bElMessageBox\b/u.test(content)) {
    issues.push('script.js 禁止使用 ElMessageBox，请改用 $page.showConfirm/showPrompt')
  }

  return { passed: issues.length === 0, issues }
}

function validateStyleCssBasic(content: unknown): ToolLayerValidationResult {
  if (typeof content !== 'string') {
    return { passed: false, issues: ['style.css 内容必须是字符串'] }
  }
  // style.css 可以为空
  return { passed: true, issues: [] }
}

// ═══════════════════════════════════════════════════════════
// Semantic-layer 校验 — 阶段完成后交叉一致性检查
// ═══════════════════════════════════════════════════════════

/**
 * 阶段完成后的交叉一致性校验。
 *
 * - Phase data 完成后：检查 pagedata.json 内部一致性
 * - Phase ui 完成后：检查 rule.json / script.js 与 pagedata.json 的交叉引用
 * - Phase style 完成后：检查 class 引用
 */
export function validateSemanticCrossPhase(
  artifacts: GenerateArtifacts,
  currentPhase: Phase,
): SemanticValidationResult {
  switch (currentPhase) {
    case 'data':
      return validateDataPhase(artifacts)
    case 'ui':
      return validateUiPhase(artifacts)
    case 'style':
      return validateStylePhase(artifacts)
  }
}

function validateDataPhase(artifacts: GenerateArtifacts): SemanticValidationResult {
  const issues: string[] = []

  if (!artifacts.pagedata) {
    return { passed: false, issues: ['pagedata.json 未提交'], requiresBacktrack: false }
  }

  let pagedata: Record<string, unknown>
  try {
    pagedata = JSON.parse(artifacts.pagedata) as Record<string, unknown>
  } catch {
    return { passed: false, issues: ['pagedata.json 不是有效 JSON'], requiresBacktrack: false }
  }

  const dataset = pagedata['dataset'] as Record<string, unknown> | undefined
  if (!dataset) {
    return { passed: false, issues: ['缺少 dataset 字段'], requiresBacktrack: false }
  }

  const tables = dataset['tables'] as Record<string, unknown> | undefined
  if (!tables) {
    return { passed: false, issues: ['缺少 dataset.tables'], requiresBacktrack: false }
  }

  // 检查 tableRelations 引用的表是否存在
  const tableNames = new Set(Object.keys(tables))
  const relations = dataset['tableRelations']
  if (Array.isArray(relations)) {
    for (const rel of relations) {
      const r = rel as Record<string, unknown>
      if (typeof r['parentTable'] === 'string' && !tableNames.has(r['parentTable'])) {
        issues.push(`tableRelations 引用了不存在的父表: ${r['parentTable']}`)
      }
      if (typeof r['childTable'] === 'string' && !tableNames.has(r['childTable'])) {
        issues.push(`tableRelations 引用了不存在的子表: ${r['childTable']}`)
      }

      // 检查非法字段
      const illegalFields = ['autoLoad', 'lazyLoad', 'apiEnabled', 'parentViewId', 'childViewId']
      for (const field of illegalFields) {
        if (r[field] !== undefined) {
          issues.push(`tableRelations 使用了非标字段 ${field}`)
        }
      }
    }
  }

  return { passed: issues.length === 0, issues, requiresBacktrack: false }
}

function validateUiPhase(artifacts: GenerateArtifacts): SemanticValidationResult {
  const issues: string[] = []
  let requiresBacktrack = false

  if (!artifacts.ruleJson) {
    return { passed: false, issues: ['rule.json 未提交'], requiresBacktrack: false }
  }
  if (!artifacts.scriptJs) {
    return { passed: false, issues: ['script.js 未提交'], requiresBacktrack: false }
  }

  // 解析 rule.json
  let ruleNodes: unknown
  try {
    ruleNodes = JSON.parse(artifacts.ruleJson) as unknown
  } catch {
    return { passed: false, issues: ['rule.json 不是有效 JSON'], requiresBacktrack: false }
  }

  // 提取 script.js 函数名
  const scriptFunctions = extractFunctionNames(artifacts.scriptJs)

  // 提取 pagedata.json 表名
  const tableNames = new Set<string>()
  if (artifacts.pagedata) {
    try {
      const pd = JSON.parse(artifacts.pagedata) as Record<string, unknown>
      const dataset = pd['dataset'] as Record<string, unknown> | undefined
      const tables = dataset?.['tables'] as Record<string, unknown> | undefined
      if (tables) {
        for (const name of Object.keys(tables)) {
          tableNames.add(name)
        }
      }
    } catch {
      // pagedata 解析失败不影响 UI 校验
    }
  }

  // 遍历 rule.json 所有节点
  const nodes: Array<{ node: Record<string, unknown>; path: string }> = []
  collectNodes(ruleNodes, 'rules', nodes)

  for (const { node, path } of nodes) {
    const typeName = typeof node['type'] === 'string' ? node['type'] : ''

    // 检查 Render* 引用
    if (typeName.startsWith('Render') && !scriptFunctions.has(typeName)) {
      issues.push(`rule.json 引用了未定义的渲染函数: ${typeName} (${path})`)
    }

    // 检查事件 handler
    const events = node['on'] as Record<string, unknown> | undefined
    if (events && typeof events === 'object') {
      for (const [, handler] of Object.entries(events)) {
        if (typeof handler === 'string' && handler.trim() !== '' && !scriptFunctions.has(handler)) {
          issues.push(`事件处理函数 ${handler} 未在 script.js 中定义 (${path})`)
        }
      }
    }

    // 检查 dataKey 表引用
    const dataKey = node['dataKey']
    if (typeof dataKey === 'string' && tableNames.size > 0) {
      const tableName = extractTableFromDataKey(dataKey)
      if (tableName !== null && !tableName.startsWith('#') && !tableNames.has(tableName)) {
        issues.push(`dataKey "${dataKey}" 引用了不存在的表 "${tableName}" (${path})`)
        requiresBacktrack = true
      }
    }

    // 检查 rowActions 中的 Render* 引用
    const props = node['props'] as Record<string, unknown> | undefined
    if (props) {
      for (const actionProp of ['rowActions', 'toolbar', 'headerActions', 'footerActions', 'nodeActions', 'itemActions']) {
        const actions = props[actionProp]
        if (Array.isArray(actions)) {
          for (const action of actions) {
            const a = action as Record<string, unknown>
            if (typeof a['type'] === 'string' && a['type'].startsWith('Render') && !scriptFunctions.has(a['type'])) {
              issues.push(`${actionProp} 引用了未定义的渲染函数: ${a['type']} (${path})`)
            }
          }
        }
      }
    }
  }

  return { passed: issues.length === 0, issues, requiresBacktrack }
}

function validateStylePhase(artifacts: GenerateArtifacts): SemanticValidationResult {
  const issues: string[] = []

  if (artifacts.styleCss === undefined) {
    issues.push('style 阶段未产出 style.css')
  } else if (artifacts.ruleJson) {
    // 检查 rule.json 中 class/style 引用的 CSS class 是否在 style.css 中有定义
    // artifacts.ruleJson 已是 JSON 字符串，直接在其上匹配即可（无需二次 stringify）
    const ruleText = artifacts.ruleJson
    const classMatches = ruleText.match(/"class"\s*:\s*"([^"]+)"/gu)
    if (classMatches && classMatches.length > 0 && artifacts.styleCss.trim().length === 0) {
      issues.push('rule.json 中使用了 CSS class，但 style.css 为空')
    }
  }

  return { passed: issues.length === 0, issues, requiresBacktrack: false }
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function extractFunctionNames(script: string): Set<string> {
  const names = new Set<string>()
  const declarationPattern = /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gu
  const arrowPattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gu

  for (const pattern of [declarationPattern, arrowPattern]) {
    for (const match of script.matchAll(pattern)) {
      const name = match[1]
      if (name !== undefined) names.add(name)
    }
  }
  return names
}

function collectNodes(
  value: unknown,
  path: string,
  out: Array<{ node: Record<string, unknown>; path: string }>,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectNodes(item, `${path}[${index}]`, out))
    return
  }
  if (typeof value === 'object' && value !== null) {
    const node = value as Record<string, unknown>
    out.push({ node, path })
    const children = node['children']
    if (Array.isArray(children)) {
      children.forEach((item, index) => collectNodes(item, `${path}.children[${index}]`, out))
    }
  }
}

function extractTableFromDataKey(dataKey: string): string | null {
  const parts = dataKey.split('@')
  if (parts.length < 2) return null
  const first = parts[0] ?? ''
  if (first.startsWith('#')) {
    return parts[1] ?? null
  }
  return first
}
