import type { FunctionFailureMode, LlmJsonObject, LlmParameterSchemaRoot } from '../../../core'
import {
  createPageDesignCapabilityRow,
  type PageDesignFunctionRuntimeBinding,
  PageDesignToolCatalog,
} from './tool-catalog'
import { noParamsSchema } from './json-schema-helpers'

export type EditLifecycleFunctionFailureMode = FunctionFailureMode
export type EditLifecycleFunctionTarget = 'session'
export type EditLifecycleFunctionId = 'bootstrap' | 'describeProgress'

type EditLifecycleFunctionBaseFields = {
  functionId: EditLifecycleFunctionId
  type: 'describe' | 'request'
  description: string
  paramsSchema: LlmParameterSchemaRoot
  resultSchema: LlmJsonObject
  example: LlmJsonObject
  usageRules: readonly string[]
}

export type EditLifecycleFunctionParameterRow = EditLifecycleFunctionBaseFields & {
  failureModes: readonly EditLifecycleFunctionFailureMode[]
  target: EditLifecycleFunctionTarget
  runtimeBinding: PageDesignFunctionRuntimeBinding
  runtimeRegistration: 'registered'
}

export type EditLifecycleFunctionCapabilityRow = Pick<
  EditLifecycleFunctionParameterRow,
  'functionId' | 'type' | 'target' | 'description'
> & {
  integrationStatus: 'runtime-wired'
  paramsRef: string
  rules?: readonly string[]
  failureCodes?: readonly string[]
  params?: LlmParameterSchemaRoot
  example?: LlmJsonObject
}

const NO_PARAMS = noParamsSchema('bootstrap / describeProgress 不接收文件快照参数，请传 {} 或留空。')

const BOOTSTRAP_RULE = 'bootstrap 仅做 live binding 可用性校验，不接收文件快照参数。'
const PHASE_RULE = '执行成功后进入 editing phase。'

function toCapabilityRow(row: EditLifecycleFunctionParameterRow): EditLifecycleFunctionCapabilityRow {
  return createPageDesignCapabilityRow(row, 'runtime-wired')
}

const EDIT_LIFECYCLE_FUNCTION_PARAMETER_TABLE = [
  {
    functionId: 'bootstrap',
    type: 'request',
    target: 'session',
    description: '引导编辑会话：校验 live binding 能力并进入 editing phase。',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      phase: '"editing" — 会话阶段切换结果',
    },
    example: {},
    usageRules: [BOOTSTRAP_RULE, PHASE_RULE],
    runtimeBinding: {
      kind: 'page-design-service',
      method: 'bootstrap',
    },
    runtimeRegistration: 'registered',
    failureModes: [
      {
        code: 'NO_NODE_TREE',
        when: '缺少 PageDesignEditHost.getNodeTree 或返回 null',
        fix: '宿主注入可用的 nodeTree tool 实例。',
      },
      {
        code: 'NO_DATASET_EDIT',
        when: '缺少 PageDesignEditHost.getDataSetTool 或返回 null',
        fix: '宿主注入可用的 dataset tool 实例。',
      },
      {
        code: 'NO_TEXT_MODEL',
        when: '缺少 script/style 的读取器入口',
        fix: '宿主注入 PageDesignEditHost.readScript/readStyle。',
      },
    ],
  },
  {
    functionId: 'describeProgress',
    type: 'describe',
    target: 'session',
    description: '查询当前 pageDesign 编辑运行状态、live binding 可用性和下一步建议。',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      phase: 'PageDesignEditPhase — 当前编辑阶段',
      bindings: 'Record<string, boolean> — live binding 可用性',
      nextStep: 'string — 下一步建议',
    },
    example: {},
    usageRules: [
      '当不确定当前编辑是否已完成 bootstrap，或需要确认可读写能力时调用。',
      '本函数只读业务运行状态，不修改页面内容。',
    ],
    runtimeBinding: {
      kind: 'page-design-service',
      method: 'describeProgress',
    },
    runtimeRegistration: 'registered',
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
}
