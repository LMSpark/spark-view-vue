import type {
  AiRuntimeCreateFunctionResultMessageOptions,
  AiRuntimeExecuteFunctionCallOptions,
  AiRuntimeFunctionCallFailure,
  AiRuntimeFunctionCallResult,
  AiRuntimeFunctionCallTranslation,
  AiRuntimeFunctionCallRunInput,
  AiRuntimeFunctionResultMessage,
} from '../../protocol/runtime-contracts'
import { AiInvocationProtocol } from '../../protocol/invocation-helpers'
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

  createFunctionResultMessage(options: AiRuntimeCreateFunctionResultMessageOptions): AiRuntimeFunctionResultMessage {
    return {
      action: options.action,
      result: options.result,
      content: stringifyFunctionResult(options.result),
    }
  }

  async executeFunctionCall(options: AiRuntimeExecuteFunctionCallOptions): Promise<AiRuntimeFunctionCallResult<unknown>> {
    const translated = await this.translator.translateFunctionCall(options)
    if (!translated.ok) {
      this.tryRecordFailedFunctionCall(options, translated)
      return translated
    }

    const translation = translated.translation
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

    const validationError = options.validate?.(runInput) ?? null
    if (validationError !== null) {
      const failed = createFunctionCallFailure('INVALID_ARGS', validationError, `Fix args for ${translation.action} before retrying.`)
      this.completeTranslatedFunctionCall(translation, failed, requestEntry.id)
      return failed
    }

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
