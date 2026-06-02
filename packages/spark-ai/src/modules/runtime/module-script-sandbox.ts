/**
 * modules/runtime · 模块执行沙箱。
 *
 * LLM 脚本中的 this 就是调用方提供的模块上下文；ctx 是同一对象的别名。
 * 这里的沙箱是统一执行上下文，不是高安全隔离；function calling 与脚本都可以进入它。
 * 当前文件负责脚本入口，只做错误投影和 JSON 返回值规整。
 */

import { toErrorMessage } from '@spark-view/spark-utils'
import { coerceJsonValue, type AiJsonValue } from '../../json'
import { AiModuleResult } from '../protocol'

export type AiModuleScriptContext = Readonly<Record<string, unknown>>

const GENERATED_STACK_LINE_FOR_SCRIPT_LINE_1 = 6

export async function executeModuleScript(
  script: string,
  context: AiModuleScriptContext,
): Promise<AiModuleResult<AiJsonValue>> {
  try {
    const result = await runScript(script, context)
    const data = coerceJsonValue(result)
    if (data === undefined) {
      return AiModuleResult.failCode(
        'SCRIPT_RESULT_NOT_JSON',
        '脚本返回值不能序列化为 JSON。',
        '请返回字符串、数字、布尔、null、数组或普通对象。',
      )
    }
    return AiModuleResult.ok(data)
  } catch (error) {
    const location = findScriptErrorLocation(error)
    const locationText = location === undefined ? '' : `，脚本第 ${String(location.line)} 行`
    return AiModuleResult.failCode(
      'SCRIPT_EXECUTION_FAILED',
      `脚本执行失败${locationText}: ${toErrorMessage(error)}`,
      location === undefined
        ? '检查脚本语法、this helper 名称和参数 schema 后重试。'
        : `检查脚本第 ${String(location.line)} 行附近的语法、this helper 名称和参数 schema 后重试。`,
    )
  }
}

async function runScript(script: string, context: AiModuleScriptContext): Promise<unknown> {
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
  const execute = new Function('__ctx', source) as (ctx: AiModuleScriptContext) => Promise<unknown>
  return execute(contextWithSelf)
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
