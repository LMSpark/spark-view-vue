import type { FunctionFailureMode } from '../../../../core'
import {
  createPageDesignCapabilityRow,
  PageDesignToolCatalog,
} from '../tool-catalog'

export type TextModelFunctionFailureMode = FunctionFailureMode
export type TextModelFunctionTarget = 'script' | 'style'
export type TextModelFunctionFileKey = 'script' | 'style'
export type TextModelFunctionAction = `pageDesign@textModel@${string}`

type TextModelFunctionCoreFields = {
  action: TextModelFunctionAction
  type: 'describe' | 'request'
  description: string
  paramsSchema: Record<string, unknown>
  resultSchema: Record<string, unknown>
  example: Record<string, unknown>
  usageRules: readonly string[]
}

export type TextModelFunctionParameterRow = TextModelFunctionCoreFields & {
  failureModes: readonly TextModelFunctionFailureMode[]
  target: TextModelFunctionTarget
  fileKey: TextModelFunctionFileKey
}

export type TextModelFunctionCapabilityRow = Pick<
  TextModelFunctionParameterRow,
  'action' | 'type' | 'target' | 'description' | 'fileKey'
> & {
  integrationStatus: 'runtime-wired'
  paramsRef: string
  rules?: readonly string[]
  failureCodes?: readonly string[]
  params?: Record<string, unknown>
  example?: Record<string, unknown>
}

const NO_PARAMS: Record<string, unknown> = {}
const CONTENT_PARAM = 'string — 完整文本内容（全量覆盖写入，不支持 patch）'

const BOOTSTRAP_RULE = `调用 pageDesign@textModel@* 前必须先执行 pageDesign@lifecycle@bootstrap，确保宿主绑定 read*/write*。`
const FULL_WRITE_RULE = 'write 动作要求 content 为完整文本模型内容，调用后覆盖原内容。'
const SCRIPT_RUNTIME_RULE = 'pageDesign@textModel@writeScript 需遵守 script 运行时 API 合同，禁止使用不可用伪 API。'

type TextModelFunctionRowWithoutType = Omit<TextModelFunctionParameterRow, 'type'>

const defineDescribeRow = (row: TextModelFunctionRowWithoutType): TextModelFunctionParameterRow => ({
  type: 'describe',
  ...row,
})

const defineRequestRow = (row: TextModelFunctionRowWithoutType): TextModelFunctionParameterRow => ({
  type: 'request',
  ...row,
})

function toCapabilityRow(row: TextModelFunctionParameterRow): TextModelFunctionCapabilityRow {
  return createPageDesignCapabilityRow(row, 'runtime-wired', { fileKey: row.fileKey })
}

const TEXT_MODEL_FUNCTIONS_PARAMETER_TABLE = [
  defineDescribeRow({
    action: 'pageDesign@textModel@readScript',
    target: 'script',
    fileKey: 'script',
    description: '读取 script.js 当前完整文本模型内容。',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      content: 'string — script.js 当前全文',
    },
    example: {},
    usageRules: [BOOTSTRAP_RULE],
    failureModes: [
      {
        code: 'NO_TEXT_MODEL',
        when: '宿主未绑定 EditToolHost.readScript',
        fix: '先执行 pageDesign@lifecycle@bootstrap 并确保宿主提供 readScript。',
      },
    ],
  }),
  defineRequestRow({
    action: 'pageDesign@textModel@writeScript',
    target: 'script',
    fileKey: 'script',
    description: '覆盖写入 script.js 全量文本模型内容。',
    paramsSchema: {
      content: CONTENT_PARAM,
    },
    resultSchema: {
      ok: 'boolean — 写入成功返回 true',
    },
    example: {
      content: 'export default {}',
    },
    usageRules: [BOOTSTRAP_RULE, FULL_WRITE_RULE, SCRIPT_RUNTIME_RULE],
    failureModes: [
      {
        code: 'NO_TEXT_MODEL',
        when: '宿主未绑定 EditToolHost.writeScript',
        fix: '先执行 pageDesign@lifecycle@bootstrap 并确保宿主提供 writeScript。',
      },
      {
        code: 'INVALID_SCRIPT_RUNTIME_API',
        when: 'script.js 使用了运行时不支持的伪 API',
        fix: '改用 $page/$dataSet/$components.getApi 的受支持能力。',
      },
    ],
  }),
  defineDescribeRow({
    action: 'pageDesign@textModel@readStyle',
    target: 'style',
    fileKey: 'style',
    description: '读取 style.css 当前完整文本模型内容。',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      content: 'string — style.css 当前全文',
    },
    example: {},
    usageRules: [BOOTSTRAP_RULE],
    failureModes: [
      {
        code: 'NO_TEXT_MODEL',
        when: '宿主未绑定 EditToolHost.readStyle',
        fix: '先执行 pageDesign@lifecycle@bootstrap 并确保宿主提供 readStyle。',
      },
    ],
  }),
  defineRequestRow({
    action: 'pageDesign@textModel@writeStyle',
    target: 'style',
    fileKey: 'style',
    description: '覆盖写入 style.css 全量文本模型内容。',
    paramsSchema: {
      content: CONTENT_PARAM,
    },
    resultSchema: {
      ok: 'boolean — 写入成功返回 true',
    },
    example: {
      content: '.page { padding: 12px; }',
    },
    usageRules: [BOOTSTRAP_RULE, FULL_WRITE_RULE],
    failureModes: [
      {
        code: 'NO_TEXT_MODEL',
        when: '宿主未绑定 EditToolHost.writeStyle',
        fix: '先执行 pageDesign@lifecycle@bootstrap 并确保宿主提供 writeStyle。',
      },
    ],
  }),
] as const satisfies readonly TextModelFunctionParameterRow[]

const TEXT_MODEL_FUNCTIONS_CAPABILITY_TABLE = TEXT_MODEL_FUNCTIONS_PARAMETER_TABLE.map(toCapabilityRow)

export class PageDesignTextModelCatalog extends PageDesignToolCatalog<
  TextModelFunctionParameterRow,
  TextModelFunctionCapabilityRow
> {
  constructor() {
    super(TEXT_MODEL_FUNCTIONS_PARAMETER_TABLE, TEXT_MODEL_FUNCTIONS_CAPABILITY_TABLE)
  }

  validateParams(action: string, params: unknown): string | null {
    const row = this.getParameterRow(action)
    if (row === undefined) {
      return `未知 textModel 动作: ${action}`
    }

    if (row.type === 'describe') {
      if (params === undefined || params === null) return null
      if (typeof params === 'object' && !Array.isArray(params) && Object.keys(params).length === 0) return null
      return `${action} 不接受参数，请传 {} 或留空`
    }

    if (typeof params !== 'object' || params === null || Array.isArray(params)) {
      return `${action} 参数必须是对象，且包含 content（string）`
    }

    const content = (params as { content?: unknown }).content
    return typeof content === 'string' ? null : `${action} 缺少 content（string）`
  }
}
