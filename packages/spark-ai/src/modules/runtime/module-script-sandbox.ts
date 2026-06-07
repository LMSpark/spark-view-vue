/**
 * modules/runtime · 模块执行沙箱。
 *
 * LLM 脚本中的 this 就是调用方提供的模块上下文；ctx 是同一对象的别名。
 * 这里的沙箱是统一执行上下文，不是高安全隔离；function calling 与脚本都可以进入它。
 * 当前文件负责脚本入口，只做错误投影和 JSON 返回值规整。
 */

import { toErrorMessage } from '@spark-appworks/spark-utils'
import { coerceJsonValue, type AiJsonValue } from '../../json'
import { AiModuleCheck, AiModuleResult } from '../protocol'

const SCRIPT_RECOVERY_HINT = '先 module_function_guide 读取 usageRules/paramsSchema；mutator 用 module_script({ script })，参数名必须是 script；失败时读 tool result 的 RECOVERY_HINT。'

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
    const originalFailure = readOriginalAiModuleFailure(error)
    if (originalFailure !== undefined) {
      const locationHint = location === undefined
        ? '脚本链式调用返回业务失败；先按原始错误码修正参数或业务状态。'
        : `脚本第 ${String(location.line)} 行的链式调用返回业务失败；先按原始错误码修正参数或业务状态。`
      return AiModuleResult.fail([
        ...(originalFailure.checks ?? [
          AiModuleCheck.error('SCRIPT_ACTION_FAILED', toErrorMessage(error), locationHint),
        ]),
        AiModuleCheck.error(
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
    const chainHint = errorMessage.includes('toJSON')
      ? '勿对 DataSet/DataView/Tree 调 toJSON；先 const page = await this.openPageDesign({ pageId })，再 await page.editDataSet(async ds => ...)。'
      : errorMessage.includes('.call is not a function')
        ? 'openPageDesign 返回 ConfigPageNode 链式对象，用 page.editNodeTree(async tree => ...)/editDataSet(async ds => ...)，勿 page.call()。'
        : errorMessage.includes('editDataSet is not a function') || errorMessage.includes('editNodeTree is not a function')
          ? '必须先 await this.openPageDesign({ pageId }) 得到 page，再 page.editDataSet(async ds => ...)；勿省略 await。'
          : errorMessage.includes("reading 'includes'")
            ? 'DataSet 工具 API 用 t.createTable({ tableName, columns })；勿对 undefined 调 includes。'
            : errorMessage.includes('run is not a function')
              ? 'editDataSet/editNodeTree 直接传 callback：page.editDataSet(async ds => ...)；兼容 { run: fn }。'
              : errorMessage.includes('received non-function run')
                ? '勿把 createTable 参数对象传给 editDataSet；应 editDataSet(async ds => ds.createTable({...}))。'
                : ''
    return AiModuleResult.failCode(
      'SCRIPT_EXECUTION_FAILED',
      `脚本执行失败${locationText}: ${errorMessage}`,
      location === undefined
        ? `检查脚本语法、this helper 名称和参数 schema 后重试。${chainHint}${SCRIPT_RECOVERY_HINT}`
        : `检查脚本第 ${String(location.line)} 行附近的语法、this helper 名称和参数 schema 后重试。${chainHint}${SCRIPT_RECOVERY_HINT}`,
    )
  }
}

function readOriginalAiModuleFailure(error: unknown): AiModuleResult<unknown> | undefined {
  if (!isIndexableObject(error)) return undefined
  const result = error['result']
  if (!(result instanceof AiModuleResult)) return undefined
  return result.ok ? undefined : result
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

function isIndexableObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object'
}
