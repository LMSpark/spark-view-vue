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

/**
 * 基于模块的业务运行时抽象基类。
 *
 * LeaveRequestBusinessRuntime 和 PageDesignBusinessRuntime 有大量重复委托代码——
 * startSession、appendMessage、executeFunctionCall、endBusinessInstance、
 * getSessionHistory、releaseModuleInstance 都是把调用者的 options 注入
 * moduleId 后委托给内部模块。
 *
 * 提取此基类后，子类只需覆盖：
 * - moduleId — 业务模块标识
 * - resolveBusinessInstance — 实例解析逻辑（各业务不同）
 * - afterFunctionCall — 函数调用后的业务特有回调
 * - getSystemPrompt / canReuseSelection — 可选覆盖
 */
abstract class ModuleBackedBusinessRuntime implements AppAiBusinessRuntime {
  /** 业务模块 ID */
  abstract readonly moduleId: string

  /**
   * 内部持有的业务模块实例，所有操作委托给它。
   * 用 object 类型而非具体接口，避免两个模块 context 类型的协变冲突；
   * 子类通过 override 声明为具体模块类型。
   */
  protected module: object

  constructor(
    module: object,
    /** 实例 ID 解析函数，返回 null 表示无法解析 */
    protected readonly resolveInstanceId: (input: AppAiBusinessResolveInput) => string | null,
  ) {
    this.module = module
  }

  /** 解析业务实例 ID — 各业务实现不同，必须由子类提供 */
  abstract resolveBusinessInstance(input: AppAiBusinessResolveInput): string

  /** 注册数据（子类可覆盖，默认委托） */
  getRegistrationData(): AiModuleRegistrationData {
    return (this.module as { getRegistrationData(): AiModuleRegistrationData }).getRegistrationData()
  }

  /** 业务注册数据（子类可覆盖，默认委托） */
  getBusinessRegistrationData(): AiBusinessRegistrationData {
    return (this.module as { getBusinessRegistrationData(): AiBusinessRegistrationData }).getBusinessRegistrationData()
  }

  /** 开始 AI 会话 — 注入 moduleId 后委托给内部模块 */
  startSession(context: AppAiBusinessRuntimeContext): Promise<AiRuntimeStartSessionResult> {
    return (this.module as { startSession(o: Record<string, unknown>): Promise<AiRuntimeStartSessionResult> })
      .startSession({ ...context, moduleId: this.moduleId })
  }

  /** 追加消息到会话 — 注入 moduleId 后委托给内部模块 */
  appendMessage(options: AppAiBusinessAppendMessageOptions): AiRuntimeMessageHistoryEntry {
    return (this.module as { appendMessage(o: Record<string, unknown>): AiRuntimeMessageHistoryEntry })
      .appendMessage({ ...options, moduleId: this.moduleId })
  }

  /** 执行函数调用 — 注入 moduleId 后委托给内部模块 */
  executeFunctionCall(options: AppAiBusinessExecuteFunctionCallOptions): Promise<AiRuntimeFunctionCallResult<unknown>> {
    return (this.module as { executeFunctionCall(o: Record<string, unknown>): Promise<AiRuntimeFunctionCallResult<unknown>> })
      .executeFunctionCall({ ...options, moduleId: this.moduleId })
  }

  /** 函数调用后的生命周期指令 — 子类可覆盖，默认继续 */
  afterFunctionCall(_options: AppAiBusinessAfterFunctionCallOptions): AppAiBusinessLifecycleDirective {
    return { status: 'continue' }
  }

  /** 结束业务实例 — 注入 moduleId 后停止会话并可选释放实例 */
  endBusinessInstance(context: AppAiBusinessRuntimeContext, directive: AppAiBusinessLifecycleDirective): void {
    ;(this.module as { stopSession(o: Record<string, unknown>): void }).stopSession({
      ...context,
      moduleId: this.moduleId,
      reason: directive.reason ?? directive.status,
    })
    if (directive.releaseInstance === true) {
      ;(this.module as { releaseModuleInstance(id: string): void }).releaseModuleInstance(context.moduleInstanceId)
    }
  }

  /** 获取会话历史 — 注入 moduleId 后委托给内部模块 */
  getSessionHistory(context: AppAiBusinessRuntimeContext): readonly AiRuntimeHistoryEntry[] {
    return (this.module as { getSessionHistory(o: Record<string, unknown>): readonly AiRuntimeHistoryEntry[] })
      .getSessionHistory({ ...context, moduleId: this.moduleId })
  }

  /** 释放模块实例 — 委托给内部模块 */
  releaseModuleInstance(moduleInstanceId: string): void {
    ;(this.module as { releaseModuleInstance(id: string): void }).releaseModuleInstance(moduleInstanceId)
  }

  /** 获取系统提示词（可选覆盖，默认无） */
  getSystemPrompt?(_context: AppAiBusinessRuntimeContext): string | undefined
}

/**
 * 人工请假业务运行时。
 *
 * 差异点：
 * - 需要自定义系统提示词（含时区和当前日期，LLM 据此解析相对日期）
 * - submitDraft / cancelDraft 后自动结束会话并释放实例
 * - 实例 ID 解析不会失败（始终通过 resolveLeaveDraftId 生成新 draftId）
 */
class LeaveRequestBusinessRuntime extends ModuleBackedBusinessRuntime {
  override readonly moduleId = LEAVE_REQUEST_MODULE_ID

  /** LeaveRequest 业务模块实例，持有草稿状态和 AI 运行时 */
  declare protected readonly module: LeaveRequestModule

  // eslint-disable-next-line @typescript-eslint/no-useless-constructor -- constructor narrows parameter types
  constructor(module: LeaveRequestModule, resolveInstanceId: (input: AppAiBusinessResolveInput) => string | null) {
    super(module, resolveInstanceId)
  }

  override resolveBusinessInstance(input: AppAiBusinessResolveInput): string {
    const id = this.resolveInstanceId(input)
    if (id === null) throw new Error('LeaveRequest instance id resolver returned null')
    return id
  }

  override getSystemPrompt(_context: AppAiBusinessRuntimeContext): string {
    return createLeaveRequestSystemPrompt()
  }

  override afterFunctionCall(options: AppAiBusinessAfterFunctionCallOptions): AppAiBusinessLifecycleDirective {
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
}

/**
 * 页面设计业务运行时。
 *
 * 差异点：
 * - 实例 ID 解析依赖当前选中的页面，未选中时抛错
 * - 支持 canReuseSelection（用户切换页面时可复用当前会话）
 * - EditHost 不可用时自动结束会话
 */
class PageDesignBusinessRuntime extends ModuleBackedBusinessRuntime {
  override readonly moduleId = PAGE_DESIGN_MODULE_ID

  // eslint-disable-next-line @typescript-eslint/no-useless-constructor -- constructor narrows parameter types
  constructor(module: PageDesignModule, resolveInstanceId: (input: AppAiBusinessResolveInput) => string | null) {
    super(module, resolveInstanceId)
  }

  override resolveBusinessInstance(input: AppAiBusinessResolveInput): string {
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

  override afterFunctionCall(options: AppAiBusinessAfterFunctionCallOptions): AppAiBusinessLifecycleDirective {
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
