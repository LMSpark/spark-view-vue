/**
 * script.js 运行时 API 合同校验。
 *
 * 在 AI/手动写入 script.js 前，检查是否使用了不可用的伪 API
 * 或违反函数签名约束。纯校验函数，不依赖 PageDesignService。
 *
 * 提取为独立文件以打破 design/ ↔ ai/ 循环导入。
 */

import type { PageDesignServiceResult } from './page-edit-session'
import { pageDesignServiceFailure } from './page-edit-session'

// ── 违规规则 ──────────────────────────────────────────────

type ScriptApiViolationRule = {
  pattern?: RegExp
  detect?: (content: string) => boolean
  api: string
  fix: string
}

const FORBIDDEN_SCRIPT_API_RULES: readonly ScriptApiViolationRule[] = [
  {
    detect: hasLongScriptFunctionSignature,
    api: 'script.js 长位置参数函数签名',
    fix: '函数/handler 默认最多 3 个位置参数；4 个及以上改为 options 对象，或在函数体内通过 $dataSet/$query/$components 读取上下文。',
  },
  {
    pattern: /\$page\.(?:getDataSet|getTableRows|getTableData|getViewData)\s*\(/,
    api: '$page 数据读取伪 API',
    fix: '使用 $dataSet?.getView("TableName", "default")?.rows 读取 DataView 行数据。',
  },
  {
    pattern: /\$page\.(?:setFieldValue|getFieldValue|setFormData|getFormData|clearForm)\s*\(/,
    api: '$page 表单/字段伪 API',
    fix: '使用 $components.getApi("component-id") 获取表单组件 API，再调用 getFormData/setFieldValue/resetFields。',
  },
  {
    pattern: /\$page\.(?:createRow|updateRow|deleteRow|refreshTable)\s*\(/,
    api: '$page CRUD/表格伪 API',
    fix: '使用 $dataSet?.getView(...).appendRow/updateRowById/deleteRowById，或 $components.getApi("table-id")?.refresh()。',
  },
  {
    pattern: /\$page\.showDialog\s*\(\s*['"`]|\$page\.hideDialog\s*\(/,
    api: '$page 组件弹窗伪 API',
    fix: '使用 $components.getApi("dialog-id")?.open() / close() 控制 r-dialog。',
  },
  {
    pattern: /\$page\.confirm\s*\(/,
    api: '$page.confirm 伪 API',
    fix: '使用 await $page.showConfirm(message, title, options) 并根据 boolean 返回值继续处理。',
  },
  {
    pattern: /\.setSummaryRow\s*\(/,
    api: 'DataView.setSummaryRow 伪 API',
    fix: 'DataView.aggregateResult 由 aggregates 自动计算；不要在 script.js 中手动 setSummaryRow。',
  },
]

// ── 公共校验入口 ──────────────────────────────────────────

export function validateScriptServiceContract(
  content: string,
): PageDesignServiceResult<undefined> | null {
  const violation = FORBIDDEN_SCRIPT_API_RULES.find((rule) =>
    rule.pattern?.test(content) === true || rule.detect?.(content) === true,
  )
  if (violation === undefined) return null
  return pageDesignServiceFailure(
    'INVALID_SCRIPT_RUNTIME_API',
    `script.js 使用了不可用的运行时 API：${violation.api}`,
    `${violation.fix} $page 仅用于 showMessage/showConfirm/showPrompt/showAlert/showLoading/navigate 等页面服务；数据入口是 $dataSet，组件入口是 $components.getApi。`,
  )
}

// ── 参数签名检测 ──────────────────────────────────────────

function hasLongScriptFunctionSignature(content: string): boolean {
  return findLongFunctionSignature(content, /\bfunction\s+[A-Za-z_$][\w$]*\s*\(/gu)
    || findLongFunctionSignature(content, /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?\(/gu)
}

function findLongFunctionSignature(content: string, pattern: RegExp): boolean {
  pattern.lastIndex = 0
  while (pattern.exec(content) !== null) {
    const openParenIndex = pattern.lastIndex - 1
    const closeParenIndex = findMatchingParen(content, openParenIndex)
    if (closeParenIndex === -1) continue
    const paramsText = content.slice(openParenIndex + 1, closeParenIndex)
    if (countTopLevelParams(paramsText) > 3) return true
    pattern.lastIndex = closeParenIndex + 1
  }
  return false
}

function findMatchingParen(content: string, openParenIndex: number): number {
  let depth = 0
  let quote: string | null = null
  for (let index = openParenIndex; index < content.length; index += 1) {
    const char = content[index]
    const previous = content[index - 1]
    if (quote !== null) {
      if (char === quote && previous !== '\\') quote = null
      continue
    }
    if (char === '"' || char === '\'' || char === '`') {
      quote = char
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function countTopLevelParams(paramsText: string): number {
  if (paramsText.trim().length === 0) return 0
  let count = 1
  let depth = 0
  let quote: string | null = null
  for (let index = 0; index < paramsText.length; index += 1) {
    const char = paramsText[index]
    const previous = paramsText[index - 1]
    if (quote !== null) {
      if (char === quote && previous !== '\\') quote = null
      continue
    }
    if (char === '"' || char === '\'' || char === '`') {
      quote = char
      continue
    }
    if (char === '(' || char === '[' || char === '{') depth += 1
    if (char === ')' || char === ']' || char === '}') depth -= 1
    if (char === ',' && depth === 0) count += 1
  }
  return count
}
