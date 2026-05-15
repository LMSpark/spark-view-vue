import {
  AiInvocationProtocol,
  LEAVE_REQUEST_MODULE_ID,
  LeaveRequestModule,
  PAGE_DESIGN_MODULE_ID,
  PageDesignModule,
  createLeaveDraftId,
  type AiBusinessRegistrationData,
  type AiModuleRegistrationData,
  type AiRuntimeFunctionCallResult,
  type AiRuntimeHistoryEntry,
  type AiRuntimeMessageHistoryEntry,
  type AiRuntimeStartSessionResult,
} from '@spark-view/spark-ai'
import type { PageDesignEditHost } from '@spark-view/spark-page-config'
import type { AppAiBusinessRegistry } from './business-registry'
import type {
  AppAiBusinessAfterFunctionCallOptions,
  AppAiBusinessAppendMessageOptions,
  AppAiBusinessExecuteFunctionCallOptions,
  AppAiBusinessLifecycleDirective,
  AppAiBusinessResolveInput,
  AppAiBusinessRuntime,
  AppAiBusinessRuntimeContext,
} from './types'

export interface RegisterAppAiBusinessesOptions {
  readonly registry: AppAiBusinessRegistry
  readonly resolveLeaveDraftId?: (input: AppAiBusinessResolveInput) => string
  readonly getPageDesignEditHost?: (input: AppAiBusinessRuntimeContext) => PageDesignEditHost
  readonly resolvePageDesignInstanceId?: (input: AppAiBusinessResolveInput) => string | null
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

function createLeaveRequestSystemPrompt(now = new Date()): string {
  const timeZone = getRuntimeTimeZone()
  const currentDate = formatDateInTimeZone(now, timeZone)
  return [
    '人工请假运行时上下文：',
    `- 当前日期：${currentDate}`,
    `- 当前 UTC 时间：${now.toISOString()}`,
    `- 当前时区：${timeZone}`,
    '处理“今天/明天/后天/下周一”等相对日期时，必须基于当前日期换算；无法唯一确定时先追问，不要假设或使用训练样本中的日期。',
  ].join('\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function actionFunctionId(action: string): string | null {
  return AiInvocationProtocol.tryParseActionPath(action)?.function ?? null
}

function leaveTypeLabel(value: unknown): string {
  if (value === 'annual') return '年假'
  if (value === 'sick') return '病假'
  if (value === 'personal') return '事假'
  if (value === 'other') return '其他'
  return typeof value === 'string' && value.trim().length > 0 ? value : '-'
}

function submittedLeaveMessage(result: AiRuntimeFunctionCallResult<unknown>): string {
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

function pageDesignEditHostUnavailableMessage(result: AiRuntimeFunctionCallResult<unknown>): string | null {
  if (result.ok || result.code !== 'EXECUTE_ERROR') return null
  const message = result.msg.trim()
  if (message === '') return null
  if (message.includes('PageDesign edit host unavailable')) return message
  if (message.includes('请先在开发系统中打开并选中目标配置页面')) return message
  return null
}

class LeaveRequestBusinessRuntime implements AppAiBusinessRuntime {
  readonly moduleId = LEAVE_REQUEST_MODULE_ID

  constructor(
    private readonly module: LeaveRequestModule,
    private readonly resolveInstanceId: (input: AppAiBusinessResolveInput) => string,
  ) {}

  getRegistrationData(): AiModuleRegistrationData {
    return this.module.getRegistrationData()
  }

  getBusinessRegistrationData(): AiBusinessRegistrationData {
    return this.module.getBusinessRegistrationData()
  }

  resolveBusinessInstance(input: AppAiBusinessResolveInput): string {
    return this.resolveInstanceId(input)
  }

  getSystemPrompt(_context: AppAiBusinessRuntimeContext): string {
    return createLeaveRequestSystemPrompt()
  }

  startSession(context: AppAiBusinessRuntimeContext): Promise<AiRuntimeStartSessionResult> {
    return this.module.startSession({ ...context, moduleId: LEAVE_REQUEST_MODULE_ID })
  }

  appendMessage(options: AppAiBusinessAppendMessageOptions): AiRuntimeMessageHistoryEntry {
    return this.module.appendMessage({ ...options, moduleId: LEAVE_REQUEST_MODULE_ID })
  }

  executeFunctionCall(options: AppAiBusinessExecuteFunctionCallOptions): Promise<AiRuntimeFunctionCallResult<unknown>> {
    return this.module.executeFunctionCall({ ...options, moduleId: LEAVE_REQUEST_MODULE_ID })
  }

  afterFunctionCall(options: AppAiBusinessAfterFunctionCallOptions): AppAiBusinessLifecycleDirective {
    const functionId = actionFunctionId(options.action)
    if (functionId === 'submitDraft' && options.result.ok) {
      return {
        status: 'complete',
        reason: 'leave request submitted',
        finalAssistantMessage: submittedLeaveMessage(options.result),
        releaseInstance: true,
      }
    }
    if (functionId === 'cancelDraft' && options.result.ok) {
      return {
        status: 'abort',
        reason: 'leave request cancelled',
        finalAssistantMessage: '当前请假草稿已取消。',
        releaseInstance: true,
      }
    }
    return { status: 'continue' }
  }

  endBusinessInstance(context: AppAiBusinessRuntimeContext, directive: AppAiBusinessLifecycleDirective): void {
    this.module.stopSession({
      ...context,
      moduleId: LEAVE_REQUEST_MODULE_ID,
      reason: directive.reason ?? directive.status,
    })
    if (directive.releaseInstance === true) {
      this.module.releaseModuleInstance(context.moduleInstanceId)
    }
  }

  getSessionHistory(context: AppAiBusinessRuntimeContext): readonly AiRuntimeHistoryEntry[] {
    return this.module.getSessionHistory({ ...context, moduleId: LEAVE_REQUEST_MODULE_ID })
  }

  releaseModuleInstance(moduleInstanceId: string): void {
    this.module.releaseModuleInstance(moduleInstanceId)
  }
}

class PageDesignBusinessRuntime implements AppAiBusinessRuntime {
  readonly moduleId = PAGE_DESIGN_MODULE_ID

  constructor(
    private readonly module: PageDesignModule,
    private readonly resolveInstanceId: (input: AppAiBusinessResolveInput) => string | null,
  ) {}

  getRegistrationData(): AiModuleRegistrationData {
    return this.module.getRegistrationData()
  }

  getBusinessRegistrationData(): AiBusinessRegistrationData {
    return this.module.getBusinessRegistrationData()
  }

  resolveBusinessInstance(input: AppAiBusinessResolveInput): string {
    const pageId = this.resolveInstanceId(input)
    if (pageId === null || pageId.trim() === '') {
      throw new Error('PageDesign 需要先在开发系统中打开并选中一个配置页面。')
    }
    return pageId
  }

  canReuseSelection(input: AppAiBusinessResolveInput, currentScope: { businessInstanceId: string }): boolean {
    try {
      const pageId = this.resolveInstanceId(input)
      return pageId !== null && pageId.trim() !== '' && pageId === currentScope.businessInstanceId
    } catch {
      return false
    }
  }

  async startSession(context: AppAiBusinessRuntimeContext): Promise<AiRuntimeStartSessionResult> {
    return this.module.startSession({ ...context, moduleId: PAGE_DESIGN_MODULE_ID })
  }

  appendMessage(options: AppAiBusinessAppendMessageOptions): AiRuntimeMessageHistoryEntry {
    return this.module.appendMessage({ ...options, moduleId: PAGE_DESIGN_MODULE_ID })
  }

  executeFunctionCall(options: AppAiBusinessExecuteFunctionCallOptions): Promise<AiRuntimeFunctionCallResult<unknown>> {
    return this.module.executeFunctionCall({
      ...options,
      moduleId: PAGE_DESIGN_MODULE_ID,
      projection: options.projection,
    })
  }

  afterFunctionCall(options: AppAiBusinessAfterFunctionCallOptions): AppAiBusinessLifecycleDirective {
    const unavailableMessage = pageDesignEditHostUnavailableMessage(options.result)
    if (unavailableMessage !== null) {
      return {
        status: 'abort',
        reason: 'page design edit host unavailable',
        finalAssistantMessage: unavailableMessage,
        releaseInstance: true,
      }
    }
    return { status: 'continue' }
  }

  endBusinessInstance(context: AppAiBusinessRuntimeContext, directive: AppAiBusinessLifecycleDirective): void {
    this.module.stopSession({
      ...context,
      moduleId: PAGE_DESIGN_MODULE_ID,
      reason: directive.reason ?? directive.status,
    })
    if (directive.releaseInstance === true) {
      this.module.releaseModuleInstance(context.moduleInstanceId)
    }
  }

  getSessionHistory(context: AppAiBusinessRuntimeContext): readonly AiRuntimeHistoryEntry[] {
    return this.module.getSessionHistory({ ...context, moduleId: PAGE_DESIGN_MODULE_ID })
  }

  releaseModuleInstance(moduleInstanceId: string): void {
    this.module.releaseModuleInstance(moduleInstanceId)
  }
}

export function registerAppAiBusinesses(options: RegisterAppAiBusinessesOptions): void {
  const leaveModule = new LeaveRequestModule()
  options.registry.register(new LeaveRequestBusinessRuntime(
    leaveModule,
    options.resolveLeaveDraftId ?? (() => createLeaveDraftId()),
  ))

  if (options.getPageDesignEditHost === undefined) return

  const pageDesignModule = new PageDesignModule({
    getEditToolHost: (context) => options.getPageDesignEditHost?.(context) ?? missingPageDesignEditHost(),
  })
  options.registry.register(new PageDesignBusinessRuntime(
    pageDesignModule,
    options.resolvePageDesignInstanceId ?? ((input) => input.context.pageId ?? null),
  ))
}

function missingPageDesignEditHost(): never {
  throw new Error('PageDesign edit host is not registered')
}
