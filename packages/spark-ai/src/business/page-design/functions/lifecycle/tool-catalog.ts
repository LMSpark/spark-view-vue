import type { FunctionFailureMode, RegisteredFunctionDefinition } from '../../../../core/protocol/function-contracts'

export type EditLifecycleFunctionFailureMode = FunctionFailureMode
export type EditLifecycleFunctionTarget = 'session'

type EditLifecycleFunctionCoreFields = Omit<
  Required<
    Pick<
      RegisteredFunctionDefinition<Record<string, unknown>, unknown>,
      'action' | 'type' | 'description' | 'paramsSchema' | 'resultSchema' | 'example' | 'usageRules' | 'failureModes'
    >
  >,
  'failureModes'
>

export type EditLifecycleFunctionParameterRow = EditLifecycleFunctionCoreFields & {
  failureModes: EditLifecycleFunctionFailureMode[]
  target: EditLifecycleFunctionTarget
}

export type EditLifecycleFunctionCapabilityRow = Pick<
  EditLifecycleFunctionParameterRow,
  'action' | 'type' | 'target' | 'description'
> & {
  integrationStatus: 'runtime-wired'
  paramsRef: string
  rules?: string[]
  failureCodes?: string[]
  params?: Record<string, unknown>
  example?: Record<string, unknown>
}

const NO_PARAMS: Record<string, unknown> = {}

const BOOTSTRAP_RULE = 'pageDesign@lifecycle@bootstrap 仅做 live adapter 可用性校验，不接收文件快照 payload。'
const PHASE_RULE = '执行成功后进入 editing phase。'

function toCapabilityRow(row: EditLifecycleFunctionParameterRow): EditLifecycleFunctionCapabilityRow {
  return {
    action: row.action,
    type: row.type,
    target: row.target,
    description: row.description,
    integrationStatus: 'runtime-wired',
    paramsRef: row.action,
    ...(row.usageRules.length > 0 ? { rules: row.usageRules } : {}),
    ...(row.failureModes.length > 0 ? { failureCodes: row.failureModes.map((item) => item.code) } : {}),
    ...(Object.keys(row.paramsSchema).length > 0 ? { params: row.paramsSchema } : {}),
    ...(Object.keys(row.example).length > 0 ? { example: row.example } : {}),
  }
}

export const EDIT_LIFECYCLE_FUNCTION_PARAMETER_TABLE: EditLifecycleFunctionParameterRow[] = [
  {
    action: 'pageDesign@lifecycle@bootstrap',
    type: 'request',
    target: 'session',
    description: '引导编辑会话：校验 live adapter 能力并进入 editing phase。',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      phase: '"editing" — 会话阶段切换结果',
    },
    example: {},
    usageRules: [BOOTSTRAP_RULE, PHASE_RULE],
    failureModes: [
      {
        code: 'NO_NODE_TREE',
        when: '缺少 EditToolHost.getNodeTree 或返回 null',
        fix: '宿主注入可用的 nodeTree tool 实例。',
      },
      {
        code: 'NO_DATASET_EDIT',
        when: '缺少 EditToolHost.getDataSetTool 或返回 null',
        fix: '宿主注入可用的 dataset tool 实例。',
      },
      {
        code: 'NO_TEXT_MODEL',
        when: '缺少 script/style 的读取器入口',
        fix: '宿主注入 EditToolHost.readScript/readStyle。',
      },
    ],
  },
]

export const EDIT_LIFECYCLE_FUNCTION_CAPABILITY_TABLE: EditLifecycleFunctionCapabilityRow[] = EDIT_LIFECYCLE_FUNCTION_PARAMETER_TABLE.map(toCapabilityRow)

const EDIT_LIFECYCLE_FUNCTION_PARAMETER_INDEX = new Map<string, EditLifecycleFunctionParameterRow>(
  EDIT_LIFECYCLE_FUNCTION_PARAMETER_TABLE.map((row) => [row.action, row]),
)

const EDIT_LIFECYCLE_FUNCTION_CAPABILITY_INDEX = new Map<string, EditLifecycleFunctionCapabilityRow>(
  EDIT_LIFECYCLE_FUNCTION_CAPABILITY_TABLE.map((row) => [row.action, row]),
)

export function getEditLifecycleFunctionParameterRow(action: string): EditLifecycleFunctionParameterRow | undefined {
  return EDIT_LIFECYCLE_FUNCTION_PARAMETER_INDEX.get(action)
}

export function getEditLifecycleFunctionCapabilityRow(action: string): EditLifecycleFunctionCapabilityRow | undefined {
  return EDIT_LIFECYCLE_FUNCTION_CAPABILITY_INDEX.get(action)
}

export function validateEditLifecycleFunctionParams(action: string, params: unknown): string | null {
  if (getEditLifecycleFunctionParameterRow(action) === undefined) {
    return `未知 lifecycle 动作: ${action}`
  }

  if (params === undefined || params === null) return null
  if (typeof params !== 'object' || Array.isArray(params)) return `${action} 参数必须留空或传 {}`
  if (Object.keys(params).length > 0) return `${action} 不再接收文件快照 payload，请传 {}`
  return null
}
