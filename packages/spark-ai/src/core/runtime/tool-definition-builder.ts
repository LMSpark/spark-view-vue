import type { RegisteredFunctionDefinition } from '../protocol/function-contracts'
import type { ToolDefinition } from '../protocol/session-contracts'
import { functionToToolDefinition as buildProtocolToolDefinition } from '../protocol/function-call-schema'
import { getFunctionCarrierByAction } from '../registry/function-carrier-registry'
import { getAllFunctionDefinitions } from '../registry/function-registry'

/**
 * FC 工具定义装配器。
 *
 * 职责边界：
 * 1. 基于 function registry 扫描当前可用 definitions。
 * 2. 结合 carrier registry 的模块提示词，把 definition 装配成 LLM 可消费的 ToolDefinition。
 * 3. 这里只做 registry-aware 的装配，不承担函数执行与调度职责。
 */

function resolveToolModulePrompt<TParams, TResult>(
  definition: RegisteredFunctionDefinition<TParams, TResult>,
): string | undefined {
  return getFunctionCarrierByAction(definition.action)?.prompt ?? definition.modulePrompt
}

/**
 * 把单个函数定义装配为最终对外暴露的 FC 工具定义。
 * 输入语义：接收一条 RegisteredFunctionDefinition。
 * 输出语义：返回包含 carrier prompt 投影结果的 ToolDefinition。
 * 调用时机：单工具 schema 生成、测试断言或批量 generate 前的单条装配时使用。
 */
export function functionToToolDefinition<TParams, TResult>(
  definition: RegisteredFunctionDefinition<TParams, TResult>,
): ToolDefinition {
  return buildProtocolToolDefinition(definition, {
    modulePrompt: resolveToolModulePrompt(definition),
  })
}

/**
 * 批量生成本轮可暴露给 LLM 的工具定义列表。
 * 输入语义：可按类型、action 白名单、是否压缩描述做过滤。
 * 输出语义：返回一组最终 ToolDefinition 列表，供 orchestrator 传给后端会话。
 * 调用时机：启动函数循环前，根据当前 registry 快照生成一轮 tool 集合时使用。
 */
export function generateToolDefinitions(
  filter?: {
    types?: Array<'request' | 'describe'>
    actions?: string[]
    compactDescriptions?: boolean
  },
): ToolDefinition[] {
  const tools: ToolDefinition[] = []
  const allowedActions = filter?.actions ? new Set(filter.actions) : null

  for (const [, definition] of getAllFunctionDefinitions()) {
    if (filter?.types && !filter.types.includes(definition.type)) {
      continue
    }
    if (allowedActions && !allowedActions.has(definition.action)) {
      continue
    }

    const toolDefinition = functionToToolDefinition(definition)

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