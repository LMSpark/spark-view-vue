/**
 * 人工请假 module-semantic 业务注册。
 *
 * Host 业务 ID 保持 manualLeave；语义协议内只暴露一个 kind: manual-leave。
 */

import {
  DefaultAiHostSessionStore,
  type AiHostBusinessRegistration,
  type AiHostBusinessRuntimeContext,
  type AiHostFunctionCallResult,
} from '@spark-view/spark-ai/host'
import {
  ModuleKind,
  ModuleSemanticRuntime,
  ok,
  type ActionSchema,
  type ModuleInstanceFinder,
  type ModuleInstanceRef,
  type ModuleKindRunner,
  type ModulePathContext,
} from '@spark-view/spark-ai/module-semantic'
import type {
  LlmJsonSchema,
  LlmJsonValue,
  LlmParameterSchemaRoot,
} from '@spark-view/spark-ai/schema'
import {
  LeaveRequestService,
  type LeaveRequestServiceContext,
} from './leave-request-service'
import { serviceResultToOperationResult } from '../module-semantic-service-result'

export const LEAVE_REQUEST_MODULE_ID = 'manualLeave'
export const LEAVE_REQUEST_KIND = 'manual-leave'

export interface LeaveRequestBusinessRegistrationOptions {
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

export const LEAVE_REQUEST_ACTIONS: readonly ActionSchema[] = [
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

/**
 * @moduleKind manual-leave
 * @moduleFactory createLeaveRequestModuleKind
 * @moduleRunner createLeaveRequestRunnerDelegate
 * @moduleFindDelegate findCurrentLeaveRequestInstance
 */
function createLeaveRequestModuleKind(service: LeaveRequestService): ModuleKind {
  return new ModuleKind({
    kind: LEAVE_REQUEST_KIND,
    name: '人工请假',
    description: '帮助员工收集、确认并提交人工请假申请。',
    actions: LEAVE_REQUEST_ACTIONS,
    children: [],
    runner: createLeaveRequestRunnerDelegate(service),
    find: findCurrentLeaveRequestInstance,
  })
}

function createLeaveRequestRunnerDelegate(service: LeaveRequestService): ModuleKindRunner {
  return (ctx, actionName, args) => runLeaveRequestAction(service, ctx, actionName, args)
}

const findCurrentLeaveRequestInstance: ModuleInstanceFinder = (ctx, childKind, query) => {
  void query
  if (childKind !== LEAVE_REQUEST_KIND || ctx.segments.length !== 0) {
    return ok<readonly ModuleInstanceRef[]>([])
  }
  const ref = createCurrentLeaveRequestRef(ctx)
  return ok<readonly ModuleInstanceRef[]>(ref === null ? [] : [ref])
}

function createCurrentLeaveRequestRef(ctx: ModulePathContext): ModuleInstanceRef | null {
  const leaveDraftId = ctx.host?.moduleInstanceId
  if (leaveDraftId === undefined || leaveDraftId.length === 0) {
    return null
  }
  return { id: leaveDraftId, label: '当前请假草稿', summary: '当前人工请假业务实例' }
}

function runLeaveRequestAction(
  service: LeaveRequestService,
  ctx: ModulePathContext,
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
) {
  switch (actionName) {
    case 'describeDraft':
      return serviceResultToOperationResult(service.describeDraft(toServiceContext(ctx)))
    case 'setDraftFields':
      return serviceResultToOperationResult(service.setDraftFields(toServiceContext(ctx), args['fields']))
    case 'submitDraft':
      return serviceResultToOperationResult(service.submitDraft(toServiceContext(ctx)))
    case 'cancelDraft':
      return serviceResultToOperationResult(
        service.cancelDraft(toServiceContext(ctx), typeof args['reason'] === 'string' ? args['reason'] : undefined),
      )
    default:
      throw new Error(`manual-leave action runner is not registered: ${actionName}`)
  }
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

function toServiceContext(ctx: ModulePathContext | AiHostBusinessRuntimeContext): LeaveRequestServiceContext {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type {
  LeaveRequestDraftFields,
  LeaveRequestDraftState,
  LeaveRequestDraftStatus,
  LeaveRequestServiceResult,
} from './leave-request-service'
