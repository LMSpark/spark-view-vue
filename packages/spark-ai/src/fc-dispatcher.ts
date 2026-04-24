import type { IStillSession, StillResult } from './stills/types'
import { executeStill } from './stills/dispatcher'
import { functionNameToAction } from './fc-schema'
import type { FcDispatchResult, ToolCall, ToolResult } from './session-contracts'

export function formatToolResultContent(result: StillResult): string {
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
  session: IStillSession,
): FcDispatchResult {
  const action = functionNameToAction(toolCall.function.name)

  let params: unknown
  try {
    params = JSON.parse(toolCall.function.arguments)
  } catch {
    const result: StillResult = {
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

  const result = executeStill(action, params, session, toolCall.id)

  return {
    toolCall,
    action,
    result,
    toolResult: { tool_call_id: toolCall.id, content: formatToolResultContent(result) },
  }
}

export function dispatchToolCalls(
  toolCalls: ToolCall[],
  session: IStillSession,
): FcDispatchResult[] {
  return toolCalls.map(tc => dispatchToolCall(tc, session))
}

export function buildAssistantToolCallMessage(
  toolCalls: ToolCall[],
  text?: string,
): { role: 'assistant'; content: string | null; tool_calls: ToolCall[] } {
  return {
    role: 'assistant',
    content: text ?? null,
    tool_calls: toolCalls,
  }
}

export function buildToolResultMessage(
  toolResult: ToolResult,
): { role: 'tool'; tool_call_id: string; content: string } {
  return {
    role: 'tool',
    tool_call_id: toolResult.tool_call_id,
    content: toolResult.content,
  }
}
