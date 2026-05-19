/**
 * App 层 AI 业务注册。
 *
 * 把 LeaveRequest 和 PageDesign 模块包装为 AiHostBusinessRuntime，
 * 并注册到 AiHostBusinessRegistry。
 */

import {
  AiInvocationProtocol,
  LeaveRequestModule,
  PageDesignModule,
  type AiModuleRegistrationData,
  type AiRuntimeFunctionCallResult,
  type AiRuntimeHistoryEntry,
  type AiRuntimeMessageHistoryEntry,
  type AiRuntimeSessionRecord,
  type AiRuntimeStartSessionResult,
} from '../index'
import type {
  AiHostBusinessRuntime,
  AiHostBusinessRuntimeContext,
} from '../core/host'
import type {
  AiHostBusinessRegistry,
} from '../core/host'
import type { PageDesignEditHost } from '@spark-view/spark-page-config'

export interface RegisterAppAiBusinessesOptions {
  readonly registry: AiHostBusinessRegistry
  readonly getPageDesignEditHost?: (context: AiHostBusinessRuntimeContext) => PageDesignEditHost
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
    '处理"今天/明天/后天/下周一"等相对日期时，必须基于当前日期换算；无法唯一确定时先追问，不要假设或使用训练样本中的日期。',
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
 * 提取此基类后，子类只需覆盖 moduleId、afterFunctionCall 或 getSystemPrompt。
 */
abstract class ModuleBackedBusinessRuntime implements AiHostBusinessRuntime {
  /** 业务模块 ID */
  abstract readonly moduleId: string

  /**
   * 内部持有的业务模块实例，所有操作委托给它。
   * 用 object 类型而非具体接口，避免两个模块 context 类型的协变冲突；
   * 子类通过 override 声明为具体模块类型。
   */
  protected module: object

  constructor(module: object) {
    this.module = module
  }

  /** 注册数据（子类可覆盖，默认委托） */
  getRegistrationData(): AiModuleRegistrationData {
    return (this.module as { getRegistrationData(): AiModuleRegistrationData }).getRegistrationData()
  }

  /** 业务注册数据（子类可覆盖，默认委托） */

  /** 开始 AI 会话 — 注入 moduleId 后委托给内部模块 */
  startSession(context: AiHostBusinessRuntimeContext): Promise<AiRuntimeStartSessionResult> {
    return (this.module as { startSession(o: Record<string, unknown>): Promise<AiRuntimeStartSessionResult> })
      .startSession({ ...context, moduleId: this.moduleId })
  }

  /** 追加消息到会话 — 注入 moduleId 后委托给内部模块 */
  appendMessage(options: AiHostBusinessRuntimeContext & { role: 'system' | 'user' | 'assistant'; content: string; source?: 'system' | 'ui' | 'llm'; metadata?: Record<string, unknown> }): AiRuntimeMessageHistoryEntry {
    return (this.module as { appendMessage(o: Record<string, unknown>): AiRuntimeMessageHistoryEntry })
      .appendMessage({ ...options, moduleId: this.moduleId })
  }

  /** 读取 core session ledger 中的当前业务实例会话。 */
  getSession(context: AiHostBusinessRuntimeContext): AiRuntimeSessionRecord | null {
    return (this.module as { getSession(o: Record<string, unknown>): AiRuntimeSessionRecord | null })
      .getSession({ ...context, moduleId: this.moduleId })
  }

  /** 枚举 core session ledger。面板监视器只从这里读取会话事实源。 */
  listSessions(): readonly AiRuntimeSessionRecord[] {
    return (this.module as { listSessions(): readonly AiRuntimeSessionRecord[] }).listSessions()
  }

  /** 执行函数调用 — 注入 moduleId 后委托给内部模块 */
  executeFunctionCall(options: AiHostBusinessRuntimeContext & { action: string; args: unknown; projection?: unknown }): Promise<AiRuntimeFunctionCallResult<unknown>> {
    return (this.module as { executeFunctionCall(o: Record<string, unknown>): Promise<AiRuntimeFunctionCallResult<unknown>> })
      .executeFunctionCall({ ...options, moduleId: this.moduleId })
  }

  /** 函数调用后的生命周期指令 — 子类可覆盖，默认继续 */
  afterFunctionCall(_options: AiHostBusinessRuntimeContext & { action: string; args: unknown; result: AiRuntimeFunctionCallResult<unknown> }): { status: 'continue' | 'complete' | 'abort'; reason?: string; finalAssistantMessage?: string; releaseInstance?: boolean } {
    return { status: 'continue' }
  }

  /** 结束业务实例 — 注入 moduleId 后停止会话并可选释放实例 */
  endBusinessInstance(context: AiHostBusinessRuntimeContext, directive: { status: 'continue' | 'complete' | 'abort'; reason?: string; finalAssistantMessage?: string; releaseInstance?: boolean }): void {
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
  getSessionHistory(context: AiHostBusinessRuntimeContext): readonly AiRuntimeHistoryEntry[] {
    return (this.module as { getSessionHistory(o: Record<string, unknown>): readonly AiRuntimeHistoryEntry[] })
      .getSessionHistory({ ...context, moduleId: this.moduleId })
  }

  /** 释放模块实例 — 委托给内部模块 */
  releaseModuleInstance(moduleInstanceId: string): void {
    ;(this.module as { releaseModuleInstance(id: string): void }).releaseModuleInstance(moduleInstanceId)
  }

  /** 获取系统提示词（可选覆盖，默认无） */
  getSystemPrompt?(_context: AiHostBusinessRuntimeContext): string | undefined
}

/**
 * 人工请假业务运行时。
 *
 * 差异点：
 * - 需要自定义系统提示词（含时区和当前日期，LLM 据此解析相对日期）
 * - submitDraft / cancelDraft 后自动结束会话并释放实例
 * - 业务实例 ID 必须由按钮/API 在打开面板前显式传入
 */
class LeaveRequestBusinessRuntime extends ModuleBackedBusinessRuntime {
  override readonly moduleId = LeaveRequestModule.moduleId

  /** LeaveRequest 业务模块实例，持有草稿状态和 AI 运行时 */
  declare protected readonly module: LeaveRequestModule

  override getSystemPrompt(_context: AiHostBusinessRuntimeContext): string {
    return createLeaveRequestSystemPrompt()
  }

  override afterFunctionCall(options: AiHostBusinessRuntimeContext & { action: string; args: unknown; result: AiRuntimeFunctionCallResult<unknown> }): { status: 'continue' | 'complete' | 'abort'; reason?: string; finalAssistantMessage?: string; releaseInstance?: boolean } {
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
 * - 实例 ID 来自业务按钮解析出的当前页面 ID
 * - EditHost 不可用时自动结束会话
 */
class PageDesignBusinessRuntime extends ModuleBackedBusinessRuntime {
  override readonly moduleId = PageDesignModule.moduleId

  override afterFunctionCall(options: AiHostBusinessRuntimeContext & { action: string; args: unknown; result: AiRuntimeFunctionCallResult<unknown> }): { status: 'continue' | 'complete' | 'abort'; reason?: string; finalAssistantMessage?: string; releaseInstance?: boolean } {
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
  options.registry.register(new LeaveRequestBusinessRuntime(leaveModule))

  if (options.getPageDesignEditHost === undefined) return

  const pageDesignModule = new PageDesignModule({
    getEditToolHost: (context) => options.getPageDesignEditHost?.(context) ?? missingPageDesignEditHost(),
  })
  options.registry.register(new PageDesignBusinessRuntime(pageDesignModule))
}

function missingPageDesignEditHost(): never {
  throw new Error('PageDesign edit host is not registered')
}
