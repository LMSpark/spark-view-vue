import {
  AiRuntime,
  type AiFunctionRegistration,
  type AiModuleRegistration,
  type AiModuleRegistrationData,
  type AiModuleRegistrationStoreSnapshot,
  type AiRegisteredModuleApi,
  type AiRuntimeFunctionCallResult,
  type AiRuntimeFunctionCallTranslationResult,
  type AiRuntimeHistoryEntry,
  type AiRuntimeKnowledgeProjection,
  type AiRuntimeMessageHistoryEntry,
  type AiRuntimeMessageRole,
  type AiRuntimeMessageSource,
  type AiRuntimeSessionRecord,
  type AiRuntimeStartInstanceResult,
  type AiRuntimeStopInstanceResult,
  type FunctionExecutionContext,
  type LlmJsonObject,
  type LlmParameterSchemaRoot,
} from '../../core'

export const LEAVE_REQUEST_MODULE_ID = 'manualLeave'

export type LeaveRequestDraftStatus = 'draft' | 'submitted' | 'cancelled'

export interface LeaveRequestDraftFields {
  readonly applicantName?: string | undefined
  readonly leaveType?: string | undefined
  readonly startDate?: string | undefined
  readonly endDate?: string | undefined
  readonly totalDays?: number | undefined
  readonly reason?: string | undefined
  readonly approver?: string | undefined
}

export interface LeaveRequestDraftState {
  readonly leaveDraftId: string
  readonly status: LeaveRequestDraftStatus
  readonly fields: LeaveRequestDraftFields
  readonly createdAt: number
  readonly updatedAt: number
  readonly submittedAt?: number | undefined
  readonly cancelledAt?: number | undefined
  readonly cancelReason?: string | undefined
}

export interface LeaveRequestServiceContext {
  readonly requestId: string
  readonly leaveDraftId: string
}

export type LeaveRequestServiceResult<TResult> =
  | { ok: true; data: TResult; summary: string }
  | { ok: false; code: string; msg: string; fix: string }

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

type LeaveRequestFunctionId = 'describeDraft' | 'setDraftFields' | 'submitDraft' | 'cancelDraft'

type LeaveRequestFunctionDefinition = AiFunctionRegistration & {
  readonly functionId: LeaveRequestFunctionId
  validate?(args: unknown, context: FunctionExecutionContext): string | null
  apply(args: unknown, context: FunctionExecutionContext): LeaveRequestServiceResult<unknown>
}

const NO_PARAMS: LlmParameterSchemaRoot = {}

const DRAFT_FIELDS_SCHEMA: LlmJsonObject = {
  applicantName: { type: 'string', description: '请假人姓名。' },
  leaveType: { type: 'string', description: '请假类型，例如 annual、sick、personal、other。' },
  startDate: { type: 'string', description: '开始日期，格式 YYYY-MM-DD。用户给“今天/明天/后天”等相对日期时，必须基于系统提示中的当前日期换算；不能使用假设日期。' },
  endDate: { type: 'string', description: '结束日期，格式 YYYY-MM-DD。按自然日包含起止日计算；例如请假 2 天时，endDate = startDate + 1 天。' },
  totalDays: { type: 'number', description: '请假天数，必须大于 0。用户说“请假两天”时填 2。' },
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

function cloneJson<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as T
}

function success<TResult>(data: TResult, summary: string): LeaveRequestServiceResult<TResult> {
  return { ok: true, data, summary }
}

export function leaveRequestServiceFailure(code: string, msg: string, fix: string): LeaveRequestServiceResult<never> {
  return { ok: false, code, msg, fix }
}

export function isLeaveRequestServiceResult(value: unknown): value is LeaveRequestServiceResult<unknown> {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return false
  const candidate = value as Partial<LeaveRequestServiceResult<unknown>>
  if (candidate.ok === true) return 'data' in candidate && typeof candidate.summary === 'string'
  if (candidate.ok === false) {
    return typeof candidate.code === 'string'
      && typeof candidate.msg === 'string'
      && typeof candidate.fix === 'string'
  }
  return false
}

function readStringField(record: Record<string, unknown>, key: keyof LeaveRequestDraftFields): string | undefined {
  const value = record[key]
  if (value === undefined || value === null) return undefined
  return typeof value === 'string' ? value.trim() : undefined
}

function readNumberField(record: Record<string, unknown>, key: keyof LeaveRequestDraftFields): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseDateOnly(value: string | undefined): number | null {
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(timestamp) ? timestamp : null
}

function normalizeDraftFields(input: unknown): LeaveRequestDraftFields | LeaveRequestServiceResult<never> {
  if (!isRecord(input)) {
    return leaveRequestServiceFailure('INVALID_FIELDS', 'fields 必须是对象。', '把要更新的请假字段放在 fields 对象中。')
  }

  const fields: LeaveRequestDraftFields = {
    ...(readStringField(input, 'applicantName') !== undefined ? { applicantName: readStringField(input, 'applicantName') } : {}),
    ...(readStringField(input, 'leaveType') !== undefined ? { leaveType: readStringField(input, 'leaveType') } : {}),
    ...(readStringField(input, 'startDate') !== undefined ? { startDate: readStringField(input, 'startDate') } : {}),
    ...(readStringField(input, 'endDate') !== undefined ? { endDate: readStringField(input, 'endDate') } : {}),
    ...(readNumberField(input, 'totalDays') !== undefined ? { totalDays: readNumberField(input, 'totalDays') } : {}),
    ...(readStringField(input, 'reason') !== undefined ? { reason: readStringField(input, 'reason') } : {}),
    ...(readStringField(input, 'approver') !== undefined ? { approver: readStringField(input, 'approver') } : {}),
  }

  if (Object.keys(fields).length === 0) {
    return leaveRequestServiceFailure('EMPTY_FIELDS', '没有可写入的请假字段。', '根据用户输入至少设置一个请假字段。')
  }

  if (fields.startDate !== undefined && parseDateOnly(fields.startDate) === null) {
    return leaveRequestServiceFailure('INVALID_START_DATE', 'startDate 必须是 YYYY-MM-DD。', '请向用户确认请假开始日期。')
  }
  if (fields.endDate !== undefined && parseDateOnly(fields.endDate) === null) {
    return leaveRequestServiceFailure('INVALID_END_DATE', 'endDate 必须是 YYYY-MM-DD。', '请向用户确认请假结束日期。')
  }
  if (fields.totalDays !== undefined && fields.totalDays <= 0) {
    return leaveRequestServiceFailure('INVALID_TOTAL_DAYS', 'totalDays 必须大于 0。', '请根据开始/结束日期或用户说明重新计算请假天数。')
  }

  return fields
}

function missingRequiredFields(fields: LeaveRequestDraftFields): string[] {
  const missing: string[] = []
  if (fields.applicantName === undefined || fields.applicantName === '') missing.push('applicantName')
  if (fields.leaveType === undefined || fields.leaveType === '') missing.push('leaveType')
  if (fields.startDate === undefined || fields.startDate === '') missing.push('startDate')
  if (fields.endDate === undefined || fields.endDate === '') missing.push('endDate')
  if (fields.reason === undefined || fields.reason === '') missing.push('reason')
  return missing
}

function validateDateRange(fields: LeaveRequestDraftFields): LeaveRequestServiceResult<never> | null {
  const start = parseDateOnly(fields.startDate)
  const end = parseDateOnly(fields.endDate)
  if (fields.startDate !== undefined && start === null) {
    return leaveRequestServiceFailure('INVALID_START_DATE', 'startDate 必须是 YYYY-MM-DD。', '请向用户确认请假开始日期。')
  }
  if (fields.endDate !== undefined && end === null) {
    return leaveRequestServiceFailure('INVALID_END_DATE', 'endDate 必须是 YYYY-MM-DD。', '请向用户确认请假结束日期。')
  }
  if (start !== null && end !== null && end < start) {
    return leaveRequestServiceFailure('INVALID_DATE_RANGE', 'endDate 不能早于 startDate。', '请向用户确认请假的开始和结束日期。')
  }
  return null
}

export class LeaveRequestService {
  private readonly states = new Map<string, LeaveRequestDraftState>()

  constructor(private readonly now: () => number = Date.now) {}

  getDraft(leaveDraftId: string): LeaveRequestDraftState {
    const existing = this.states.get(leaveDraftId)
    if (existing !== undefined) return existing
    const timestamp = this.now()
    const draft: LeaveRequestDraftState = {
      leaveDraftId,
      status: 'draft',
      fields: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    this.states.set(leaveDraftId, draft)
    return draft
  }

  describeDraft(context: LeaveRequestServiceContext): LeaveRequestServiceResult<{
    draft: LeaveRequestDraftState
    missingFields: string[]
  }> {
    const draft = this.getDraft(context.leaveDraftId)
    return success(
      { draft: cloneJson(draft), missingFields: missingRequiredFields(draft.fields) },
      `请假草稿 ${draft.status}，缺少 ${missingRequiredFields(draft.fields).length} 个必填字段`,
    )
  }

  setDraftFields(context: LeaveRequestServiceContext, fieldsInput: unknown): LeaveRequestServiceResult<{
    draft: LeaveRequestDraftState
    missingFields: string[]
  }> {
    const draft = this.getDraft(context.leaveDraftId)
    if (draft.status !== 'draft') {
      return leaveRequestServiceFailure(
        'DRAFT_NOT_EDITABLE',
        `当前草稿状态为 ${draft.status}，不能继续修改。`,
        '创建新的请假草稿，或让用户确认是否取消当前流程。',
      )
    }

    const fields = normalizeDraftFields(fieldsInput)
    if (isLeaveRequestServiceResult(fields)) return fields
    const nextFields = { ...draft.fields, ...fields }
    const dateError = validateDateRange(nextFields)
    if (dateError !== null) return dateError

    const updated: LeaveRequestDraftState = {
      ...draft,
      fields: nextFields,
      updatedAt: this.now(),
    }
    this.states.set(context.leaveDraftId, updated)
    return success(
      { draft: cloneJson(updated), missingFields: missingRequiredFields(updated.fields) },
      '请假草稿已更新',
    )
  }

  submitDraft(context: LeaveRequestServiceContext): LeaveRequestServiceResult<{
    draft: LeaveRequestDraftState
    missingFields: string[]
  }> {
    const draft = this.getDraft(context.leaveDraftId)
    if (draft.status === 'submitted') {
      return leaveRequestServiceFailure('DRAFT_ALREADY_SUBMITTED', '当前请假草稿已提交。', '不要重复提交；如需修改请创建新草稿。')
    }
    if (draft.status === 'cancelled') {
      return leaveRequestServiceFailure('DRAFT_CANCELLED', '当前请假草稿已取消。', '创建新的请假草稿后再提交。')
    }

    const dateError = validateDateRange(draft.fields)
    if (dateError !== null) return dateError
    const missingFields = missingRequiredFields(draft.fields)
    if (missingFields.length > 0) {
      return leaveRequestServiceFailure(
        'MISSING_REQUIRED_FIELDS',
        `请假申请缺少必填字段：${missingFields.join(', ')}`,
        '继续向用户追问缺失字段，补齐后再提交。',
      )
    }

    const timestamp = this.now()
    const submitted: LeaveRequestDraftState = {
      ...draft,
      status: 'submitted',
      updatedAt: timestamp,
      submittedAt: timestamp,
    }
    this.states.set(context.leaveDraftId, submitted)
    return success(
      { draft: cloneJson(submitted), missingFields: [] },
      '请假申请已提交',
    )
  }

  cancelDraft(context: LeaveRequestServiceContext, reason: string | undefined): LeaveRequestServiceResult<{
    draft: LeaveRequestDraftState
  }> {
    const draft = this.getDraft(context.leaveDraftId)
    if (draft.status === 'submitted') {
      return leaveRequestServiceFailure('DRAFT_ALREADY_SUBMITTED', '已提交的请假申请不能取消草稿。', '如需撤回，请走审批撤回流程。')
    }

    const timestamp = this.now()
    const cancelled: LeaveRequestDraftState = {
      ...draft,
      status: 'cancelled',
      updatedAt: timestamp,
      cancelledAt: timestamp,
      ...(reason !== undefined && reason.trim().length > 0 ? { cancelReason: reason.trim() } : {}),
    }
    this.states.set(context.leaveDraftId, cancelled)
    return success({ draft: cloneJson(cancelled) }, '请假草稿已取消')
  }

  releaseDraft(leaveDraftId: string): void {
    this.states.delete(leaveDraftId)
  }
}

function toServiceContext(context: LeaveRequestRuntimeContext | FunctionExecutionContext): LeaveRequestServiceContext {
  return {
    requestId: context.instanceId,
    leaveDraftId: context.moduleInstanceId,
  }
}

function validateFieldsArg(args: unknown): string | null {
  if (!isRecord(args)) return 'args 必须是对象'
  if (!isRecord(args['fields'])) return 'fields 必须是对象'
  return null
}

function validateCancelArg(args: unknown): string | null {
  if (args === undefined || args === null) return null
  if (!isRecord(args)) return 'args 必须是对象'
  if (args['reason'] !== undefined && typeof args['reason'] !== 'string') return 'reason 必须是字符串'
  return null
}

function createFunctionDefinitions(service: LeaveRequestService): readonly LeaveRequestFunctionDefinition[] {
  return [
    {
      functionId: 'describeDraft',
      description: '读取当前人工请假草稿状态、已填写字段和仍缺少的提交字段。',
      paramsSchema: NO_PARAMS,
      resultSchema: DRAFT_RESULT_SCHEMA,
      usageRules: ['用户要求查看当前申请、确认已收集信息或不知道下一步时调用。', '本函数只读业务 Live state。'],
      apply: (_args, context) => service.describeDraft(toServiceContext(context)),
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
      validate: validateFieldsArg,
      apply: (args, context) => service.setDraftFields(toServiceContext(context), (args as { fields: unknown }).fields),
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
      apply: (_args, context) => service.submitDraft(toServiceContext(context)),
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
      validate: validateCancelArg,
      apply: (args, context) => service.cancelDraft(
        toServiceContext(context),
        isRecord(args) && typeof args['reason'] === 'string' ? args['reason'] : undefined,
      ),
    },
  ]
}

export function assertLeaveRequestContext(context: { readonly moduleId: string }): asserts context is LeaveRequestRuntimeContext {
  if (context.moduleId !== LEAVE_REQUEST_MODULE_ID) {
    throw new Error(`LeaveRequest context moduleId must be ${LEAVE_REQUEST_MODULE_ID}, got ${context.moduleId}`)
  }
}

export function createLeaveDraftId(): string {
  const randomId = typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `leaveDraft:${randomId}`
}

export class LeaveRequestModule implements AiModuleRegistration {
  static readonly moduleId = LEAVE_REQUEST_MODULE_ID

  readonly moduleId = LEAVE_REQUEST_MODULE_ID

  readonly name = '人工请假'

  readonly description = '帮助员工收集、确认并提交人工请假申请。'

  readonly prompt = [
    '你正在处理人工请假业务。请根据用户输入收集请假人、请假类型、开始日期、结束日期和请假事由。',
    'Live state 由人工请假服务维护；不要声称已经保存到数据库，除非 submitDraft 成功。',
    '提交前必须补齐必填字段；日期不明确时先追问，不要猜测。',
  ].join('\n')

  readonly modules: readonly AiModuleRegistration[] = []

  private readonly service: LeaveRequestService

  private readonly core: AiRuntime

  private readonly ai: AiRegisteredModuleApi

  private readonly functions: readonly LeaveRequestFunctionDefinition[]

  constructor(options: { now?: () => number } = {}) {
    this.service = new LeaveRequestService(options.now)
    this.core = new AiRuntime(options.now === undefined ? {} : { now: options.now })
    this.functions = createFunctionDefinitions(this.service)
    this.ai = this.core.registerModule(this)
  }

  getFunctions(): readonly AiFunctionRegistration[] {
    return this.functions
  }

  async projectKnowledge(context: LeaveRequestRuntimeContext): Promise<AiRuntimeKnowledgeProjection> {
    assertLeaveRequestContext(context)
    return this.ai.projectModule({
      instanceId: context.instanceId,
      moduleInstanceId: context.moduleInstanceId,
      runtimeInstanceId: context.instanceId,
    })
  }

  async startSession(context: LeaveRequestRuntimeContext): Promise<AiRuntimeStartInstanceResult> {
    assertLeaveRequestContext(context)
    this.service.getDraft(context.moduleInstanceId)
    return this.ai.startInstance({
      instanceId: context.instanceId,
      moduleInstanceId: context.moduleInstanceId,
      runtimeInstanceId: context.instanceId,
    })
  }

  stopSession(options: LeaveRequestStopSessionOptions): AiRuntimeStopInstanceResult {
    assertLeaveRequestContext(options)
    return this.ai.stopInstance({
      instanceId: options.instanceId,
      moduleInstanceId: options.moduleInstanceId,
      ...(options.reason === undefined ? {} : { reason: options.reason }),
    })
  }

  appendMessage(options: LeaveRequestAppendMessageOptions): AiRuntimeMessageHistoryEntry {
    assertLeaveRequestContext(options)
    return this.ai.appendMessage({
      instanceId: options.instanceId,
      moduleInstanceId: options.moduleInstanceId,
      runtimeInstanceId: options.instanceId,
      role: options.role,
      content: options.content,
      ...(options.source === undefined ? {} : { source: options.source }),
      ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
    })
  }

  getSession(context: LeaveRequestRuntimeContext): AiRuntimeSessionRecord | null {
    assertLeaveRequestContext(context)
    return this.ai.getSessionByModuleInstance(context.moduleInstanceId)
  }

  getSessionHistory(context: LeaveRequestRuntimeContext): readonly AiRuntimeHistoryEntry[] {
    assertLeaveRequestContext(context)
    return this.ai.getSessionHistoryByModuleInstance(context.moduleInstanceId)
  }

  getRegistrationData(): AiModuleRegistrationData {
    return this.ai.getRegistrationData()
  }

  getRegistrationStoreSnapshot(): AiModuleRegistrationStoreSnapshot {
    return this.ai.getRegistrationStoreSnapshot()
  }

  async translateFunctionCall(options: LeaveRequestExecuteFunctionCallOptions): Promise<AiRuntimeFunctionCallTranslationResult> {
    assertLeaveRequestContext(options)
    return this.ai.translateFunctionCall({
      instanceId: options.instanceId,
      moduleInstanceId: options.moduleInstanceId,
      runtimeInstanceId: options.instanceId,
      action: options.action,
      args: options.args,
      ...(options.projection === undefined ? {} : { projection: options.projection }),
    })
  }

  async executeFunctionCall(options: LeaveRequestExecuteFunctionCallOptions): Promise<AiRuntimeFunctionCallResult<unknown>> {
    assertLeaveRequestContext(options)
    return this.ai.executeFunctionCall({
      instanceId: options.instanceId,
      moduleInstanceId: options.moduleInstanceId,
      runtimeInstanceId: options.instanceId,
      action: options.action,
      args: options.args,
      ...(options.projection === undefined ? {} : { projection: options.projection }),
      validate: ({ functionRegistration, args, context }) => (
        functionRegistration as LeaveRequestFunctionDefinition
      ).validate?.(args, context) ?? null,
      run: ({ functionRegistration, args, context }) => (
        functionRegistration as LeaveRequestFunctionDefinition
      ).apply(args, context),
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

  releaseModuleInstance(leaveDraftId: string): void {
    this.service.releaseDraft(leaveDraftId)
  }
}
