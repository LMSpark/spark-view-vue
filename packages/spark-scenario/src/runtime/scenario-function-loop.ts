import type { AiScenarioFunctionCall, AiScenarioFunctionCallResult } from '../contracts/function-call-contracts'
import type { AiScenarioFunctionCallBridge } from './scenario-function-call-bridge'

export interface AiScenarioFunctionLoopGuardContext {
  calls: readonly AiScenarioFunctionCall[]
  results: readonly AiScenarioFunctionCallResult[]
}

export type AiScenarioFunctionLoopGuard = (
  context: AiScenarioFunctionLoopGuardContext,
) => string | undefined | Promise<string | undefined>

export interface AiScenarioFunctionLoopOptions {
  bridge: AiScenarioFunctionCallBridge
  appendFunctionResult?: (
    result: AiScenarioFunctionCallResult,
    call: AiScenarioFunctionCall,
  ) => void | Promise<void>
  completionGuard?: AiScenarioFunctionLoopGuard
}

export interface AiScenarioFunctionLoopResult {
  ok: boolean
  results: readonly AiScenarioFunctionCallResult[]
  error?: string
}

function failedLoopResult(
  results: readonly AiScenarioFunctionCallResult[],
  error: string,
): AiScenarioFunctionLoopResult {
  return { ok: false, results, error }
}

export async function runScenarioFunctionCalls(
  calls: readonly AiScenarioFunctionCall[],
  options: AiScenarioFunctionLoopOptions,
): Promise<AiScenarioFunctionLoopResult> {
  const results: AiScenarioFunctionCallResult[] = []

  for (const call of calls) {
    const result = await options.bridge.executeFunctionCall(call)
    results.push(result)
    await options.appendFunctionResult?.(result, call)
    if (!result.ok) {
      return failedLoopResult(results, result.error ?? `Function call failed: ${result.functionName}`)
    }
  }

  const guardError = await options.completionGuard?.({ calls, results })
  if (guardError !== undefined) return failedLoopResult(results, guardError)

  return { ok: true, results }
}
