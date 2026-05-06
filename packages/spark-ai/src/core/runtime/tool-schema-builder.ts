/**
 * Tool Schema Builder — 运行时工具定义生成
 *
 * 职责：
 * - 读取当前已注册的函数定义与运行载体，组合为 Function Calling ToolDefinition 列表。
 * - 此层需读 registry，故归属运行时层而非协议层。
 *
 * 分层说明：
 *   protocol/function-call-schema.ts（纯转换，无 registry 依赖）
 *     ↑
 *   runtime/tool-schema-builder.ts（本文件，读 registry 注入 carrier prompt）
 */

import type { ToolDefinition } from '../protocol/session-contracts'
import { functionToToolDefinition } from '../protocol/function-call-schema'
import { getAllFunctionDefinitions } from '../registry/function-registry'
import { getFunctionCarrierByAction } from '../registry/function-carrier-registry'

export function generateToolDefinitions(
  filter?: {
    actions?: string[]
    compactDescriptions?: boolean
  },
): ToolDefinition[] {
  const tools: ToolDefinition[] = []
  const allowedActions = filter?.actions ? new Set(filter.actions) : null

  for (const [, definition] of getAllFunctionDefinitions()) {
    if (allowedActions && !allowedActions.has(definition.action)) {
      continue
    }

    const carrierPrompt = getFunctionCarrierByAction(definition.action)?.prompt
    const toolDefinition = functionToToolDefinition(definition, { modulePrompt: carrierPrompt })

    tools.push(
      filter?.compactDescriptions
        ? {
            type: 'function',
            function: {
              ...toolDefinition.function,
              description: definition.description,
            },
          }
        : toolDefinition,
    )
  }

  return tools
}
