/**
 * agent/native-runtime · VCM-native 脚本执行沙箱。
 *
 * LLM 脚本中的 this 就是调用方提供的模块上下文；ctx 是同一对象的别名。
 * 这里的沙箱是统一执行上下文，不是高安全隔离；function calling 与脚本都可以进入它。
 * 当前文件负责脚本入口，只做错误投影和 JSON 返回值规整。
 */

import { toErrorMessage } from '@spark-appworks/spark-utils'
import { coerceJsonValue, type AiJsonValue } from '../../json'
import { AiAgentToolCheck, AiAgentToolResult } from '../tool-runtime'

const SCRIPT_RECOVERY_HINT = '先 vcm_action_guide 读取 usageRules/paramsSchema；mutator 用 vcm_script({ script })，参数名必须是 script；失败时读 tool result 的 RECOVERY_HINT。'

export type AiNativeScriptSandboxContext = Readonly<Record<string, unknown>>

const GENERATED_STACK_LINE_FOR_SCRIPT_LINE_1 = 6

export async function executeModuleScript(
  script: string,
  context: AiNativeScriptSandboxContext,
): Promise<AiAgentToolResult<AiJsonValue>> {
  try {
    const result = await runScript(script, context)
    const data = coerceJsonValue(result)
    if (data === undefined) {
      return AiAgentToolResult.failCode(
        'SCRIPT_RESULT_NOT_JSON',
        '脚本返回值不能序列化为 JSON。',
        '请返回字符串、数字、布尔、null、数组或普通对象。',
      )
    }
    return AiAgentToolResult.ok(data)
  } catch (error) {
    const location = findScriptErrorLocation(error)
    const originalFailure = readOriginalToolFailure(error)
    if (originalFailure !== undefined) {
      const locationHint = location === undefined
        ? '脚本链式调用返回业务失败；先按原始错误码修正参数或业务状态。'
        : `脚本第 ${String(location.line)} 行的链式调用返回业务失败；先按原始错误码修正参数或业务状态。`
      return AiAgentToolResult.fail([
        ...(originalFailure.checks ?? [
          AiAgentToolCheck.error('SCRIPT_ACTION_FAILED', toErrorMessage(error), locationHint),
        ]),
        AiAgentToolCheck.error(
          'SCRIPT_EXECUTION_FAILED',
          location === undefined
            ? `脚本链式调用失败: ${toErrorMessage(error)}`
            : `脚本第 ${String(location.line)} 行链式调用失败: ${toErrorMessage(error)}`,
          locationHint,
        ),
      ], {
        ...(originalFailure.state ?? {}),
        ...(location === undefined ? {} : { scriptLine: location.line }),
      })
    }
    const locationText = location === undefined ? '' : `，脚本第 ${String(location.line)} 行`
    const errorMessage = toErrorMessage(error)
    const chainHint = resolveScriptChainHint(errorMessage)
    return AiAgentToolResult.failCode(
      'SCRIPT_EXECUTION_FAILED',
      `脚本执行失败${locationText}: ${errorMessage}`,
      location === undefined
        ? `检查脚本语法、this helper 名称和参数 schema 后重试。${chainHint}${SCRIPT_RECOVERY_HINT}`
        : `检查脚本第 ${String(location.line)} 行附近的语法、this helper 名称和参数 schema 后重试。${chainHint}${SCRIPT_RECOVERY_HINT}`,
    )
  }
}

function readOriginalToolFailure(error: unknown): AiAgentToolResult<unknown> | undefined {
  if (!isIndexableObject(error)) return undefined
  const result = error['result']
  if (!(result instanceof AiAgentToolResult)) return undefined
  return result.ok ? undefined : result
}

async function runScript(script: string, context: AiNativeScriptSandboxContext): Promise<unknown> {
  const contextWithSelf: Record<string, unknown> = { ...context }
  contextWithSelf['ctx'] = contextWithSelf
  const source = [
    'return (async function () {',
    '  try {',
    '    with (this) {',
    script,
    '    }',
    '  } catch (__error) {',
    '    throw __error',
    '  }',
    '}).call(__ctx)',
  ].join('\n')
  const executeUnknown: unknown = new Function('__ctx', source)
  if (!isNativeScriptExecutor(executeUnknown)) {
    throw new Error('native script compile failed')
  }
  return Promise.resolve(executeUnknown(contextWithSelf))
}

function isNativeScriptExecutor(
  value: unknown,
): value is (ctx: Record<string, unknown>) => unknown {
  return typeof value === 'function'
}

function findScriptErrorLocation(error: unknown): Readonly<{ line: number, column?: number }> | undefined {
  if (!(error instanceof Error) || error.stack === undefined) return undefined
  const match = /<anonymous>:(\d+):(\d+)/.exec(error.stack)
  if (match === null) return undefined
  const generatedLine = Number(match[1])
  const generatedColumn = Number(match[2])
  if (!Number.isInteger(generatedLine)) return undefined
  const line = generatedLine - GENERATED_STACK_LINE_FOR_SCRIPT_LINE_1 + 1
  if (line < 1) return undefined
  return {
    line,
    ...(Number.isInteger(generatedColumn) ? { column: generatedColumn } : {}),
  }
}

function isIndexableObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object'
}

function resolveScriptChainHint(errorMessage: string): string {
  if (errorMessage.includes('toJSON')) {
    return '勿对复杂运行时对象调 toJSON；用 vcm_action_guide 查 mutator action 的 usageRules。'
  }
  if (errorMessage.includes('.call is not a function')) {
    return '链式 API 对象勿用 .call()；用 vcm_action_guide 查 action 调用形状。'
  }
  if (errorMessage.includes(' is not a function')) {
    return '脚本调用了非函数目标；先 await 前置 action 返回对象，再用 vcm_action_guide 核对 mutator 调用方式。'
  }
  if (errorMessage.includes("reading 'includes'")) {
    return '参数或中间值为 undefined；用 vcm_action_guide 对照 paramsSchema 与 usageRules 后重试。'
  }
  if (errorMessage.includes('run is not a function')) {
    return 'mutator action 需要 callback 参数；直接传 async 函数，兼容 { run: fn } 时 run 必须是函数。'
  }
  if (errorMessage.includes('received non-function run')) {
    return '勿把业务参数对象当作 mutator run；callback 内再调用子 action。'
  }
  return ''
}
