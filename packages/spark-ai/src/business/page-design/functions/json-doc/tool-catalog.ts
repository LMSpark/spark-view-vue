import type { FunctionFailureMode } from '../../../../core'
import {
  createPageDesignCapabilityRow,
  PageDesignToolCatalog,
} from '../tool-catalog'

export type JsonDocFunctionFailureMode = FunctionFailureMode
export type JsonDocFunctionTarget = 'pagedata' | 'rule'
export type JsonDocType = 'pagedata' | 'rule'
export type JsonDocFunctionAction = `pageDesign/jsonDoc/${string}`

type JsonDocFunctionBaseFields = {
  action: JsonDocFunctionAction
  type: 'describe' | 'request'
  description: string
  paramsSchema: Record<string, unknown>
  resultSchema: Record<string, unknown>
  example: Record<string, unknown>
  usageRules: readonly string[]
}

export type JsonDocFunctionParameterRow = JsonDocFunctionBaseFields & {
  failureModes: readonly JsonDocFunctionFailureMode[]
  target: JsonDocFunctionTarget
  /** 对应 jsonDoc 操作类型 */
  operation: 'read' | 'list' | 'get' | 'set' | 'delete' | 'append' | 'setMultiple' | 'query'
}

export type JsonDocFunctionCapabilityRow = Pick<
  JsonDocFunctionParameterRow,
  'action' | 'type' | 'target' | 'description' | 'operation'
> & {
  integrationStatus: 'runtime-wired'
  paramsRef: string
  rules?: readonly string[]
  failureCodes?: readonly string[]
  params?: Record<string, unknown>
  example?: Record<string, unknown>
}

// ── 常量 ──────────────────────────────────────────────────────────────────────

const BOOTSTRAP_RULE = '调用 pageDesign/jsonDoc/* 前必须先执行 pageDesign/lifecycle/bootstrap，确保宿主绑定 readJsonDoc/writeJsonDoc。'
const POINTER_FORMAT_RULE = 'pointer 遵循 RFC 6901：以 "/" 开头（"" 代表文档根）；段间以 "/" 分隔；"/" 用 ~1 转义，"~" 用 ~0 转义。'
const IMMUTABLE_RULE = 'set/delete/append/setMultiple 不直接修改原始 JSON 文件，所有写入通过 EditToolHost.writeJsonDoc 提交并触发宿主持久化。'

const DOC_TYPE_PARAM = { docType: '"pagedata" | "rule" — 目标文档类型' }
const POINTER_PARAM = { pointer: 'string — RFC 6901 JSON Pointer，根节点传 ""' }

const NO_JSON_DOC_HOST: JsonDocFunctionFailureMode = {
  code: 'NO_JSON_DOC_HOST',
  when: '宿主未绑定 EditToolHost.readJsonDoc / writeJsonDoc',
  fix: '先执行 pageDesign/lifecycle/bootstrap 并确保宿主提供 readJsonDoc/writeJsonDoc。',
}
const INVALID_POINTER: JsonDocFunctionFailureMode = {
  code: 'INVALID_POINTER',
  when: 'pointer 格式不合法（不以 "/" 开头或包含非法转义）',
  fix: '检查 pointer 格式，根节点传 ""，子路径传 "/key" 或 "/0"。',
}
const NOT_FOUND: JsonDocFunctionFailureMode = {
  code: 'NOT_FOUND',
  when: 'pointer 路径不存在',
  fix: '先用 pageDesign/jsonDoc/get 确认路径存在，或用 pageDesign/jsonDoc/list 查看可用 key。',
}
const NOT_ARRAY: JsonDocFunctionFailureMode = {
  code: 'NOT_ARRAY',
  when: 'append 目标不是数组',
  fix: '先用 pageDesign/jsonDoc/get 检查目标类型，再决定操作。',
}
const SCALAR_TARGET: JsonDocFunctionFailureMode = {
  code: 'SCALAR_TARGET',
  when: 'list 目标为标量值（string/number/boolean/null）',
  fix: '标量无子节点，改用 pageDesign/jsonDoc/get 读取完整值。',
}
const INVALID_EXPRESSION: JsonDocFunctionFailureMode = {
  code: 'INVALID_EXPRESSION',
  when: 'JMESPath 表达式语法错误',
  fix: '检查 expression 语法，参考 JMESPath 规范 https://jmespath.org。',
}

// ── 行定义辅助 ────────────────────────────────────────────────────────────────

type JsonDocFunctionRowWithoutType = Omit<JsonDocFunctionParameterRow, 'type'>

const defineDescribeRow = (row: JsonDocFunctionRowWithoutType): JsonDocFunctionParameterRow => ({
  type: 'describe',
  ...row,
})

const defineRequestRow = (row: JsonDocFunctionRowWithoutType): JsonDocFunctionParameterRow => ({
  type: 'request',
  ...row,
})

function toCapabilityRow(row: JsonDocFunctionParameterRow): JsonDocFunctionCapabilityRow {
  return createPageDesignCapabilityRow(row, 'runtime-wired', { operation: row.operation })
}

// ── 参数表 ────────────────────────────────────────────────────────────────────

const JSON_DOC_FUNCTIONS_PARAMETER_TABLE: readonly JsonDocFunctionParameterRow[] = [
  defineDescribeRow({
    action: 'pageDesign/jsonDoc/read',
    target: 'pagedata',
    operation: 'read',
    description: '读取指定文档（pagedata.json 或 rule.json）的完整 JSON 内容。',
    paramsSchema: DOC_TYPE_PARAM,
    resultSchema: {
      doc: 'unknown — 文档完整内容',
    },
    example: { docType: 'pagedata' },
    usageRules: [BOOTSTRAP_RULE],
    failureModes: [NO_JSON_DOC_HOST],
  }),

  defineDescribeRow({
    action: 'pageDesign/jsonDoc/list',
    target: 'pagedata',
    operation: 'list',
    description: '列出 pointer 处对象/数组的直接子节点（key、类型、预览值、子路径）。',
    paramsSchema: { ...DOC_TYPE_PARAM, ...POINTER_PARAM },
    resultSchema: {
      entries: 'Array<{ key: string; pointer: string; type: string; preview: string }>',
    },
    example: { docType: 'pagedata', pointer: '/tables' },
    usageRules: [BOOTSTRAP_RULE, POINTER_FORMAT_RULE],
    failureModes: [NO_JSON_DOC_HOST, INVALID_POINTER, NOT_FOUND, SCALAR_TARGET],
  }),

  defineDescribeRow({
    action: 'pageDesign/jsonDoc/get',
    target: 'pagedata',
    operation: 'get',
    description: '读取 pointer 处的单个值（任意类型）。',
    paramsSchema: { ...DOC_TYPE_PARAM, ...POINTER_PARAM },
    resultSchema: { value: 'unknown — pointer 处的值' },
    example: { docType: 'pagedata', pointer: '/tables/0/name' },
    usageRules: [BOOTSTRAP_RULE, POINTER_FORMAT_RULE],
    failureModes: [NO_JSON_DOC_HOST, INVALID_POINTER, NOT_FOUND],
  }),

  defineRequestRow({
    action: 'pageDesign/jsonDoc/set',
    target: 'pagedata',
    operation: 'set',
    description: '在 pointer 处写入（或创建）一个值；父路径不存在时递归创建中间节点。',
    paramsSchema: { ...DOC_TYPE_PARAM, ...POINTER_PARAM, value: 'unknown — 要写入的 JSON 值' },
    resultSchema: {},
    example: { docType: 'pagedata', pointer: '/tables/0/label', value: '员工表' },
    usageRules: [BOOTSTRAP_RULE, POINTER_FORMAT_RULE, IMMUTABLE_RULE],
    failureModes: [NO_JSON_DOC_HOST, INVALID_POINTER],
  }),

  defineRequestRow({
    action: 'pageDesign/jsonDoc/delete',
    target: 'pagedata',
    operation: 'delete',
    description: '删除 pointer 处的键或数组元素（数组删除后元素自动前移）。不能删除根节点。',
    paramsSchema: { ...DOC_TYPE_PARAM, ...POINTER_PARAM },
    resultSchema: {},
    example: { docType: 'pagedata', pointer: '/tables/0/columns/2' },
    usageRules: [BOOTSTRAP_RULE, POINTER_FORMAT_RULE, IMMUTABLE_RULE],
    failureModes: [NO_JSON_DOC_HOST, INVALID_POINTER, NOT_FOUND],
  }),

  defineRequestRow({
    action: 'pageDesign/jsonDoc/append',
    target: 'pagedata',
    operation: 'append',
    description: '向 arrayPointer 处的数组末尾追加一个元素。目标必须为数组。',
    paramsSchema: { ...DOC_TYPE_PARAM, arrayPointer: 'string — 指向目标数组的 RFC 6901 pointer', element: 'unknown — 要追加的 JSON 值' },
    resultSchema: {},
    example: { docType: 'pagedata', arrayPointer: '/tables/0/columns', element: { name: 'status', type: 'string', label: '状态' } },
    usageRules: [BOOTSTRAP_RULE, POINTER_FORMAT_RULE, IMMUTABLE_RULE],
    failureModes: [NO_JSON_DOC_HOST, INVALID_POINTER, NOT_FOUND, NOT_ARRAY],
  }),

  defineRequestRow({
    action: 'pageDesign/jsonDoc/setMultiple',
    target: 'pagedata',
    operation: 'setMultiple',
    description: '批量写入多个 pointer→value 对；所有写入在同一个文档副本上顺序执行，原子提交。任一 pointer 失败则整批回滚。',
    paramsSchema: {
      ...DOC_TYPE_PARAM,
      patches: 'Array<{ pointer: string; value: unknown }> — 按顺序执行的写入列表',
    },
    resultSchema: {},
    example: {
      docType: 'pagedata',
      patches: [
        { pointer: '/tables/0/label', value: '员工表' },
        { pointer: '/tables/0/columns/0/label', value: '姓名' },
      ],
    },
    usageRules: [BOOTSTRAP_RULE, POINTER_FORMAT_RULE, IMMUTABLE_RULE, '所有 patch 共享同一事务：任一失败则整批不提交。'],
    failureModes: [NO_JSON_DOC_HOST, INVALID_POINTER],
  }),

  defineDescribeRow({
    action: 'pageDesign/jsonDoc/query',
    target: 'pagedata',
    operation: 'query',
    description: '对文档（或 pointer 处的子树）执行 JMESPath 查询，用于复杂筛选/投影/聚合。只读，不修改文档。',
    paramsSchema: {
      ...DOC_TYPE_PARAM,
      expression: 'string — JMESPath 表达式（https://jmespath.org）',
      pointer: 'string? — 可选。在该路径的子树上执行查询，默认使用文档根',
    },
    resultSchema: { result: 'unknown — JMESPath 查询结果' },
    example: { docType: 'pagedata', expression: 'tables[].{name: name, label: label}' },
    usageRules: [BOOTSTRAP_RULE, 'expression 遵循 JMESPath 规范；pointer 只是缩小查询范围，不改变表达式语义。'],
    failureModes: [NO_JSON_DOC_HOST, INVALID_POINTER, NOT_FOUND, INVALID_EXPRESSION],
  }),
]

const JSON_DOC_FUNCTIONS_CAPABILITY_TABLE: readonly JsonDocFunctionCapabilityRow[] = JSON_DOC_FUNCTIONS_PARAMETER_TABLE.map(toCapabilityRow)

// ── Catalog 类 ────────────────────────────────────────────────────────────────

export class PageDesignJsonDocCatalog extends PageDesignToolCatalog<
  JsonDocFunctionParameterRow,
  JsonDocFunctionCapabilityRow
> {
  constructor() {
    super(JSON_DOC_FUNCTIONS_PARAMETER_TABLE, JSON_DOC_FUNCTIONS_CAPABILITY_TABLE)
  }

  override validateParams(action: string, params: unknown): string | null {
    const row = this.getParameterRow(action as JsonDocFunctionAction)
    if (row === undefined) return `未知 jsonDoc action: ${action}`
    if (params === null || typeof params !== 'object' || Array.isArray(params)) {
      return `${action}: params 必须为对象`
    }

    const p = params as Record<string, unknown>

    // 公共必填：docType
    if (p['docType'] !== 'pagedata' && p['docType'] !== 'rule') {
      return `${action}: docType 必须是 "pagedata" 或 "rule"`
    }

    if (row.operation === 'list' || row.operation === 'get') {
      if (typeof p['pointer'] !== 'string') return `${action}: pointer 必须是 string`
    }

    if (row.operation === 'set') {
      if (typeof p['pointer'] !== 'string') return `${action}: pointer 必须是 string`
      if (!('value' in p)) return `${action}: 缺少 value`
    }

    if (row.operation === 'delete') {
      if (typeof p['pointer'] !== 'string') return `${action}: pointer 必须是 string`
    }

    if (row.operation === 'append') {
      if (typeof p['arrayPointer'] !== 'string') return `${action}: arrayPointer 必须是 string`
      if (!('element' in p)) return `${action}: 缺少 element`
    }

    if (row.operation === 'setMultiple') {
      if (!Array.isArray(p['patches'])) return `${action}: patches 必须是数组`
      for (let i = 0; i < (p['patches'] as unknown[]).length; i++) {
        const patch = (p['patches'] as unknown[])[i]
        if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return `${action}: patches[${i}] 必须是对象`
        const pObj = patch as Record<string, unknown>
        if (typeof pObj['pointer'] !== 'string') return `${action}: patches[${i}].pointer 必须是 string`
        if (!('value' in pObj)) return `${action}: patches[${i}] 缺少 value`
      }
    }

    if (row.operation === 'query') {
      if (typeof p['expression'] !== 'string') return `${action}: expression 必须是 string`
      if ('pointer' in p && typeof p['pointer'] !== 'string') return `${action}: pointer 若提供则必须是 string`
    }

    return null
  }
}
