/**
 * AI 函数调用执行器。
 *
 * 职责：执行翻译后的函数调用，包括：记录请求 → 调用方校验 → 运行 → 标准化结果 → 完成记录。
 *
 * 执行时序：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 1. executeFunctionCall(options)                              │
 * │    ├─ ① translator.translateFunctionCall() → 翻译             │
 * │    │   → action 字符串 → AiRuntimeFunctionCallTranslation     │
 * │    │   → 翻译失败：tryRecordFailedFunctionCall() → 返回 Failure│
 * │    ├─ ② 构建 runInput（translation + executionArgs + context） │
 * │    ├─ ③ sessions.recordFunctionCallRequest() → 记录请求        │
 * │    ├─ ④ validate?(runInput) → 调用方校验（可选）               │
 * │    │   → 校验失败：createFunctionCallFailure() → 完成记录      │
 * │    ├─ ⑤ run(runInput) → 执行业务函数                          │
 * │    ├─ ⑥ normalizeResult / normalizeFunctionCallResult → 标准化│
 * │    └─ ⑦ completeFunctionCall() → 完成记录（写入历史）          │
 * │                                                               │
 * │ 2. createFunctionResultMessage(options)                      │
 * │    → 序列化结果为字符串，创建 AiRuntimeFunctionResultMessage   │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 错误处理策略：
 * - 翻译失败：静默记录到 session history（可能因为 session 不存在，所以 try/catch）
 * - 校验失败：返回 INVALID_ARGS，完成记录标记为 failed
 * - 执行异常：捕获错误，返回 EXECUTE_ERROR，完成记录标记为 failed
 * - 所有路径都会调用 completeFunctionCall() 确保历史记录完整
 */

import type {
  AiRuntimeCreateFunctionResultMessageOptions,
  AiRuntimeExecuteFunctionCallOptions,
  AiRuntimeFunctionCallFailure,
  AiRuntimeFunctionCallResult,
  AiRuntimeFunctionCallTranslation,
  AiRuntimeFunctionCallRunInput,
  AiRuntimeFunctionResultMessage,
} from '../../protocol/runtime-contracts'
import { AiInvocationProtocol } from '../invocation-helpers'
import type { AiSessionLedger } from './ai-session-ledger'
import type { AiFunctionCallTranslator } from './ai-function-call-translator'
import {
  createFunctionCallFailure,
  normalizeFunctionCallResult,
  stringifyFunctionResult,
} from './runtime-utils'

export class AiFunctionCallExecutor {
  constructor(
    private readonly sessions: AiSessionLedger,
    private readonly translator: AiFunctionCallTranslator,
  ) {}

  // ═══════════════════════════════════════════════════════
  // 消息创建
  // ═══════════════════════════════════════════════════════

  /**
   * 创建函数结果消息。
   * 将函数执行结果序列化为字符串，用于追加到会话历史或展示给 LLM。
   *
   * 返回值包含：
   * - action: 原始 action 字符串
   * - result: 执行结果（成功或失败）
   * - content: 序列化后的字符串（用于传输或展示）
   */
  createFunctionResultMessage(options: AiRuntimeCreateFunctionResultMessageOptions): AiRuntimeFunctionResultMessage {
    return {
      action: options.action,
      result: options.result,
      content: stringifyFunctionResult(options.result),
    }
  }

  // ═══════════════════════════════════════════════════════
  // 主执行流程
  // ═══════════════════════════════════════════════════════

  /**
   * 执行函数调用。
   *
   * 完整流程（6 个步骤）：
   *
   * 步骤 1 - 翻译：将 action 字符串翻译为可执行的翻译结果
   *   - 成功：获得 AiRuntimeFunctionCallTranslation（包含上下文、曝光、参数）
   *   - 失败：记录失败到 session → 返回 FunctionCallFailure
   *
   * 步骤 2 - 构建运行输入：从翻译结果中提取 executionArgs 和上下文
   *   - 记录函数调用请求到 session ledger（生成 historyEntryId）
   *
   * 步骤 3 - 调用方校验（可选）：执行调用方传入的 validate 函数
   *   - 失败：返回 INVALID_ARGS，完成记录标记为 failed
   *
   * 步骤 4 - 执行函数：调用调用方传入的 run 函数
   *   - 可能抛出异常，在 catch 中处理
   *
   * 步骤 5 - 结果标准化：优先使用调用方 normalizeResult，否则使用默认标准化
   *   - normalizeFunctionCallResult() 将原始值包装为 AiRuntimeFunctionCallResult
   *
   * 步骤 6 - 完成记录：将结果写入 session ledger，更新历史记录状态
   */
  async executeFunctionCall(options: AiRuntimeExecuteFunctionCallOptions): Promise<AiRuntimeFunctionCallResult<unknown>> {
    // 步骤 1：翻译 action → 可执行上下文
    const translated = await this.translator.translateFunctionCall(options)
    if (!translated.ok) {
      // 翻译失败：尝试记录到 session history（可能因为 session 不存在而静默失败）
      this.tryRecordFailedFunctionCall(options, translated)
      return translated
    }

    const translation = translated.translation

    // 步骤 2：构建运行输入并记录请求到 session ledger
    const runInput: AiRuntimeFunctionCallRunInput = {
      translation,
      moduleRegistration: translation.moduleRegistration,
      functionRegistration: translation.functionRegistration,
      args: translation.executionArgs,
      context: translation.context,
    }
    const requestEntry = this.sessions.recordFunctionCallRequest({
      instanceId: translation.context.instanceId,
      moduleId: translation.context.moduleId,
      moduleInstanceId: translation.context.moduleInstanceId,
      runtimeInstanceId: translation.context.runtimeInstanceId,
      action: translation.action,
      args: translation.rawArgs,
      modulePath: translation.context.modulePath,
      functionId: translation.context.functionId,
      activePath: translation.context.activePath,
    })

    // 步骤 3：调用方校验（可选）
    const validationError = options.validate?.(runInput) ?? null
    if (validationError !== null) {
      const failed = createFunctionCallFailure('INVALID_ARGS', validationError, `Fix args for ${translation.action} before retrying.`)
      this.completeTranslatedFunctionCall(translation, failed, requestEntry.id)
      return failed
    }

    // 步骤 4 & 5：执行函数 → 标准化结果
    try {
      const rawResult = await options.run(runInput)
      const result = options.normalizeResult?.(rawResult, runInput)
        ?? normalizeFunctionCallResult(rawResult, translation.action)
      this.completeTranslatedFunctionCall(translation, result, requestEntry.id)
      return result
    } catch (error) {
      const failed = createFunctionCallFailure(
        'EXECUTE_ERROR',
        AiInvocationProtocol.toErrorMessage(error),
        options.errorFix ?? `Fix ${translation.action} implementation or retry with valid args after checking runtime state.`,
      )
      this.completeTranslatedFunctionCall(translation, failed, requestEntry.id)
      return failed
    }
  }

  // ═══════════════════════════════════════════════════════
  // 内部辅助
  // ═══════════════════════════════════════════════════════

  /**
   * 尝试记录翻译失败的函数调用。
   *
   * 翻译失败可能正是因为 session 不存在或已停止，
   * 此时不能再写入 session history，所以用 try/catch 静默处理。
   * 如果 session 可用，则将失败状态追加到历史记录中。
   */
  private tryRecordFailedFunctionCall(options: AiRuntimeExecuteFunctionCallOptions, error: AiRuntimeFunctionCallFailure): void {
    try {
      this.sessions.appendFunctionCall({
        instanceId: options.instanceId,
        moduleId: options.moduleId,
        moduleInstanceId: options.moduleInstanceId,
        runtimeInstanceId: options.runtimeInstanceId,
        action: options.action,
        args: options.args,
        status: 'failed',
        error,
      })
    } catch {
      // 翻译失败可能正是因为 session 不存在或已停止，此时不能再写入 session history。
    }
  }

  /**
   * 完成翻译后的函数调用记录。
   *
   * 流程：
   * 1. 创建函数结果消息（序列化结果为字符串）
   * 2. 调用 sessions.completeFunctionCall() 更新历史记录状态
   *    - 成功：status = 'completed'
   *    - 失败：status = 'failed'，携带 error 字段
   *
   * 此方法确保每次函数调用（无论成功失败）都在 session ledger 中有完整的生命周期记录。
   */
  private completeTranslatedFunctionCall(
    translation: AiRuntimeFunctionCallTranslation,
    result: AiRuntimeFunctionCallResult<unknown>,
    historyEntryId: string,
  ): void {
    const resultMessage = this.createFunctionResultMessage({
      action: translation.action,
      result,
    })
    this.sessions.completeFunctionCall({
      instanceId: translation.context.instanceId,
      moduleId: translation.context.moduleId,
      moduleInstanceId: translation.context.moduleInstanceId,
      runtimeInstanceId: translation.context.runtimeInstanceId,
      historyEntryId,
      status: result.ok ? 'completed' : 'failed',
      result,
      resultMessage,
      ...(!result.ok ? { error: result } : {}),
    })
  }
}
