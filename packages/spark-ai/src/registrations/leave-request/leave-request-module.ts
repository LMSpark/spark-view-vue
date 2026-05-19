import {
  type AiFunctionRegistration,
  type AiRuntimeFunctionCallResult,
  type AiRuntimeKnowledgeProjection,
  type AiRuntimeMessageRole,
  type AiRuntimeMessageSource,
  type AiRuntimeStartSessionResult,
  type FunctionExecutionContext,
} from '../../core/protocol/runtime-contracts'
import {
  type LlmJsonObject,
  type LlmJsonSchema,
  type LlmParameterSchemaRoot,
} from '../../core/protocol/parameter-schema'
import { LlmParamsValidator } from '../../core/internal/llm-params-validator'
import {
  RuntimeBackedBusinessModule,
  type RuntimeBackedExecuteFunctionCallOptions,
  type RuntimeBackedModuleContext,
  StaticAiToolModule,
} from '../internal/registration-base'
import {
  LeaveRequestService,
  isLeaveRequestServiceResult,
  leaveRequestServiceFailure,
  type LeaveRequestDraftState,
  type LeaveRequestServiceContext,
  type LeaveRequestServiceResult,
} from './leave-request-service'

export const LEAVE_REQUEST_MODULE_ID = 'manualLeave'

export interface LeaveRequestRuntimeContext {
  readonly instanceId: string
  readonly moduleId: typeof LEAVE_REQUEST_MODULE_ID
  readonly moduleInstanceId: string
}

export interface LeaveRequestAppendMessageOptions extends LeaveRequestRuntimeContext {
  readonly role: AiRuntimeMessageRole
  readonly content: string
  readonly source?: AiRuntimeMessageSource | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

export interface LeaveRequestExecuteFunctionCallOptions extends LeaveRequestRuntimeContext {
  readonly action: string
  readonly args: unknown
  readonly projection?: AiRuntimeKnowledgeProjection | undefined
}

export interface LeaveRequestStopSessionOptions extends LeaveRequestRuntimeContext {
  readonly reason?: string | undefined
}

const NO_PARAMS: LlmParameterSchemaRoot = {
  type: 'object',
  properties: {},
  additionalProperties: false,
  description: '不接受参数，请传 {} 或留空。',
}

const DRAFT_FIELDS_SCHEMA: Record<string, LlmJsonSchema> = {
  applicantName: { type: 'string', description: '请假人姓名。' },
  leaveType: { type: 'string', description: '请假类型，例如 annual、sick、personal、other。' },
  startDate: { type: 'string', description: '开始日期，格式 YYYY-MM-DD。用户给"今天/明天/后天"等相对日期时，必须基于系统提示中的当前日期换算；不能使用假设日期。' },
  endDate: { type: 'string', description: '结束日期，格式 YYYY-MM-DD。按自然日包含起止日计算；例如请假 2 天时，endDate = startDate + 1 天。' },
  totalDays: { type: 'number', description: '请假天数，必须大于 0。用户说"请假两天”时填 2。' },
  reason: { type: 'string', description: '请假事由。' },
  approver: { type: 'string', description: '审批人姓名或 ID。' },
}

const SET_DRAFT_FIELDS_SCHEMA: LlmParameterSchemaRoot = {
  type: 'object',
  properties: {
    fields: {
      type: 'object',
      description: '要写入请假草稿的字段。只传用户明确给出的字段。',
      properties: DRAFT_FIELDS_SCHEMA,
    },
  },
  required: ['fields'],
}

const CANCEL_DRAFT_SCHEMA: LlmParameterSchemaRoot = {
  type: 'object',
  properties: {
    reason: {
      type: 'string',
      description: '取消原因。用户未说明时可省略。',
    },
  },
}

const DRAFT_RESULT_SCHEMA: LlmJsonObject = {
  draft: 'LeaveRequestDraftState — 当前请假草稿状态。',
  missingFields: 'string[] — 提交前仍缺少的字段。',
}

export class LeaveRequestModuleRegistration extends StaticAiToolModule {
  constructor() {
    super({
      moduleId: 'manualLeave',
      name: '人工请假',
      description: '帮助员工收集、确认并提交人工请假申请。',
      prompt: '帮助员工收集、确认并提交人工请假申请。',
    })
  }

  override readonly functions: readonly AiFunctionRegistration[] = [
  {
    functionId: 'describeDraft',
    description: '读取当前人工请假草稿状态、已填写字段和仍缺少的提交字段。',
    paramsSchema: NO_PARAMS,
    resultSchema: DRAFT_RESULT_SCHEMA,
    usageRules: ['用户要求查看当前申请、确认已收集信息或不知道下一步时调用。', '本函数只读业务 Live state。'],
  },
  {
    functionId: 'setDraftFields',
    description: '把用户明确给出的请假信息写入当前草稿。',
    paramsSchema: SET_DRAFT_FIELDS_SCHEMA,
    resultSchema: DRAFT_RESULT_SCHEMA,
    usageRules: [
      '只写入用户明确表达的字段；不要虚构请假人、日期、原因或审批人。',
      '日期使用 YYYY-MM-DD；用户给相对日期时必须基于系统提示中的当前日期换算，无法唯一确定时先追问。',
      '写入 startDate/endDate/totalDays 前，必须保证三者一致；请假 N 天按自然日包含起止日计算。',
      '只有调用 setDraftFields 成功后，才能说字段已记录或草稿已更新。',
    ],
    failureModes: [
      { code: 'INVALID_FIELDS', when: 'fields 不是对象', fix: '把字段放在 fields 对象中。' },
      { code: 'INVALID_DATE_RANGE', when: '结束日期早于开始日期', fix: '向用户确认日期范围。' },
      { code: 'DRAFT_NOT_EDITABLE', when: '草稿已提交或取消', fix: '创建新草稿或停止修改。' },
    ],
  },
  {
    functionId: 'submitDraft',
    description: '提交当前人工请假申请。提交前会校验必填字段和日期范围。',
    paramsSchema: NO_PARAMS,
    resultSchema: DRAFT_RESULT_SCHEMA,
    usageRules: ['只有用户明确表示提交或确认信息完整时调用。', '如果返回 MISSING_REQUIRED_FIELDS，继续追问缺失字段。'],
    failureModes: [
      { code: 'MISSING_REQUIRED_FIELDS', when: '提交前缺少必填字段', fix: '追问缺失字段后再提交。' },
      { code: 'DRAFT_ALREADY_SUBMITTED', when: '草稿已提交', fix: '不要重复提交。' },
      { code: 'DRAFT_CANCELLED', when: '草稿已取消', fix: '创建新的请假草稿。' },
    ],
  },
  {
    functionId: 'cancelDraft',
    description: '取消当前未提交的人工请假草稿。',
    paramsSchema: CANCEL_DRAFT_SCHEMA,
    resultSchema: {
      draft: 'LeaveRequestDraftState — 取消后的草稿状态。',
    },
    usageRules: ['只有用户明确表示取消当前请假流程时调用。'],
    failureModes: [
      { code: 'DRAFT_ALREADY_SUBMITTED', when: '申请已提交', fix: '不要取消草稿，提示用户走审批撤回流程。' },
    ],
  },
  ]
}

const LEAVE_REQUEST_REGISTRATION = new LeaveRequestModuleRegistration()

function toServiceContext(context: LeaveRequestRuntimeContext | FunctionExecutionContext): LeaveRequestServiceContext {
  return {
    requestId: context.instanceId,
    leaveDraftId: context.moduleInstanceId,
  }
}

function validateParams(functionId: string, args: unknown): string | null {
  const row = LEAVE_REQUEST_REGISTRATION.getFunctions().find((r) => r.functionId === functionId)
  if (!row) return `未知 ${functionId} 函数`
  const result = LlmParamsValidator.validateLlmDeserializedParams(args ?? {}, row.paramsSchema)
  return result.ok ? null : LlmParamsValidator.formatLlmParamValidationIssues(result.issues)
}

function executeServiceMethod(
  functionId: string,
  service: LeaveRequestService,
  args: unknown,
  context: FunctionExecutionContext,
): LeaveRequestServiceResult<unknown> {
  switch (functionId) {
    case 'describeDraft':
      return service.describeDraft(toServiceContext(context))
    case 'setDraftFields':
      return service.setDraftFields(toServiceContext(context), (args as { fields: unknown }).fields)
    case 'submitDraft':
      return service.submitDraft(toServiceContext(context))
    case 'cancelDraft':
      return service.cancelDraft(
        toServiceContext(context),
        isRecord(args) && typeof args['reason'] === 'string' ? args['reason'] : undefined,
      )
    default:
      return leaveRequestServiceFailure('UNKNOWN_FUNCTION', `不支持 ${functionId}`, '请查阅函数目录。')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneJson<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as T
}

export class LeaveRequestModule extends RuntimeBackedBusinessModule {
  static readonly moduleId = LEAVE_REQUEST_MODULE_ID

  static assertContext(context: { readonly moduleId: string }): asserts context is LeaveRequestRuntimeContext {
    if (context.moduleId !== LEAVE_REQUEST_MODULE_ID) {
      throw new Error(`LeaveRequest context moduleId must be ${LEAVE_REQUEST_MODULE_ID}, got ${context.moduleId}`)
    }
  }

  static createDraftId(): string {
    const randomId = typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    return `leaveDraft:${randomId}`
  }

  private readonly service: LeaveRequestService

  constructor(options: { now?: () => number } = {}) {
    const service = new LeaveRequestService(options.now)
    super({
      moduleId: LEAVE_REQUEST_MODULE_ID,
      name: '人工请假',
      description: '帮助员工收集、确认并提交人工请假申请。',
      prompt: [
        '你正在处理人工请假业务。请根据用户输入收集请假人、请假类型、开始日期、结束日期和请假事由。',
        'Live state 由人工请假服务维护；不要声称已经保存到数据库，除非 submitDraft 成功。',
        '提交前必须补齐必填字段；日期不明确时先追问，不要猜测。',
      ].join('\n'),
      functions: LEAVE_REQUEST_REGISTRATION.getFunctions(),
      runtimeOptions: options.now === undefined ? {} : { now: options.now },
    })
    this.service = service
  }

  override async startSession(context: RuntimeBackedModuleContext): Promise<AiRuntimeStartSessionResult> {
    LeaveRequestModule.assertContext(context)
    this.service.getDraft(context.moduleInstanceId)
    return super.startSession(context)
  }

  override async executeFunctionCall(options: RuntimeBackedExecuteFunctionCallOptions): Promise<AiRuntimeFunctionCallResult<unknown>> {
    LeaveRequestModule.assertContext(options)
    return this.executeRegisteredFunctionCall({
      ...options,
      validate: ({ functionRegistration, args }) => validateParams(functionRegistration.functionId, args),
      run: ({ functionRegistration, args, context }) => executeServiceMethod(functionRegistration.functionId, this.service, args, context),
      normalizeResult: (value) => isLeaveRequestServiceResult(value)
        ? value
        : {
          ok: true,
          data: value,
          summary: `${options.action} executed`,
        },
      errorFix: `Fix ${options.action} args or retry after checking manualLeave draft state.`,
    })
  }

  getDraft(leaveDraftId: string): LeaveRequestDraftState {
    return cloneJson(this.service.getDraft(leaveDraftId))
  }

  override releaseModuleInstance(leaveDraftId: string): void {
    this.service.releaseDraft(leaveDraftId)
  }
}

export type {
  LeaveRequestDraftFields,
  LeaveRequestDraftState,
  LeaveRequestDraftStatus,
  LeaveRequestServiceResult,
} from './leave-request-service'
