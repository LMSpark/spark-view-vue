import { LlmParamsValidator, type AiFunctionRegistration, type FunctionFailureMode } from '../../../core'
import { noParamsSchema } from './json-schema-helpers'

export type EditLifecycleFunctionFailureMode = FunctionFailureMode
export type EditLifecycleFunctionId = 'bootstrap' | 'describeProgress'

const NO_PARAMS = noParamsSchema('bootstrap / describeProgress 不接收文件快照参数，请传 {} 或留空。')

const BOOTSTRAP_RULE = 'bootstrap 仅做 live binding 可用性校验，不接收文件快照参数。'
const PHASE_RULE = '执行成功后进入 editing phase。'

export const LIFECYCLE_CATALOG_ROWS = [
  {
    functionId: 'bootstrap',
    description: '引导编辑会话：校验 live binding 能力并进入 editing phase。',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      phase: '"editing" — 会话阶段切换结果',
    },
    example: {},
    usageRules: [BOOTSTRAP_RULE, PHASE_RULE],
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
    failureModes: [],
  },
] as const satisfies readonly AiFunctionRegistration[]

export function validateLifecycleParams(functionId: string, params: unknown): string | null {
  const row = LIFECYCLE_CATALOG_ROWS.find((r) => r.functionId === functionId)
  if (!row) return `未知 ${functionId} 函数`
  const result = LlmParamsValidator.validateLlmDeserializedParams(params ?? {}, row.paramsSchema)
  return result.ok ? null : LlmParamsValidator.formatLlmParamValidationIssues(result.issues)
}
