import type { LlmJsonValue } from '../../schema'
import type { ModuleCheckEntry, ModuleOperationResult } from '../../module-semantic'
import type {
  AiHostFunctionCallFailure,
  AiHostFunctionCallResult,
} from '../session/session-types'

export function toFunctionCallResult(
  result: ModuleOperationResult<LlmJsonValue>,
): AiHostFunctionCallResult<unknown> {
  if (result.ok) {
    const summary = firstInfoOrWarnSummary(result.checks)
    return {
      ok: true,
      ...(result.data === undefined ? {} : { data: result.data }),
      ...(summary === undefined ? {} : { summary }),
    }
  }
  const failure = pickFirstErrorCheck(result.checks)
  if (failure === undefined) {
    return {
      ok: false,
      code: 'PROTOCOL_FAILURE',
      msg: '协议层返回失败但未携带 error 级 check',
      fix: '请检查 ModuleOperationResult.checks 是否正确填充',
    }
  }
  return {
    ok: false,
    code: failure.code,
    msg: failure.message,
    fix: failure.hint ?? '请根据 message 调整调用方式或参数',
  }
}

export function failureFromCallResult(result: AiHostFunctionCallResult<unknown>): AiHostFunctionCallFailure {
  if (result.ok) throw new Error('[AiHostToolLoopRunner] failureFromCallResult called with success result')
  return { ok: false, code: result.code, msg: result.msg, fix: result.fix }
}

function firstInfoOrWarnSummary(checks: readonly ModuleCheckEntry[] | undefined): string | undefined {
  return checks?.find((check) => check.level === 'info' || check.level === 'warn')?.message
}

function pickFirstErrorCheck(checks: readonly ModuleCheckEntry[] | undefined): ModuleCheckEntry | undefined {
  return checks?.find((check) => check.level === 'error')
}
