/**
 * 人工请假模块：草稿服务 + module-semantic 业务注册。
 *
 * 由 leave-request-service.ts + leave-request-module.ts 合并而成。
 */

// ── SECTION 1: 请假草稿服务（原 leave-request-service.ts）───────────

type LeaveRequestDraftStatus = 'draft' | 'submitted' | 'cancelled'

type LeaveRequestDraftFields = {
  readonly applicantName?: string | undefined
  readonly leaveType?: string | undefined
  readonly startDate?: string | undefined
  readonly endDate?: string | undefined
  readonly totalDays?: number | undefined
  readonly reason?: string | undefined
  readonly approver?: string | undefined
}

type LeaveRequestDraftState = {
  readonly leaveDraftId: string
  readonly status: LeaveRequestDraftStatus
  readonly fields: LeaveRequestDraftFields
  readonly createdAt: number
  readonly updatedAt: number
  readonly submittedAt?: number | undefined
  readonly cancelledAt?: number | undefined
  readonly cancelReason?: string | undefined
}

type LeaveRequestServiceContext = {
  readonly requestId: string
  readonly leaveDraftId: string
}

type LeaveRequestServiceResult<TResult> =
  | { ok: true; data: TResult; summary: string }
  | { ok: false; code: string; msg: string; fix: string }

function cloneJson<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') return value
  return globalThis.structuredClone(value)
}

function success<TResult>(data: TResult, summary: string): LeaveRequestServiceResult<TResult> {
  return { ok: true, data, summary }
}

function leaveRequestServiceFailure(code: string, msg: string, fix: string): LeaveRequestServiceResult<never> {
  return { ok: false, code, msg, fix }
}

function isLeaveRequestServiceResult(value: unknown): value is LeaveRequestServiceResult<unknown> {
  if (!isRecord(value)) return false
  if (value['ok'] === true) return 'data' in value && typeof value['summary'] === 'string'
  if (value['ok'] === false) {
    return typeof value['code'] === 'string'
      && typeof value['msg'] === 'string'
      && typeof value['fix'] === 'string'
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

class LeaveRequestService {
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

// ── SECTION 2: 请假模块注册（原 leave-request-module.ts）────────────

import {
  DefaultAiHostSessionStore,
  type AiHostBusinessRegistration,
  type AiHostBusinessRuntimeContext,
  type AiHostFunctionCallResult,
} from '@spark-view/spark-ai/host'
import {
  ModuleKind,
  ModuleSemanticRuntime,
  type ActionSchema,
} from '@spark-view/spark-ai/module-semantic'
import type {
  LlmJsonSchema,
  LlmJsonValue,
  LlmParameterSchemaRoot,
} from '@spark-view/spark-ai/schema'

export const LEAVE_REQUEST_MODULE_ID = 'manualLeave'
export const LEAVE_REQUEST_KIND = 'manual-leave'

export type LeaveRequestBusinessRegistrationOptions = {
  readonly now?: (() => number) | undefined
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
  totalDays: { type: 'number', description: '请假天数，必须大于 0。用户说"请假两天"时填 2。' },
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
      additionalProperties: false,
    },
  },
  required: ['fields'],
  additionalProperties: false,
}

const CANCEL_DRAFT_SCHEMA: LlmParameterSchemaRoot = {
  type: 'object',
  properties: {
    reason: {
      type: 'string',
      description: '取消原因。用户未说明时可省略。',
    },
  },
  additionalProperties: false,
}

const LEAVE_REQUEST_ACTIONS: readonly ActionSchema[] = [
  {
    name: 'describeDraft',
    description: '读取当前人工请假草稿状态、已填写字段和仍缺少的提交字段。',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      draft: 'LeaveRequestDraftState — 当前请假草稿状态。',
      missingFields: 'string[] — 提交前仍缺少的字段。',
    },
    example: {},
    usageRules: ['用户要求查看当前申请、确认已收集信息或不知道下一步时调用。', '本函数只读业务 Live state。'],
    failureModes: [],
  },
  {
    name: 'setDraftFields',
    description: '把用户明确给出的请假信息写入当前草稿。',
    paramsSchema: SET_DRAFT_FIELDS_SCHEMA,
    resultSchema: {
      draft: 'LeaveRequestDraftState — 当前请假草稿状态。',
      missingFields: 'string[] — 提交前仍缺少的字段。',
    },
    example: {
      fields: {
        applicantName: 'Ada',
        leaveType: 'annual',
        startDate: '2026-05-14',
        endDate: '2026-05-15',
        totalDays: 2,
        reason: 'family care',
      },
    },
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
    name: 'submitDraft',
    description: '提交当前人工请假申请。提交前会校验必填字段和日期范围。',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      draft: 'LeaveRequestDraftState — 当前请假草稿状态。',
      missingFields: 'string[] — 提交前仍缺少的字段。',
    },
    example: {},
    usageRules: ['只有用户明确表示提交或确认信息完整时调用。', '如果返回 MISSING_REQUIRED_FIELDS，继续追问缺失字段。'],
    failureModes: [
      { code: 'MISSING_REQUIRED_FIELDS', when: '提交前缺少必填字段', fix: '追问缺失字段后再提交。' },
      { code: 'DRAFT_ALREADY_SUBMITTED', when: '草稿已提交', fix: '不要重复提交。' },
      { code: 'DRAFT_CANCELLED', when: '草稿已取消', fix: '创建新的请假草稿。' },
    ],
  },
  {
    name: 'cancelDraft',
    description: '取消当前未提交的人工请假草稿。',
    paramsSchema: CANCEL_DRAFT_SCHEMA,
    resultSchema: {
      draft: 'LeaveRequestDraftState — 取消后的草稿状态。',
    },
    example: { reason: '用户取消申请' },
    usageRules: ['只有用户明确表示取消当前请假流程时调用。'],
    failureModes: [
      { code: 'DRAFT_ALREADY_SUBMITTED', when: '申请已提交', fix: '不要取消草稿，提示用户走审批撤回流程。' },
    ],
  },
]

class LeaveRequestModuleKind extends ModuleKind {
  private readonly service: LeaveRequestService
  private readonly actionByName: ReadonlyMap<string, ActionSchema>

  public constructor(service: LeaveRequestService) {
    super({
      kind: LEAVE_REQUEST_KIND,
      name: '人工请假',
      description: '帮助员工收集、确认并提交人工请假申请。',
      actions: LEAVE_REQUEST_ACTIONS,
      children: [],
    })
    this.service = service
    this.actionByName = new Map(LEAVE_REQUEST_ACTIONS.map((action) => [action.name, action]))
  }

  public override invokeAction(
    ctx: ModuleKind.PathContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): Promise<ModuleKind.OperationResult<LlmJsonValue>> {
    this.requireAction(actionName)
    switch (actionName) {
      case 'describeDraft':
        return Promise.resolve(this.serviceResultToOperationResult(this.service.describeDraft(toServiceContext(ctx))))
      case 'setDraftFields':
        return Promise.resolve(this.serviceResultToOperationResult(this.service.setDraftFields(toServiceContext(ctx), args['fields'])))
      case 'submitDraft':
        return Promise.resolve(this.serviceResultToOperationResult(this.service.submitDraft(toServiceContext(ctx))))
      case 'cancelDraft':
        return Promise.resolve(this.serviceResultToOperationResult(
          this.service.cancelDraft(toServiceContext(ctx), typeof args['reason'] === 'string' ? args['reason'] : undefined),
        ))
      default:
        throw new Error(`manual-leave action runner is not registered: ${actionName}`)
    }
  }

  protected override createCurrentInstanceRef(ctx: ModuleKind.PathContext): ModuleKind.InstanceRef | null {
    return createCurrentLeaveRequestRef(ctx)
  }

  private requireAction(actionName: string): ActionSchema {
    const action = this.actionByName.get(actionName)
    if (action === undefined) {
      throw new Error(`${this.kind} action is not declared: ${actionName}`)
    }
    return action
  }
}

function createLeaveRequestModuleKind(service: LeaveRequestService): ModuleKind {
  return new LeaveRequestModuleKind(service)
}

function createCurrentLeaveRequestRef(ctx: ModuleKind.PathContext): ModuleKind.InstanceRef | null {
  const leaveDraftId = ctx.host?.moduleInstanceId
  if (leaveDraftId === undefined || leaveDraftId.length === 0) {
    return null
  }
  return { id: leaveDraftId, label: '当前请假草稿', summary: '当前人工请假业务实例' }
}

export function createLeaveRequestBusinessRegistration(
  options: LeaveRequestBusinessRegistrationOptions = {},
): AiHostBusinessRegistration {
  const service = new LeaveRequestService(options.now)
  const runtime = new ModuleSemanticRuntime()
  runtime.registerKind(createLeaveRequestModuleKind(service))

  return {
    moduleId: LEAVE_REQUEST_MODULE_ID,
    name: '人工请假',
    description: '帮助员工收集、确认并提交人工请假申请。',
    runtime,
    sessionStore: new DefaultAiHostSessionStore(options.now === undefined ? {} : { now: options.now }),
    systemPrompt: () => createLeaveRequestSystemPrompt(new Date((options.now ?? Date.now)())),
    onStartSession: (context) => {
      service.getDraft(context.moduleInstanceId)
    },
    afterFunctionCall: (call) => {
      const actionName = readInvokeActionName(call.toolName, call.args)
      if (actionName === 'submitDraft' && call.result.ok) {
        return {
          status: 'complete',
          reason: 'leave request submitted',
          finalAssistantMessage: submittedLeaveMessage(call.result),
          releaseInstance: true,
        }
      }
      if (actionName === 'cancelDraft' && call.result.ok) {
        return {
          status: 'abort',
          reason: 'leave request cancelled',
          finalAssistantMessage: '当前请假草稿已取消。',
          releaseInstance: true,
        }
      }
      return { status: 'continue' }
    },
    releaseModuleInstance: (moduleInstanceId) => {
      service.releaseDraft(moduleInstanceId)
    },
  }
}

export function createLeaveRequestDraftId(now = Date.now): string {
  const randomId = typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${now()}-${Math.random().toString(36).slice(2, 10)}`
  return `leaveDraft:${randomId}`
}

function toServiceContext(ctx: ModuleKind.PathContext | AiHostBusinessRuntimeContext): LeaveRequestServiceContext {
  if ('host' in ctx || 'segment' in ctx) {
    const pathCtx = ctx
    return {
      requestId: pathCtx.host?.instanceId ?? pathCtx.segment.id,
      leaveDraftId: pathCtx.host?.moduleInstanceId ?? pathCtx.segment.id,
    }
  }
  return {
    requestId: ctx.instanceId,
    leaveDraftId: ctx.moduleInstanceId,
  }
}

function readInvokeActionName(toolName: string, args: Readonly<Record<string, LlmJsonValue>>): string | null {
  if (toolName !== 'invokeAction') return null
  return typeof args['actionName'] === 'string' ? args['actionName'] : null
}

function submittedLeaveMessage(result: AiHostFunctionCallResult<unknown>): string {
  const data = result.ok && isRecord(result.data) ? result.data : {}
  const draft = isRecord(data['draft']) ? data['draft'] : {}
  const fields = isRecord(draft['fields']) ? draft['fields'] : {}
  const totalDays = typeof fields['totalDays'] === 'number' ? `${fields['totalDays']}天` : '-'
  return [
    '请假申请已提交成功。',
    '',
    `请假人：${typeof fields['applicantName'] === 'string' ? fields['applicantName'] : '-'}`,
    `请假类型：${leaveTypeLabel(fields['leaveType'])}`,
    `开始日期：${typeof fields['startDate'] === 'string' ? fields['startDate'] : '-'}`,
    `结束日期：${typeof fields['endDate'] === 'string' ? fields['endDate'] : '-'}`,
    `请假天数：${totalDays}`,
    `请假事由：${typeof fields['reason'] === 'string' ? fields['reason'] : '-'}`,
  ].join('\n')
}

function leaveTypeLabel(value: unknown): string {
  if (value === 'annual') return '年假'
  if (value === 'sick') return '病假'
  if (value === 'personal') return '事假'
  if (value === 'other') return '其他'
  return typeof value === 'string' && value.trim().length > 0 ? value : '-'
}

function createLeaveRequestSystemPrompt(now: Date): string {
  const timeZone = getRuntimeTimeZone()
  const currentDate = formatDateInTimeZone(now, timeZone)
  return [
    '人工请假运行时上下文：',
    `- 当前日期：${currentDate}`,
    `- 当前 UTC 时间：${now.toISOString()}`,
    `- 当前时区：${timeZone}`,
    '处理"今天/明天/后天/下周一"等相对日期时，必须基于当前日期换算；无法唯一确定时先追问，不要假设或使用训练样本中的日期。',
  ].join('\n')
}

function getRuntimeTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'
  } catch {
    return 'local'
  }
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const byType = new Map(parts.map((part) => [part.type, part.value]))
    const year = byType.get('year')
    const month = byType.get('month')
    const day = byType.get('day')
    if (year !== undefined && month !== undefined && day !== undefined) {
      return `${year}-${month}-${day}`
    }
  } catch {
    // fall through to UTC date
  }
  return date.toISOString().slice(0, 10)
}
