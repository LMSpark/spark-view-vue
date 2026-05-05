import type { FunctionCarrierContract, FunctionResult, RegisteredFunctionDefinition } from '../../../../core/protocol/function-contracts'
import {
  editInit,
  readActiveScript,
  writeActiveScript,
  readActiveStyle,
  writeActiveStyle,
  type EditState,
} from '../lifecycle/edit-lifecycle-functions'
import {
  TEXT_MODEL_FUNCTIONS_PARAMETER_TABLE,
  validateTextModelFunctionParams,
  type TextModelFunctionParameterRow,
} from './tool-catalog'

const PAGE_DESIGN_TEXT_MODEL_MODULE_PROMPT = 'pageDesign@textModel 只读写 live script.js/style.css 文本模型；写入必须提交完整文件内容，script.js 遵守 sandbox API 边界，禁止 ESM import、window 全局和不可用 $page 伪 API。'
export const PAGE_DESIGN_TEXT_MODEL_CARRIER_KEY = 'pageDesign@textModel' as const

type EditFileKey = 'script' | 'style'
type TextModelMethod = 'readScript' | 'writeScript' | 'readStyle' | 'writeStyle'

type FileRuntime = {
  label: string
  readMethod: TextModelMethod
  writeMethod: TextModelMethod
  read: typeof readActiveScript
  write: typeof writeActiveScript
  validateWrite?: (content: string) => FunctionResult<undefined> | null
}

const FILE_RUNTIME_BY_KEY: Record<EditFileKey, FileRuntime> = {
  script: {
    label: 'script.js',
    readMethod: 'readScript',
    writeMethod: 'writeScript',
    read: readActiveScript,
    write: writeActiveScript,
    validateWrite: validateScriptRuntimeContract,
  },
  style: {
    label: 'style.css',
    readMethod: 'readStyle',
    writeMethod: 'writeStyle',
    read: readActiveStyle,
    write: writeActiveStyle,
  },
}

function ensureTextModelAccess(
  state: EditState,
  key: EditFileKey,
  mode: 'read' | 'write',
): string | null {
  const host = state.toolHost
  const runtime = FILE_RUNTIME_BY_KEY[key]
  const method = mode === 'read' ? runtime.readMethod : runtime.writeMethod
  return typeof host?.[method] === 'function' ? null : `缺少 live text model: ${method}`
}

const NO_TEXT_MODEL_FIX = `请先执行 ${editInit.action} 初始化编辑会话，并确保宿主绑定 EditToolHost.read*/write*`

function noTextModelResult(msg: string): FunctionResult<undefined> {
  return {
    ok: false,
    code: 'NO_TEXT_MODEL',
    msg,
    fix: NO_TEXT_MODEL_FIX,
  }
}

function missingTextModelCarrierResult(action: string): FunctionResult<undefined> {
  return {
    ok: false,
    code: 'MISSING_CARRIER',
    msg: `${action} 缺少运行载体注入`,
    fix: `请先注册 ${PAGE_DESIGN_TEXT_MODEL_CARRIER_KEY} 运行载体后再执行 ${action}。`,
  }
}

export function createTextModelCarrier(state: EditState): FunctionCarrierContract<EditState> {
  return {
    carrierKey: PAGE_DESIGN_TEXT_MODEL_CARRIER_KEY,
    prompt: PAGE_DESIGN_TEXT_MODEL_MODULE_PROMPT,
    description: 'pageDesign 文本模型载体，负责当前 live script.js/style.css 读写。',
    instance: state,
  }
}

interface ScriptApiViolationRule {
  pattern: RegExp
  api: string
  fix: string
}

const FORBIDDEN_SCRIPT_API_RULES: readonly ScriptApiViolationRule[] = [
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

function validateScriptRuntimeContract(content: string): FunctionResult<undefined> | null {
  const violation = FORBIDDEN_SCRIPT_API_RULES.find((rule) => rule.pattern.test(content))
  if (violation === undefined) return null
  return {
    ok: false,
    code: 'INVALID_SCRIPT_RUNTIME_API',
    msg: `script.js 使用了不可用的运行时 API：${violation.api}`,
    fix: `${violation.fix} $page 仅用于 showMessage/showConfirm/showPrompt/showAlert/showLoading/navigate 等页面服务；数据入口是 $dataSet，组件入口是 $components.getApi。`,
  }
}

function createTextModelFunction(row: TextModelFunctionParameterRow): RegisteredFunctionDefinition {
  const mode: 'read' | 'write' = row.type === 'describe' ? 'read' : 'write'
  const runtime = FILE_RUNTIME_BY_KEY[row.fileKey]

  return {
    action: row.action,
    type: row.type,
    description: row.description,
    paramsSchema: row.paramsSchema,
    resultSchema: row.resultSchema,
    example: row.example,
    usageRules: row.usageRules,
    failureModes: row.failureModes,
    validate: (params) => validateTextModelFunctionParams(row.action, params),
    execute: (): FunctionResult => missingTextModelCarrierResult(row.action),
    executeWithCarrier: (_context, carrier, params): FunctionResult => {
      const state = carrier as EditState
      const accessError = ensureTextModelAccess(state, row.fileKey, mode)
      if (accessError) {
        return noTextModelResult(accessError)
      }

      if (mode === 'read') {
        return {
          ok: true,
          data: { content: runtime.read(state) },
          summary: `${runtime.label} 内容已返回`,
        }
      }

      const content = (params as { content: string }).content
      const scriptContractError = runtime.validateWrite?.(content) ?? null
      if (scriptContractError !== null) return scriptContractError

      runtime.write(state, content)
      return { ok: true, data: undefined, summary: `${runtime.label} 已更新` }
    },
  }
}

export function createEditFileFunctions(): RegisteredFunctionDefinition[] {
  return TEXT_MODEL_FUNCTIONS_PARAMETER_TABLE.map(row => createTextModelFunction(row))
}

export const EDIT_FILE_FUNCTION_SUMMARIES = TEXT_MODEL_FUNCTIONS_PARAMETER_TABLE.map(row => ({
  action: row.action,
  type: row.type,
}))
