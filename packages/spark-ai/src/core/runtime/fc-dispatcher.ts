import type { FunctionResult, FunctionRuntimeContext } from '../protocol/function-contracts'
import { executeFunction, executeFunctionAsync } from './function-dispatcher'
import { getAllFunctionDefinitions } from '../registry/function-registry'
import { functionNameToAction } from '../protocol/function-call-schema'
import type { FcDispatchResult, ToolCall } from '../protocol/session-contracts'

export function formatToolResultContent(result: FunctionResult): string {
  const stringify = (value: unknown): string => {
    const seen = new WeakSet<object>()
    return JSON.stringify(value, (_key, currentValue: unknown) => {
      if (typeof currentValue === 'function') {
        return '[Function]'
      }
      if (typeof currentValue === 'object' && currentValue !== null) {
        if (seen.has(currentValue)) {
          return '[Circular]'
        }
        seen.add(currentValue)
      }
      return currentValue
    })
  }

  if (result.ok) {
    const output: Record<string, unknown> = { ok: true, data: result.data, summary: result.summary }
    if (result.warnings && result.warnings.length > 0) {
      output['warnings'] = result.warnings
    }
    return stringify(output)
  }
  return stringify({ ok: false, code: result.code, msg: result.msg, fix: result.fix })
}

export function dispatchToolCall(
  toolCall: ToolCall,
  context: FunctionRuntimeContext,
): FcDispatchResult {
  const action = functionNameToAction(toolCall.function.name, getAllFunctionDefinitions())

  let params: unknown
  try {
    params = JSON.parse(toolCall.function.arguments)
  } catch {
    const result: FunctionResult = {
      ok: false,
      code: 'INVALID_JSON',
      msg: `参数 JSON 解析失败: ${toolCall.function.arguments.slice(0, 100)}`,
      fix: '确保 arguments 是合法 JSON 对象',
    }
    return {
      toolCall,
      action,
      result,
      toolResult: { tool_call_id: toolCall.id, content: formatToolResultContent(result) },
    }
  }

  const result = executeFunction(action, params, context, toolCall.id)

  return {
    toolCall,
    action,
    result,
    toolResult: { tool_call_id: toolCall.id, content: formatToolResultContent(result) },
  }
}

export async function dispatchToolCallAsync(
  toolCall: ToolCall,
  context: FunctionRuntimeContext,
): Promise<FcDispatchResult> {
  const action = functionNameToAction(toolCall.function.name, getAllFunctionDefinitions())

  let params: unknown
  try {
    params = JSON.parse(toolCall.function.arguments)
  } catch {
    const result: FunctionResult = {
      ok: false,
      code: 'INVALID_JSON',
      msg: `参数 JSON 解析失败: ${toolCall.function.arguments.slice(0, 100)}`,
      fix: '确保 arguments 是合法 JSON 对象',
    }
    return {
      toolCall,
      action,
      result,
      toolResult: { tool_call_id: toolCall.id, content: formatToolResultContent(result) },
    }
  }

  const result = await executeFunctionAsync(action, params, context, toolCall.id)

  return {
    toolCall,
    action,
    result,
    toolResult: { tool_call_id: toolCall.id, content: formatToolResultContent(result) },
  }
}
