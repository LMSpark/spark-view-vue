/**
 * 人工请假模块——独立的 AI 业务示例。
 *
 * ## 与 PageDesign 的关系
 * 本模块与 PageDesign **完全独立**，不共享任何类型、服务或 AiModule。
 * 位于独立的 `leave-request/` 文件夹中，作为"如何用 spark-ai 框架注册一个 AI 业务模块"的参考实现。
 *
 * ## 模块结构
 * ```
 * SECTION 1: LeaveRequestService          草稿状态机（draft → submitted / cancelled）
 * SECTION 2: LeaveRequestAiService        AI action 暴露（草稿动作 + 人员目录 handle）
 *            PersonDirectory              API-bearing 人员目录返回对象
 *            createLeaveRequestBusinessRegistration  完整的 AiAgentRegistration 装配
 * ```
 *
 * ## 会话生命周期
 * ```
 * 1. onStartSession     → 注入人员目录、系统提示词
 * 2. LLM 自主循环       → describeDraft → setDraftFields → submitDraft
 * 3. afterFunctionCall  → submitDraft 成功后自动 complete；
 *                         cancelDraft 成功后自动 abort
 * 4. releaseModuleInstance → service.releaseDraft() 清理
 * ```
 *
 * ## 四个 AI 动作
 * - `describeDraft` — 查看草稿当前状态与已填字段
 * - `setDraftFields` — 填写/修改草稿字段（申请人、类型、日期、原因、审批人）
 * - `submitDraft` — 提交草稿（校验必填字段 → 状态改为 submitted）
 * - `cancelDraft` — 取消草稿（状态改为 cancelled，可选填写取消原因）
 *
 * ## 公共 API
 * - `createLeaveRequestBusinessRegistration(options)` → AiAgentRegistration
 * - `createLeaveRequestDraftId(now?)` → 生成草稿 ID
 */

// ── SECTION 1: 请假草稿服务（原 leave-request-service.ts）───────────

type LeaveRequestDraftStatus = 'draft' | 'submitted' | 'cancelled'

type LeaveRequestDraftFields = {
  readonly applicantName?: string
  readonly applicantCode?: string
  readonly leaveType?: string
  readonly startDate?: string
  readonly endDate?: string
  readonly totalDays?: number
  readonly reason?: string
  readonly approver?: string
  readonly approverCode?: string
}

type LeaveRequestPersonRecord = Readonly<{
  code: string
  name: string
  department: string
  role: string
}>

type LeaveRequestDraftState = {
  readonly leaveDraftId: string
  readonly status: LeaveRequestDraftStatus
  readonly fields: LeaveRequestDraftFields
  readonly createdAt: number
  readonly updatedAt: number
  readonly submittedAt?: number
  readonly cancelledAt?: number
  readonly cancelReason?: string
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

function parseDateOnly(value: string | undefined): number | null {
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(timestamp) ? timestamp : null
}

function normalizeDraftFields(input: unknown): LeaveRequestDraftFields | LeaveRequestServiceResult<never> {
  if (!isRecord(input)) {
    return leaveRequestServiceFailure('INVALID_FIELDS', 'fields 必须是对象。', '把要更新的请假字段放在 fields 对象中。')
  }

  const applicantName = readStringField(input, 'applicantName')
  const applicantCode = readStringField(input, 'applicantCode')
  const leaveType = readStringField(input, 'leaveType')
  const startDate = readStringField(input, 'startDate')
  const endDate = readStringField(input, 'endDate')
  const totalDays = readNumberField(input, 'totalDays')
  const reason = readStringField(input, 'reason')
  const approver = readStringField(input, 'approver')
  const approverCode = readStringField(input, 'approverCode')
  const fields: LeaveRequestDraftFields = {
    ...(applicantName === undefined ? {} : { applicantName }),
    ...(applicantCode === undefined ? {} : { applicantCode }),
    ...(leaveType === undefined ? {} : { leaveType }),
    ...(startDate === undefined ? {} : { startDate }),
    ...(endDate === undefined ? {} : { endDate }),
    ...(totalDays === undefined ? {} : { totalDays }),
    ...(reason === undefined ? {} : { reason }),
    ...(approver === undefined ? {} : { approver }),
    ...(approverCode === undefined ? {} : { approverCode }),
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
      return leaveRequestServiceFailure('DRAFT_ALREADY_SUBMITTED', '当前请假草稿已提交。', '提示用户当前草稿已提交；如需修改请创建新草稿。')
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
  AiModuleAdapter,
  DefaultAiAgentSessionStore,
  type AiAgentRegistration,
  type AiAgentRuntimeContext,
  type AiAgentFunctionCallResult,
} from '@spark-view/spark-ai/agent'
import {
  AiModuleResult,
  type AiModuleMetadataJson,
  type AiModulePathContext,
} from '@spark-view/spark-ai/modules'
import type {
  AiJsonSchema,
  AiJsonValue,
} from '@spark-view/spark-ai/json'
import {
  coerceJsonValue,
  noParamsSchema,
  objectSchema,
  stringSchema,
} from '@spark-view/spark-ai/json'
import { isRecord } from '@spark-view/spark-utils'

export const LEAVE_REQUEST_MODULE_ID = 'manualLeave'
export const LEAVE_REQUEST_KIND = 'manual-leave'

export type LeaveRequestBusinessRegistrationOptions = {
  readonly now?: () => number
  readonly persons?: readonly LeaveRequestPersonRecord[]
}

const NO_PARAMS = noParamsSchema('不接受参数，请传 {} 或留空。')
const DEFAULT_LEAVE_REQUEST_PERSONS: readonly LeaveRequestPersonRecord[] = [
  { code: 'E1001', name: 'Ada', department: '研发部', role: 'employee' },
  { code: 'E1002', name: 'Lin', department: '人事部', role: 'approver' },
  { code: 'E1003', name: 'Grace', department: '财务部', role: 'approver' },
]

const DRAFT_FIELDS_SCHEMA: Record<string, AiJsonSchema> = {
  applicantName: { type: 'string', description: '请假人姓名。' },
  applicantCode: { type: 'string', description: '请假人人员编码；通过人员目录 handle 的 getPerson/searchPersons 查询得到。' },
  leaveType: { type: 'string', description: '请假类型，例如 annual、sick、personal、other。' },
  startDate: { type: 'string', description: '开始日期，格式 YYYY-MM-DD。用户给"今天/明天/后天"等相对日期时，必须基于系统提示中的当前日期换算；日期来源以当前运行时上下文和用户确认为准。' },
  endDate: { type: 'string', description: '结束日期，格式 YYYY-MM-DD。按自然日包含起止日计算；例如请假 2 天时，endDate = startDate + 1 天。' },
  totalDays: { type: 'number', description: '请假天数，必须大于 0。用户说"请假两天"时填 2。' },
  reason: { type: 'string', description: '请假事由。' },
  approver: { type: 'string', description: '审批人姓名。' },
  approverCode: { type: 'string', description: '审批人人员编码；通过人员目录 handle 的 getPerson/searchPersons 查询得到。' },
}

const SET_DRAFT_FIELDS_SCHEMA = objectSchema({
  fields: objectSchema(DRAFT_FIELDS_SCHEMA, {
    description: '要写入请假草稿的字段。只传用户明确给出的字段。',
  }),
}, { required: ['fields'] })

const CANCEL_DRAFT_SCHEMA = objectSchema({
  reason: stringSchema('取消原因。用户未说明时可省略。'),
})

/**
 * 人员目录 API 对象。
 *
 * @moduleKind person-directory
 * @moduleName 人员目录
 * @moduleDescription 请假人员和审批人查询。
 */
class PersonDirectory {
  private readonly people: readonly LeaveRequestPersonRecord[]

  public constructor(people: readonly LeaveRequestPersonRecord[]) {
    this.people = people.map((person) => ({
      code: person.code.trim(),
      name: person.name.trim(),
      department: person.department.trim(),
      role: person.role.trim(),
    }))
  }

  /**
   * 按条件搜索人员。
   *
   * @moduleAction searchPersons
   */
  public searchPersons(
    _ctx: AiModulePathContext,
    args: Readonly<{ keyword?: string; role?: string; department?: string }>,
  ): AiModuleResult<AiJsonValue> {
    const matches = this.people.filter((person) => personMatchesQuery(person, args))
    return AiModuleResult.ok(matches.map(personToJson))
  }

  /**
   * 按编码获取人员详情。
   *
   * @moduleAction getPerson
   */
  public getPerson(
    _ctx: AiModulePathContext,
    args: Readonly<{ code: string }>,
  ): AiModuleResult<AiJsonValue> {
    const person = this.findByCode(args.code)
    if (person === undefined) {
      return AiModuleResult.failCode('PERSON_NOT_FOUND', `人员编码不存在：${args.code}`, '先调用 searchPersons 查询可用人员。')
    }
    return AiModuleResult.ok(personToJson(person))
  }

  private findByCode(code: string): LeaveRequestPersonRecord | undefined {
    const normalized = code.trim().toLowerCase()
    return this.people.find((person) => person.code.toLowerCase() === normalized)
  }
}

/**
 * 人工请假 AI 服务。
 *
 * @moduleKind manual-leave
 * @moduleName 人工请假
 * @moduleDescription 帮助员工收集、确认并提交人工请假申请。
 */
class LeaveRequestAiService {
  private readonly service: LeaveRequestService
  private readonly persons: PersonDirectory

  public constructor(options: LeaveRequestBusinessRegistrationOptions = {}) {
    this.service = new LeaveRequestService(options.now)
    this.persons = new PersonDirectory(options.persons ?? DEFAULT_LEAVE_REQUEST_PERSONS)
  }

  /**
   * 描述当前人工请假草稿状态。
   *
   * @moduleAction describeDraft
   * @usageRule 用户要求查看当前申请、确认已收集信息或不知道下一步时调用。
   */
  public describeDraft(ctx: AiModulePathContext): AiModuleResult<AiJsonValue> {
    return serviceResultToModuleResult(this.service.describeDraft(toServiceContext(ctx)))
  }

  /**
   * 把用户明确给出的请假信息写入当前草稿。
   *
   * @moduleAction setDraftFields
   * @usageRule 只写入用户明确表达的字段；缺少请假人、日期、原因或审批人时先追问确认。
   * @usageRule 日期使用 YYYY-MM-DD；用户给相对日期时必须基于系统提示中的当前日期换算。
   * @failureMode INVALID_FIELDS fields 不是对象 => 把字段放在 fields 对象中。
   */
  public setDraftFields(
    ctx: AiModulePathContext,
    args: Readonly<{ fields: Record<string, unknown> }>,
  ): AiModuleResult<AiJsonValue> {
    return serviceResultToModuleResult(this.service.setDraftFields(toServiceContext(ctx), args.fields))
  }

  /**
   * 提交当前人工请假申请。
   *
   * @moduleAction submitDraft
   * @usageRule 只有用户明确表示提交或确认信息完整时调用。
   * @failureMode MISSING_REQUIRED_FIELDS 提交前缺少必填字段 => 追问缺失字段后再提交。
   */
  public submitDraft(ctx: AiModulePathContext): AiModuleResult<AiJsonValue> {
    return serviceResultToModuleResult(this.service.submitDraft(toServiceContext(ctx)))
  }

  /**
   * 取消当前未提交的人工请假草稿。
   *
   * @moduleAction cancelDraft
   * @usageRule 只有用户明确表示取消当前请假流程时调用。
   */
  public cancelDraft(
    ctx: AiModulePathContext,
    args: Readonly<{ reason?: string }>,
  ): AiModuleResult<AiJsonValue> {
    return serviceResultToModuleResult(this.service.cancelDraft(toServiceContext(ctx), args.reason))
  }

  /**
   * 获取人员目录 API 对象。
   *
   * @moduleAction listPersons
   * @usageRule 填写 applicantCode 或 approverCode 前，先调用本函数获取人员目录 handle，再调用 searchPersons/getPerson。
   */
  public listPersons(): AiModuleResult<PersonDirectory> {
    return AiModuleResult.ok(this.persons)
  }

  public getDraft(leaveDraftId: string): LeaveRequestDraftState {
    return this.service.getDraft(leaveDraftId)
  }

  public releaseDraft(leaveDraftId: string): void {
    this.service.releaseDraft(leaveDraftId)
  }
}

const LEAVE_REQUEST_METADATA: AiModuleMetadataJson = {
  schemaVersion: 1,
  rootApi: {
    kind: LEAVE_REQUEST_KIND,
    name: '人工请假',
    description: '帮助员工收集、确认并提交人工请假申请。',
    actions: [
      {
        name: 'describeDraft',
        methodName: 'describeDraft',
        description: '读取当前人工请假草稿状态、已填写字段和仍缺少的提交字段。',
        paramsSchema: NO_PARAMS,
        usageRules: ['用户要求查看当前申请、确认已收集信息或不知道下一步时调用。'],
      },
      {
        name: 'setDraftFields',
        methodName: 'setDraftFields',
        description: '把用户明确给出的请假信息写入当前草稿。',
        paramsSchema: SET_DRAFT_FIELDS_SCHEMA,
        usageRules: [
          '只写入用户明确表达的字段；缺少请假人、日期、原因或审批人时先追问确认。',
          '日期使用 YYYY-MM-DD；用户给相对日期时必须基于系统提示中的当前日期换算。',
          '填写 applicantCode 或 approverCode 前，先调用 listPersons 获取人员目录 handle。',
        ],
        failureModes: [
          { code: 'INVALID_FIELDS', when: 'fields 不是对象', fix: '把字段放在 fields 对象中。' },
          { code: 'INVALID_DATE_RANGE', when: '结束日期早于开始日期', fix: '向用户确认日期范围。' },
          { code: 'DRAFT_NOT_EDITABLE', when: '草稿已提交或取消', fix: '创建新草稿或停止修改。' },
        ],
      },
      {
        name: 'submitDraft',
        methodName: 'submitDraft',
        description: '提交当前人工请假申请。提交前会校验必填字段和日期范围。',
        paramsSchema: NO_PARAMS,
        usageRules: ['只有用户明确表示提交或确认信息完整时调用。'],
        failureModes: [
          { code: 'MISSING_REQUIRED_FIELDS', when: '提交前缺少必填字段', fix: '追问缺失字段后再提交。' },
          { code: 'DRAFT_ALREADY_SUBMITTED', when: '草稿已提交', fix: '提示用户当前草稿已提交。' },
          { code: 'DRAFT_CANCELLED', when: '草稿已取消', fix: '创建新的请假草稿。' },
        ],
      },
      {
        name: 'cancelDraft',
        methodName: 'cancelDraft',
        description: '取消当前未提交的人工请假草稿。',
        paramsSchema: CANCEL_DRAFT_SCHEMA,
        usageRules: ['只有用户明确表示取消当前请假流程时调用。'],
        failureModes: [
          { code: 'DRAFT_ALREADY_SUBMITTED', when: '申请已提交', fix: '提示用户当前申请已提交，引导用户走审批撤回流程。' },
        ],
      },
      {
        name: 'listPersons',
        methodName: 'listPersons',
        description: '获取人员目录 API 对象。',
        paramsSchema: NO_PARAMS,
        usageRules: ['填写 applicantCode 或 approverCode 前调用。'],
        resultApis: [{
          resultPath: [],
          api: {
            kind: 'person-directory',
            name: '人员目录',
            description: '请假人员和审批人查询。',
            actions: [
              {
                name: 'searchPersons',
                methodName: 'searchPersons',
                description: '按条件搜索人员。',
                paramsSchema: objectSchema({
                  keyword: stringSchema('人员姓名、编码、部门或角色关键字。'),
                  role: stringSchema('人员角色，例如 employee 或 approver。'),
                  department: stringSchema('部门关键字。'),
                }),
              },
              {
                name: 'getPerson',
                methodName: 'getPerson',
                description: '按编码获取人员详情。',
                paramsSchema: objectSchema({
                  code: stringSchema('人员编码。'),
                }, { required: ['code'] }),
              },
            ],
          },
        }],
      },
    ],
  },
}

export function createLeaveRequestBusinessRegistration(
  options: LeaveRequestBusinessRegistrationOptions = {},
): AiAgentRegistration {
  const service = new LeaveRequestAiService(options)
  return AiModuleAdapter.createRegistration({
    moduleClass: LeaveRequestAiService,
    metadata: LEAVE_REQUEST_METADATA,
    options: {
      moduleId: LEAVE_REQUEST_MODULE_ID,
      instance: service,
      sessionStore: new DefaultAiAgentSessionStore(options.now === undefined ? {} : { now: options.now }),
      onStartSession: (instance, context) => {
        instance.getDraft(context.moduleInstanceId)
      },
      systemPrompt: () => createLeaveRequestSystemPrompt(new Date((options.now ?? Date.now)())),
      afterFunctionCall: (_instance, call) => {
        const actionName = readBusinessFunctionName(call.toolName, call.args)
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
      releaseModuleInstance: (instance, moduleInstanceId) => {
        instance.releaseDraft(moduleInstanceId)
      },
    },
  })
}

export function createLeaveRequestDraftId(now = Date.now): string {
  const randomId = typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${now()}-${Math.random().toString(36).slice(2, 10)}`
  return `leaveDraft:${randomId}`
}

function serviceResultToModuleResult(result: LeaveRequestServiceResult<unknown>): AiModuleResult<AiJsonValue> {
  if (result.ok) {
    return AiModuleResult.ok(coerceJsonValue(result.data) ?? null)
  }
  return AiModuleResult.failCode(result.code, result.msg, result.fix)
}

function personMatchesQuery(
  person: LeaveRequestPersonRecord,
  query: Readonly<Record<string, unknown>>,
): boolean {
  const keyword = readQueryText(query, 'keyword')
  const role = readQueryText(query, 'role')
  const department = readQueryText(query, 'department')
  if (role !== undefined && !sameText(person.role, role)) return false
  if (department !== undefined && !includesText(person.department, department)) return false
  if (keyword !== undefined) {
    return [person.code, person.name, person.department, person.role]
      .some((value) => includesText(value, keyword))
  }
  return true
}

function personToJson(person: LeaveRequestPersonRecord): AiJsonValue {
  return {
    code: person.code,
    name: person.name,
    department: person.department,
    role: person.role,
  }
}

function readQueryText(query: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = query[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function sameText(value: string, query: string): boolean {
  return value.trim().toLowerCase() === query.trim().toLowerCase()
}

function includesText(value: string, query: string): boolean {
  return value.trim().toLowerCase().includes(query.trim().toLowerCase())
}

function toServiceContext(ctx: AiModulePathContext | AiAgentRuntimeContext): LeaveRequestServiceContext {
  if ('host' in ctx || 'segments' in ctx) {
    const pathCtx = ctx
    return {
      requestId: pathCtx.host?.instanceId ?? pathCtx.segment?.id ?? '',
      leaveDraftId: pathCtx.host?.moduleInstanceId ?? pathCtx.segment?.id ?? '',
    }
  }
  return {
    requestId: ctx.instanceId,
    leaveDraftId: ctx.moduleInstanceId,
  }
}

function readBusinessFunctionName(
  toolName: string,
  args: Readonly<Record<string, AiJsonValue>>,
): string | null {
  if (toolName === 'module_call' && typeof args['functionName'] === 'string') {
    return args['functionName']
  }
  if (['describeDraft', 'setDraftFields', 'submitDraft', 'cancelDraft', 'listPersons'].includes(toolName)) {
    return toolName
  }
  return null
}

function submittedLeaveMessage(result: AiAgentFunctionCallResult<unknown>): string {
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
    '- 人员编码来源：先调用 listPersons 获取人员目录 handle，再通过 module_handle_call 调用 searchPersons/getPerson 查询人员。',
    '- 填写 applicantCode 或 approverCode 时，把 getPerson 返回的 code 写入草稿字段。',
    '处理"今天/明天/后天/下周一"等相对日期时，必须基于当前日期换算；无法唯一确定时先 human_question，再追问用户；日期来源只使用当前运行时上下文和用户确认。',
    '缺少请假人、类型、起止日期、天数、事由或提交确认时，先用 human_question 生成反问指南，再用自然语言向用户补问。',
  ].join('\n')
}

function getRuntimeTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'
  } catch {
    // Intl API 在当前运行时不可用，回退到 'local'
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
    // formatToParts 失败时回退到 UTC 日期
  }
  return date.toISOString().slice(0, 10)
}
