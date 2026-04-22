/**
 * Function Calling 适配层
 *
 * 将 Stills 引擎的 StillDefinition 适配为 LLM 原生 Function Calling 格式。
 *
 * 核心职责：
 * 1. 类型定义 — ToolCall / ToolResult 等 FC 协议类型
 * 2. Schema 生成 — StillDefinition → JSON Schema tool definitions
 * 3. 调度适配 — FC tool_calls → executeStill → tool results
 * 4. 消息格式化 — StillResult → FC tool result message
 *
 * 设计原则：
 * - 不修改 Stills 引擎核心（dispatcher / domain 不变）
 * - StillDefinition.paramsSchema 是人类可读描述，不是 JSON Schema
 *   → 运行时从 paramsSchema + example 推断类型
 */

import type { StillDefinition, StillResult, IStillSession } from './stills/types'
import { getAllStills, executeStill } from './stills/dispatcher'

// ═══════════════════════════════════════════════════════════
// Types — LLM Function Calling 协议
// ═══════════════════════════════════════════════════════════

/** LLM 返回的单个工具调用 */
export interface ToolCall {
  /** LLM 分配的调用 ID（用于 tool result 回传关联） */
  id: string
  /** 函数调用信息 */
  function: {
    /** 函数名（= StillDefinition.action，点号替换为下划线） */
    name: string
    /** JSON 字符串化的参数 */
    arguments: string
  }
}

/** 工具执行结果（用于回传给 LLM） */
export interface ToolResult {
  /** 对应的 tool_call_id */
  tool_call_id: string
  /** 结果内容（JSON 字符串） */
  content: string
}

/** 单个工具调用的调度结果 */
export interface FcDispatchResult {
  /** 原始工具调用 */
  toolCall: ToolCall
  /** 对应的 still action 名（还原后的点号格式） */
  action: string
  /** Stills 执行结果 */
  result: StillResult
  /** 格式化的 ToolResult（可直接回传 LLM） */
  toolResult: ToolResult
}

/** JSON Schema tool definition（OpenAI / DeepSeek / Anthropic 通用格式） */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: JsonSchema
  }
}

/** JSON Schema 子集（足以描述 still 参数） */
export interface JsonSchema {
  type: 'object'
  properties: Record<string, JsonSchemaProperty>
  required?: string[]
}

export interface JsonSchemaProperty {
  type: string | string[]
  description?: string
  items?: JsonSchemaProperty
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  enum?: Array<string | number | null>
}

// ═══════════════════════════════════════════════════════════
// Action Name Conversion
// ═══════════════════════════════════════════════════════════

/**
 * still action 名 → FC function 名（点号 → 下划线）
 *
 * OpenAI function calling 规范要求 name 符合 `^[a-zA-Z0-9_-]+$`，
 * 不支持点号。所以 `datatable.create` → `datatable_create`。
 */
export function actionToFunctionName(action: string): string {
  return action.replace(/\./g, '_')
}

/**
 * FC function 名 → still action 名（下划线 → 点号，仅首段分隔符）
 *
 * 反向转换策略：基于已注册的 action 名精确匹配。
 * 若无精确匹配，回退到「第一个下划线 → 点号」启发式。
 */
export function functionNameToAction(name: string, registry?: ReadonlyMap<string, unknown>): string {
  // 精确匹配：遍历注册表找到 actionToFunctionName 匹配的
  const stills = registry ?? getAllStills()
  for (const [action] of stills) {
    if (actionToFunctionName(action) === name) {
      return action
    }
  }
  // 回退启发式：第一个下划线替换为点号
  const idx = name.indexOf('_')
  if (idx > 0) {
    return `${name.slice(0, idx)}.${name.slice(idx + 1)}`
  }
  return name
}

// ═══════════════════════════════════════════════════════════
// Schema Generation
// ═══════════════════════════════════════════════════════════

/**
 * 从人类可读的 paramsSchema 描述推断 JSON Schema 属性类型。
 *
 * paramsSchema 值格式：`"type — description"` 或 `"type? — description"`（可选参数）
 *
 * @example
 * ```
 * 'string — DataSet 名称'      → { type: 'string', description: 'DataSet 名称', required: true }
 * 'string? — 解锁原因'          → { type: 'string', description: '解锁原因', required: false }
 * 'DataColumn[] — 列定义'       → { type: 'array', description: '列定义', required: true }
 * 'CrudApi — { list?, create? }' → { type: 'object', description: '{ list?, create? }', required: true }
 * ```
 */
function inferPropertySchema(raw: string): { prop: JsonSchemaProperty; required: boolean } {
  const dashIdx = raw.indexOf('—')
  const typePart = dashIdx > 0 ? raw.slice(0, dashIdx).trim() : raw.trim()
  const descPart = dashIdx > 0 ? raw.slice(dashIdx + 1).trim() : undefined

  const optional = typePart.endsWith('?') || typePart.includes('undefined')
  const cleanType = typePart.endsWith('?') ? typePart.slice(0, -1).trim() : typePart

  const unionParts = cleanType
    .split('|')
    .map(part => part.trim().toLowerCase())
    .filter(part => part.length > 0 && part !== 'null' && part !== 'undefined')

  const prop: JsonSchemaProperty = { type: 'string' }
  if (descPart) prop.description = descPart

  if (unionParts.some(part => part.endsWith('[]') || part.startsWith('array<'))) {
    prop.type = 'array'
    prop.items = { type: 'object' }
  } else if (unionParts.some(part => part === 'number' || part === 'integer')) {
    prop.type = 'number'
  } else if (unionParts.some(part => part === 'boolean')) {
    prop.type = 'boolean'
  } else if (unionParts.some(part => part === 'string' || /^".*"$/u.test(part) || /^'.*'$/u.test(part))) {
    prop.type = 'string'
  } else {
    // 复合类型（CrudApi / Record / 其他）→ object
    prop.type = 'object'
  }

  return { prop, required: !optional }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function inferPropertySchemaFromUnknown(rawDesc: unknown): { prop: JsonSchemaProperty; required: boolean } {
  if (typeof rawDesc === 'string') {
    return inferPropertySchema(rawDesc)
  }

  if (!isPlainRecord(rawDesc)) {
    return { prop: { type: 'object' }, required: true }
  }

  const kind = rawDesc['kind']
  const note = typeof rawDesc['note'] === 'string' ? rawDesc['note'] : undefined

  if (kind === 'enum') {
    const rawEnum = Array.isArray(rawDesc['enum']) ? rawDesc['enum'] : []
    const enumValues = rawEnum.filter(item => typeof item === 'string' || typeof item === 'number')
    const schemaType = rawDesc['type'] === 'number' ? 'number' : 'string'
    const nullable = rawDesc['nullable'] === true
    const optional = rawDesc['optional'] === true
    const openEnded = rawDesc['openEnded'] === true
    const descriptionParts = [note]

    if (enumValues.length > 0) {
      descriptionParts.push(`推荐值: ${enumValues.map(item => JSON.stringify(item)).join(' | ')}`)
    }
    if (openEnded) {
      descriptionParts.push('也允许自定义值')
    }

    return {
      prop: {
        type: nullable ? [schemaType, 'null'] : schemaType,
        ...(descriptionParts.filter(Boolean).length > 0
          ? { description: descriptionParts.filter(Boolean).join('；') }
          : {}),
        ...(!openEnded && enumValues.length > 0
          ? { enum: nullable ? [...enumValues, null] : enumValues }
          : {}),
      },
      required: !optional,
    }
  }

  if (kind === 'array') {
    const itemSchema = inferPropertySchemaFromUnknown(rawDesc['items']).prop
    return {
      prop: {
        type: 'array',
        ...(note ? { description: note } : {}),
        items: itemSchema,
      },
      required: true,
    }
  }

  if (kind === 'object') {
    const properties: Record<string, JsonSchemaProperty> = {}
    const requiredSet = new Set<string>()

    const required = rawDesc['required']
    if (Array.isArray(required)) {
      for (const key of required) {
        if (typeof key === 'string' && key.length > 0) requiredSet.add(key)
      }
    }

    const rawProperties = isPlainRecord(rawDesc['properties']) ? rawDesc['properties'] : {}
    for (const [key, value] of Object.entries(rawProperties)) {
      const inferred = inferPropertySchemaFromUnknown(value)
      properties[key] = inferred.prop
      if (inferred.required) requiredSet.add(key)
    }

    const optionalProperties = isPlainRecord(rawDesc['optional']) ? rawDesc['optional'] : {}
    for (const [key, value] of Object.entries(optionalProperties)) {
      const inferred = inferPropertySchemaFromUnknown(value)
      properties[key] = inferred.prop
      requiredSet.delete(key)
    }

    return {
      prop: {
        type: 'object',
        ...(note ? { description: note } : {}),
        properties,
        ...(requiredSet.size > 0 ? { required: Array.from(requiredSet) } : {}),
      },
      required: true,
    }
  }

  const properties: Record<string, JsonSchemaProperty> = {}
  const required: string[] = []
  for (const [key, value] of Object.entries(rawDesc)) {
    const inferred = inferPropertySchemaFromUnknown(value)
    properties[key] = inferred.prop
    if (inferred.required) required.push(key)
  }

  return {
    prop: {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
    },
    required: true,
  }
}

function inferToolParametersFromSchema(paramsSchema: unknown): { properties: Record<string, JsonSchemaProperty>; required: string[] } {
  if (!isPlainRecord(paramsSchema)) {
    return { properties: {}, required: [] }
  }

  if (paramsSchema['kind'] === 'object') {
    const inferred = inferPropertySchemaFromUnknown(paramsSchema)
    return {
      properties: inferred.prop.properties ?? {},
      required: inferred.prop.required ?? [],
    }
  }

  const properties: Record<string, JsonSchemaProperty> = {}
  const required: string[] = []
  for (const [key, rawDesc] of Object.entries(paramsSchema)) {
    const inferred = inferPropertySchemaFromUnknown(rawDesc)
    properties[key] = inferred.prop
    if (inferred.required) required.push(key)
  }

  return { properties, required }
}

/**
 * 从单个 StillDefinition 生成 JSON Schema tool definition
 */
export function stillToToolDefinition(still: StillDefinition): ToolDefinition {
  const { properties, required } = inferToolParametersFromSchema(still.paramsSchema)

  // 补充 guard 和 usageRules 到 description
  const descParts = [still.description]
  if (still.guardDescription) {
    descParts.push(`前置条件: ${still.guardDescription}`)
  }
  if (still.usageRules && still.usageRules.length > 0) {
    descParts.push(`规则: ${still.usageRules.join('；')}`)
  }

  return {
    type: 'function',
    function: {
      name: actionToFunctionName(still.action),
      description: descParts.join('。'),
      parameters: {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
      },
    },
  }
}

/**
 * 从注册表生成全部 tool definitions
 *
 * @param filter - 可选过滤器（如只导出 request 或 describe 类型）
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

  for (const [, still] of getAllStills()) {
    if (filter?.types && !filter.types.includes(still.type)) {
      continue
    }
    if (allowedActions && !allowedActions.has(still.action)) {
      continue
    }
    tools.push(
      filter?.compactDescriptions
        ? {
            type: 'function',
            function: {
              ...stillToToolDefinition(still).function,
              description: still.description,
            },
          }
        : stillToToolDefinition(still),
    )
  }

  return tools
}

// ═══════════════════════════════════════════════════════════
// Dispatch — FC tool_calls → Stills 调度
// ═══════════════════════════════════════════════════════════

/**
 * 格式化 StillResult 为 tool result content（JSON 字符串）
 */
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

/**
 * 调度单个 FC ToolCall 到 Stills 引擎
 */
export function dispatchToolCall(
  toolCall: ToolCall,
  session: IStillSession,
): FcDispatchResult {
  const action = functionNameToAction(toolCall.function.name)

  // 解析参数
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

  // 执行 still
  const result = executeStill(action, params, session, toolCall.id)

  return {
    toolCall,
    action,
    result,
    toolResult: { tool_call_id: toolCall.id, content: formatToolResultContent(result) },
  }
}

/**
 * 批量调度 FC tool_calls
 *
 * 注意：OpenAI Function Calling 允许一次返回多个 tool_calls，
 * 但 Stills 引擎设计为"一轮一块"。这里支持多调用但保留警告。
 */
export function dispatchToolCalls(
  toolCalls: ToolCall[],
  session: IStillSession,
): FcDispatchResult[] {
  return toolCalls.map(tc => dispatchToolCall(tc, session))
}

// ═══════════════════════════════════════════════════════════
// Message Builders — FC 格式的对话消息
// ═══════════════════════════════════════════════════════════

/**
 * 构建 assistant 消息（含 tool_calls）
 *
 * OpenAI 格式：assistant 消息的 content 可为 null 当 tool_calls 存在时
 */
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

/**
 * 构建 tool result 消息
 */
export function buildToolResultMessage(
  toolResult: ToolResult,
): { role: 'tool'; tool_call_id: string; content: string } {
  return {
    role: 'tool',
    tool_call_id: toolResult.tool_call_id,
    content: toolResult.content,
  }
}
