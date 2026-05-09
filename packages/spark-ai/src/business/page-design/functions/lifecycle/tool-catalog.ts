import type { FunctionFailureMode } from '../../../../core'
import {
  createPageDesignCapabilityRow,
  PageDesignToolCatalog,
} from '../tool-catalog'

export type EditLifecycleFunctionFailureMode = FunctionFailureMode
export type EditLifecycleFunctionTarget = 'session'
export type EditLifecycleFunctionAction = `pageDesign/lifecycle/${string}`

type EditLifecycleFunctionBaseFields = {
  action: EditLifecycleFunctionAction
  type: 'describe' | 'request'
  description: string
  paramsSchema: Record<string, unknown>
  resultSchema: Record<string, unknown>
  example: Record<string, unknown>
  usageRules: readonly string[]
}

export type EditLifecycleFunctionParameterRow = EditLifecycleFunctionBaseFields & {
  failureModes: readonly EditLifecycleFunctionFailureMode[]
  target: EditLifecycleFunctionTarget
}

export type EditLifecycleFunctionCapabilityRow = Pick<
  EditLifecycleFunctionParameterRow,
  'action' | 'type' | 'target' | 'description'
> & {
  integrationStatus: 'runtime-wired'
  paramsRef: string
  rules?: readonly string[]
  failureCodes?: readonly string[]
  params?: Record<string, unknown>
  example?: Record<string, unknown>
}

const NO_PARAMS: Record<string, unknown> = {}

const BOOTSTRAP_RULE = 'pageDesign/lifecycle/bootstrap 仅做 live adapter 可用性校验，不接收文件快照 payload。'
const PHASE_RULE = '执行成功后进入 editing phase。'

function toCapabilityRow(row: EditLifecycleFunctionParameterRow): EditLifecycleFunctionCapabilityRow {
  return createPageDesignCapabilityRow(row, 'runtime-wired')
}

const EDIT_LIFECYCLE_FUNCTION_PARAMETER_TABLE = [
  {
    action: 'pageDesign/lifecycle/bootstrap',
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
  {
    action: 'pageDesign/lifecycle/describeProgress',
    type: 'describe',
    target: 'session',
    description: '查询当前 pageDesign 编辑运行状态、live adapter 可用性和下一步建议。',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      phase: 'EditPhase — 当前编辑阶段',
      adapters: 'Record<string, boolean> — live adapter 可用性',
      nextStep: 'string — 下一步建议',
    },
    example: {},
    usageRules: [
      '当不确定当前编辑是否已完成 bootstrap，或需要确认可读写能力时调用。',
      '本函数只读业务运行状态，不修改页面内容。',
    ],
    failureModes: [],
  },
] as const satisfies readonly EditLifecycleFunctionParameterRow[]

const EDIT_LIFECYCLE_FUNCTION_CAPABILITY_TABLE = EDIT_LIFECYCLE_FUNCTION_PARAMETER_TABLE.map(toCapabilityRow)

export class PageDesignLifecycleCatalog extends PageDesignToolCatalog<
  EditLifecycleFunctionParameterRow,
  EditLifecycleFunctionCapabilityRow
> {
  constructor() {
    super(EDIT_LIFECYCLE_FUNCTION_PARAMETER_TABLE, EDIT_LIFECYCLE_FUNCTION_CAPABILITY_TABLE)
  }

  validateParams(action: string, params: unknown): string | null {
    if (this.getParameterRow(action) === undefined) {
      return `未知 lifecycle 动作: ${action}`
    }

    if (params === undefined || params === null) return null
    if (typeof params !== 'object' || Array.isArray(params)) return `${action} 参数必须留空或传 {}`
    if (Object.keys(params).length > 0) return `${action} 不再接收文件快照 payload，请传 {}`
    return null
  }
}
