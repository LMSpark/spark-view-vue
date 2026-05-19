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

function cloneJson<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') return value
  return globalThis.structuredClone(value)
}

function success<TResult>(data: TResult, summary: string): LeaveRequestServiceResult<TResult> {
  return { ok: true, data, summary }
}

export function leaveRequestServiceFailure(code: string, msg: string, fix: string): LeaveRequestServiceResult<never> {
  return { ok: false, code, msg, fix }
}

export function isLeaveRequestServiceResult(value: unknown): value is LeaveRequestServiceResult<unknown> {
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
