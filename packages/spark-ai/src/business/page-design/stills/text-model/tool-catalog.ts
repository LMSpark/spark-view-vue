import type { StillDefinition, StillFailureMode } from '../../../../core/stills/types'

export type TextModelStillFailureMode = StillFailureMode
export type TextModelStillTarget = 'script' | 'style'
export type TextModelStillFileKey = 'script' | 'style'

type TextModelStillCoreFields = Omit<
  Required<
    Pick<
      StillDefinition<Record<string, unknown>, unknown>,
      'action' | 'type' | 'description' | 'paramsSchema' | 'resultSchema' | 'example' | 'usageRules' | 'failureModes'
    >
  >,
  'failureModes'
>

export type TextModelStillParameterRow = TextModelStillCoreFields & {
  failureModes: TextModelStillFailureMode[]
  target: TextModelStillTarget
  fileKey: TextModelStillFileKey
}

export type TextModelStillCapabilityRow = Pick<
  TextModelStillParameterRow,
  'action' | 'type' | 'target' | 'description' | 'fileKey'
> & {
  integrationStatus: 'runtime-wired'
  paramsRef: string
  rules?: string[]
  failureCodes?: string[]
  params?: Record<string, unknown>
  example?: Record<string, unknown>
}

const NO_PARAMS: Record<string, unknown> = {}
const CONTENT_PARAM = 'string — 完整文本内容（全量覆盖写入，不支持 patch）'

const BOOTSTRAP_RULE = `调用 pageDesign@textModel@* 前必须先执行 pageDesign@lifecycle@bootstrap，确保宿主绑定 read*/write*。`
const FULL_WRITE_RULE = 'write 动作要求 content 为完整文本模型内容，调用后覆盖原内容。'
const SCRIPT_RUNTIME_RULE = 'pageDesign@textModel@writeScript 需遵守 script 运行时 API 合同，禁止使用不可用伪 API。'

type TextModelStillRowWithoutType = Omit<TextModelStillParameterRow, 'type'>

const defineDescribeRow = (row: TextModelStillRowWithoutType): TextModelStillParameterRow => ({
  type: 'describe',
  ...row,
})

const defineRequestRow = (row: TextModelStillRowWithoutType): TextModelStillParameterRow => ({
  type: 'request',
  ...row,
})

function toCapabilityRow(row: TextModelStillParameterRow): TextModelStillCapabilityRow {
  return {
    action: row.action,
    type: row.type,
    target: row.target,
    fileKey: row.fileKey,
    description: row.description,
    integrationStatus: 'runtime-wired',
    paramsRef: row.action,
    ...(row.usageRules.length > 0 ? { rules: row.usageRules } : {}),
    ...(row.failureModes.length > 0 ? { failureCodes: row.failureModes.map((item) => item.code) } : {}),
    ...(Object.keys(row.paramsSchema).length > 0 ? { params: row.paramsSchema } : {}),
    ...(Object.keys(row.example).length > 0 ? { example: row.example } : {}),
  }
}

export const TEXT_MODEL_STILLS_PARAMETER_TABLE: TextModelStillParameterRow[] = [
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
]

export const TEXT_MODEL_STILLS_CAPABILITY_TABLE: TextModelStillCapabilityRow[] = TEXT_MODEL_STILLS_PARAMETER_TABLE.map(toCapabilityRow)

const TEXT_MODEL_STILL_PARAMETER_INDEX = new Map<string, TextModelStillParameterRow>(
  TEXT_MODEL_STILLS_PARAMETER_TABLE.map((row) => [row.action, row]),
)

const TEXT_MODEL_STILL_CAPABILITY_INDEX = new Map<string, TextModelStillCapabilityRow>(
  TEXT_MODEL_STILLS_CAPABILITY_TABLE.map((row) => [row.action, row]),
)

export function getTextModelStillParameterRow(action: string): TextModelStillParameterRow | undefined {
  return TEXT_MODEL_STILL_PARAMETER_INDEX.get(action)
}

export function getTextModelStillCapabilityRow(action: string): TextModelStillCapabilityRow | undefined {
  return TEXT_MODEL_STILL_CAPABILITY_INDEX.get(action)
}

export function validateTextModelStillParams(action: string, params: unknown): string | null {
  const row = getTextModelStillParameterRow(action)
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
