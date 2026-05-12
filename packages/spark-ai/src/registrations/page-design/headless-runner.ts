import {
  AiInvocationProtocol,
  LlmParameterSchema,
  type AiRuntimeFunctionCallResult,
  type AiRuntimeFunctionExposure,
  type AiRuntimeKnowledgeProjection,
  type AiRuntimeSessionRecord,
  type LlmJsonValue,
  type LlmParameterSchemaRoot,
} from '../../core'
import {
  PAGE_DESIGN_MODULE_ID,
  PageDesignModule,
  type PageDesignModuleOptions,
} from './page-design-module'
import { PageDesignEditRuntimePrompt } from './prompts/edit-runtime-prompt'

export interface PageDesignLlmToolDefinition {
  readonly type: 'function'
  readonly function: {
    readonly name: string
    readonly description: string
    readonly parameters: Record<string, unknown>
  }
}

export interface PageDesignLlmToolCall {
  readonly id?: string
  readonly type?: 'function'
  readonly function: {
    readonly name: string
    readonly arguments?: string
  }
}

export interface PageDesignLlmMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool'
  readonly content: string
  readonly tool_calls?: readonly PageDesignLlmToolCall[]
  readonly tool_call_id?: string
}

export interface PageDesignLlmTurnRequest {
  readonly messages: readonly PageDesignLlmMessage[]
  readonly tools: readonly PageDesignLlmToolDefinition[]
  readonly signal?: AbortSignal | undefined
  readonly onDelta?: (text: string) => void
  readonly onReasoning?: (text: string) => void
  readonly onUsage?: (usage: Record<string, unknown>) => void
}

export interface PageDesignLlmTurnResult {
  readonly text: string
  readonly reasoning?: string | undefined
  readonly toolCalls?: readonly PageDesignLlmToolCall[] | undefined
  readonly usage?: Record<string, unknown> | undefined
}

export type PageDesignLlmTurn = (
  request: PageDesignLlmTurnRequest,
) => Promise<PageDesignLlmTurnResult>

export interface PageDesignToolCatalogProjection {
  readonly tools: readonly PageDesignLlmToolDefinition[]
  readonly actionByToolName: ReadonlyMap<string, string>
  readonly toolNameByAction: ReadonlyMap<string, string>
}

export interface PageDesignHeadlessToolEvent {
  readonly round: number
  readonly callId: string
  readonly toolName: string
  readonly action: string
  readonly args: unknown
}

export interface PageDesignHeadlessToolResultEvent extends PageDesignHeadlessToolEvent {
  readonly result: AiRuntimeFunctionCallResult<unknown>
  readonly durationMs: number
}

export interface PageDesignHeadlessRunOptions {
  readonly pageId: string
  readonly prompt: string
  readonly instanceId?: string | undefined
  readonly pageDesign?: PageDesignModule | undefined
  readonly getEditToolHost?: PageDesignModuleOptions['getEditToolHost'] | undefined
  readonly turn: PageDesignLlmTurn
  readonly metadata?: Record<string, unknown> | undefined
  readonly maxRounds?: number | undefined
  readonly systemPrompt?: string | undefined
  readonly signal?: AbortSignal | undefined
  readonly bootstrap?: boolean | undefined
  readonly stopWhenDone?: boolean | undefined
  readonly onDelta?: (text: string) => void
  readonly onReasoning?: (text: string) => void
  readonly onUsage?: (usage: Record<string, unknown>) => void
  readonly onToolCall?: (event: PageDesignHeadlessToolEvent) => void
  readonly onToolResult?: (event: PageDesignHeadlessToolResultEvent) => void
  readonly onToolError?: (event: PageDesignHeadlessToolResultEvent) => void
}

export type PageDesignHeadlessRunResult =
  | {
    readonly ok: true
    readonly pageId: string
    readonly instanceId: string
    readonly rounds: number
    readonly text: string
    readonly projection: AiRuntimeKnowledgeProjection
    readonly coreSession: AiRuntimeSessionRecord | null
    readonly toolResults: readonly PageDesignHeadlessToolResultEvent[]
  }
  | {
    readonly ok: false
    readonly pageId: string
    readonly instanceId: string
    readonly rounds: number
    readonly code: string
    readonly msg: string
    readonly fix: string
    readonly text: string
    readonly projection?: AiRuntimeKnowledgeProjection | undefined
    readonly coreSession: AiRuntimeSessionRecord | null
    readonly toolResults: readonly PageDesignHeadlessToolResultEvent[]
  }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneJsonValue<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') return value
  try {
    return globalThis.structuredClone(value)
  } catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify({ ok: false, code: 'SERIALIZE_ERROR', msg: String(value) })
  }
}

function parseToolArgs(raw: string | undefined): unknown {
  if (raw === undefined || raw.trim() === '') return {}
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return {
      __parseError: `工具参数不是合法 JSON: ${raw}`,
    }
  }
}

function nowMs(): number {
  return Date.now()
}

function createInstanceId(pageId: string): string {
  return `page-design-headless:${pageId}:${Math.random().toString(36).slice(2, 10)}`
}

function sanitizeToolNamePart(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_-]/g, '_').replace(/^_+|_+$/g, '')
  return sanitized === '' ? 'tool' : sanitized
}

function createToolName(exposure: AiRuntimeFunctionExposure, index: number): string {
  let functionId = `fn_${index}`
  try {
    functionId = AiInvocationProtocol.parseActionPath(exposure.action).function
  } catch {
    // Keep the indexed fallback.
  }
  return `pageDesign_${sanitizeToolNamePart(exposure.moduleId)}_${sanitizeToolNamePart(functionId)}`.slice(0, 64)
}

function describeFunction(exposure: AiRuntimeFunctionExposure): string {
  const parts = [
    exposure.description,
    `Runtime action: ${exposure.action}`,
    `Module path: ${exposure.modulePath}`,
  ]
  if (exposure.usageRules !== undefined && exposure.usageRules.length > 0) {
    parts.push(`Usage rules: ${exposure.usageRules.join('；')}`)
  }
  if (exposure.failureModes !== undefined && exposure.failureModes.length > 0) {
    parts.push(`Failure modes: ${exposure.failureModes.map((item) => `${item.code}: ${item.fix}`).join('；')}`)
  }
  return parts.join('\n')
}

function leafToJsonSchema(description: string): Record<string, unknown> {
  const parsed = LlmParameterSchema.parseLeafDescription(description)
  const out: Record<string, unknown> = {}
  if (parsed.description !== undefined && parsed.description !== '') {
    out['description'] = parsed.description
  } else {
    out['description'] = description
  }

  if (parsed.expectedKinds.has('unknown') || parsed.expectedKinds.size === 0) {
    return out
  }
  if (parsed.expectedKinds.has('array')) {
    out['type'] = 'array'
    if (parsed.arrayItemKind !== undefined) {
      out['items'] = { type: parsed.arrayItemKind }
    }
    return out
  }
  if (parsed.expectedKinds.has('object')) {
    out['type'] = 'object'
    out['additionalProperties'] = true
    return out
  }

  const primitiveTypes = ['string', 'number', 'boolean']
    .filter((kind) => parsed.expectedKinds.has(kind as 'string' | 'number' | 'boolean'))
  if (primitiveTypes.length === 1) {
    out['type'] = primitiveTypes[0]
  } else if (primitiveTypes.length > 1) {
    out['type'] = primitiveTypes
  }
  return out
}

function isOptionalSchemaNode(schema: unknown): boolean {
  if (typeof schema === 'string') {
    return LlmParameterSchema.parseLeafDescription(schema).optional
  }
  if (!isRecord(schema)) return false
  if (schema['kind'] === 'enum' && schema['optional'] === true) return true
  return false
}

function schemaNodeToJsonSchema(schema: unknown): Record<string, unknown> {
  const normalized = LlmParameterSchema.normalizeSchemaNode(schema)
  if (typeof normalized === 'string') {
    return leafToJsonSchema(normalized)
  }
  if (LlmParameterSchema.isEnumSchema(normalized)) {
    const type = normalized.type ?? 'string'
    return {
      type: normalized.nullable === true ? [type, 'null'] : type,
      enum: [...normalized.enum],
      ...(normalized.note !== undefined ? { description: normalized.note } : {}),
    }
  }
  if (LlmParameterSchema.isArraySchema(normalized)) {
    return {
      type: 'array',
      ...(normalized.items === undefined ? {} : { items: schemaNodeToJsonSchema(normalized.items) }),
      ...(normalized.note !== undefined ? { description: normalized.note } : {}),
    }
  }
  if (LlmParameterSchema.isObjectSchema(normalized)) {
    const properties: Record<string, unknown> = {}
    const required = new Set(normalized.required ?? [])
    for (const [key, value] of Object.entries(normalized.properties ?? {})) {
      if (LlmParameterSchema.isWildcardKey(key)) continue
      properties[key] = schemaNodeToJsonSchema(value)
    }
    for (const [key, value] of Object.entries(normalized.optional ?? {})) {
      if (LlmParameterSchema.isWildcardKey(key)) continue
      properties[key] = schemaNodeToJsonSchema(value)
      required.delete(key)
    }
    return {
      type: 'object',
      properties,
      required: [...required].filter((key) => key in properties),
      additionalProperties: normalized.additionalProperties === undefined
        ? false
        : schemaNodeToJsonSchema(normalized.additionalProperties),
      ...(normalized.note !== undefined ? { description: normalized.note } : {}),
    }
  }
  return {}
}

export function pageDesignParamsToJsonSchema(schema: LlmParameterSchemaRoot): Record<string, unknown> {
  if (Object.keys(schema).length === 0) {
    return {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    }
  }

  const cloned = cloneJsonValue(schema) as Record<string, LlmJsonValue>
  if (cloned['type'] === 'object' || cloned['kind'] === 'object') {
    return schemaNodeToJsonSchema(cloned)
  }

  const explicitRequired = Array.isArray(cloned['required'])
    ? cloned['required'].filter((item): item is string => typeof item === 'string')
    : []
  const properties: Record<string, unknown> = {}
  const required = new Set(explicitRequired)
  for (const [key, value] of Object.entries(cloned)) {
    if (key === 'required') continue
    properties[key] = schemaNodeToJsonSchema(value)
    if (!isOptionalSchemaNode(value) && explicitRequired.length === 0) {
      required.add(key)
    }
  }

  return {
    type: 'object',
    properties,
    required: [...required].filter((key) => key in properties),
    additionalProperties: false,
  }
}

export function projectPageDesignTools(
  projection: Pick<AiRuntimeKnowledgeProjection, 'availableFunctions'>,
): PageDesignToolCatalogProjection {
  const tools: PageDesignLlmToolDefinition[] = []
  const actionByToolName = new Map<string, string>()
  const toolNameByAction = new Map<string, string>()
  const usedNames = new Set<string>()

  projection.availableFunctions.forEach((exposure, index) => {
    let toolName = createToolName(exposure, index)
    if (usedNames.has(toolName)) {
      const suffix = `_${index}`
      toolName = `${toolName.slice(0, 64 - suffix.length)}${suffix}`
    }
    usedNames.add(toolName)
    actionByToolName.set(toolName, exposure.action)
    toolNameByAction.set(exposure.action, toolName)
    tools.push({
      type: 'function',
      function: {
        name: toolName,
        description: describeFunction(exposure),
        parameters: pageDesignParamsToJsonSchema(exposure.paramsSchema),
      },
    })
  })

  return { tools, actionByToolName, toolNameByAction }
}

function createSystemPrompt(
  projection: AiRuntimeKnowledgeProjection,
  systemPrompt: string | undefined,
): string {
  const runtimePrompt = new PageDesignEditRuntimePrompt().content
  return [
    runtimePrompt,
    projection.promptSnapshot,
    systemPrompt,
  ]
    .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    .join('\n\n')
}

function requirePageDesignModule(options: PageDesignHeadlessRunOptions): PageDesignModule {
  if (options.pageDesign !== undefined) return options.pageDesign
  if (options.getEditToolHost === undefined) {
    throw new Error('runPageDesignHeadless requires either pageDesign or getEditToolHost')
  }
  return new PageDesignModule({ getEditToolHost: options.getEditToolHost })
}

function findBootstrapAction(projection: AiRuntimeKnowledgeProjection): string | null {
  const exposure = projection.availableFunctions.find((item) => {
    try {
      const parsed = AiInvocationProtocol.parseActionPath(item.action)
      return item.moduleId === 'lifecycle' && parsed.function === 'bootstrap'
    } catch {
      return false
    }
  })
  return exposure?.action ?? null
}

async function executePageDesignAction(options: {
  readonly pageDesign: PageDesignModule
  readonly pageId: string
  readonly instanceId: string
  readonly projection: AiRuntimeKnowledgeProjection
  readonly action: string
  readonly args: unknown
  readonly metadata?: Record<string, unknown> | undefined
}): Promise<AiRuntimeFunctionCallResult<unknown>> {
  return await options.pageDesign.executeFunctionCall({
    moduleId: PAGE_DESIGN_MODULE_ID,
    moduleInstanceId: options.pageId,
    instanceId: options.instanceId,
    action: options.action,
    args: options.args,
    projection: options.projection,
    ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
  })
}

function failedResult(code: string, msg: string, fix: string): AiRuntimeFunctionCallResult<unknown> {
  return { ok: false, code, msg, fix }
}

function getCoreSessionSnapshot(
  pageDesign: PageDesignModule,
  pageId: string,
  instanceId: string,
): AiRuntimeSessionRecord | null {
  return pageDesign.getSession({
    moduleId: PAGE_DESIGN_MODULE_ID,
    moduleInstanceId: pageId,
    instanceId,
  })
}

function normalizeToolCall(call: PageDesignLlmToolCall, round: number, index: number): Required<Pick<PageDesignLlmToolCall, 'id' | 'function'>> & PageDesignLlmToolCall {
  return {
    ...call,
    id: call.id ?? `call_${round}_${index}`,
    type: 'function',
    function: {
      name: call.function.name,
      arguments: call.function.arguments ?? '{}',
    },
  }
}

function createAssistantMessage(text: string, toolCalls: readonly PageDesignLlmToolCall[] | undefined): PageDesignLlmMessage {
  return {
    role: 'assistant',
    content: text,
    ...(toolCalls !== undefined && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  }
}

const FINAL_RESPONSE_REMINDER = [
  '请基于以上工具返回结果给出最终中文答复。',
  '要求：不要继续调用工具，不要返回空内容；如果用户是在询问页面用途，请说明页面作用、关键结构和可继续调整的方向。',
].join('\n')

export async function runPageDesignHeadless(
  options: PageDesignHeadlessRunOptions,
): Promise<PageDesignHeadlessRunResult> {
  const pageId = options.pageId.trim()
  if (pageId === '') {
    return {
      ok: false,
      pageId,
      instanceId: options.instanceId ?? '',
      rounds: 0,
      code: 'INVALID_PAGE_ID',
      msg: 'pageId 不能为空',
      fix: '传入当前要编辑的页面 pageId。',
      text: '',
      coreSession: null,
      toolResults: [],
    }
  }

  const pageDesign = requirePageDesignModule(options)
  const instanceId = options.instanceId ?? createInstanceId(pageId)
  const toolResults: PageDesignHeadlessToolResultEvent[] = []

  const projection = await pageDesign.startSession({
    moduleId: PAGE_DESIGN_MODULE_ID,
    moduleInstanceId: pageId,
    instanceId,
  })

  if (options.bootstrap !== false) {
    const bootstrapAction = findBootstrapAction(projection)
    if (bootstrapAction === null) {
      return {
        ok: false,
        pageId,
        instanceId,
        rounds: 0,
        code: 'BOOTSTRAP_ACTION_MISSING',
        msg: '当前 pageDesign 投影中缺少 lifecycle.bootstrap',
        fix: '检查 PageDesignModule lifecycle 注册是否完整。',
        text: '',
        projection,
        coreSession: getCoreSessionSnapshot(pageDesign, pageId, instanceId),
        toolResults,
      }
    }
    const result = await executePageDesignAction({
      pageDesign,
      pageId,
      instanceId,
      projection,
      action: bootstrapAction,
      args: {},
    })
    if (!result.ok) {
      return {
        ok: false,
        pageId,
        instanceId,
        rounds: 0,
        code: result.code,
        msg: result.msg,
        fix: result.fix,
        text: '',
        projection,
        coreSession: getCoreSessionSnapshot(pageDesign, pageId, instanceId),
        toolResults,
      }
    }
  }

  const catalog = projectPageDesignTools(projection)
  const messages: PageDesignLlmMessage[] = [
    {
      role: 'system',
      content: createSystemPrompt(projection, options.systemPrompt),
    },
    {
      role: 'user',
      content: options.prompt,
    },
  ]
  pageDesign.appendMessage({
    moduleId: PAGE_DESIGN_MODULE_ID,
    moduleInstanceId: pageId,
    instanceId,
    role: 'user',
    source: 'ui',
    content: options.prompt,
    ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
  })

  let latestText = ''
  const maxRounds = Math.max(1, Math.floor(options.maxRounds ?? 8))
  for (let round = 1; round <= maxRounds; round += 1) {
    const turn = await options.turn({
      messages,
      tools: catalog.tools,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.onDelta === undefined ? {} : { onDelta: options.onDelta }),
      ...(options.onReasoning === undefined ? {} : { onReasoning: options.onReasoning }),
      ...(options.onUsage === undefined ? {} : { onUsage: options.onUsage }),
    })
    latestText = turn.text
    const normalizedCalls = (turn.toolCalls ?? [])
      .map((call, index) => normalizeToolCall(call, round, index))

    if (normalizedCalls.length === 0) {
      if (turn.text.trim() === '' && toolResults.length > 0 && round < maxRounds) {
        messages.push(createAssistantMessage('', undefined))
        messages.push({
          role: 'user',
          content: FINAL_RESPONSE_REMINDER,
        })
        continue
      }

      messages.push(createAssistantMessage(turn.text, undefined))
      pageDesign.appendMessage({
        moduleId: PAGE_DESIGN_MODULE_ID,
        moduleInstanceId: pageId,
        instanceId,
        role: 'assistant',
        source: 'llm',
        content: turn.text,
        metadata: {
          ...(options.metadata ?? {}),
          round,
        },
      })
      if (options.stopWhenDone === true) {
        pageDesign.stopSession({
          moduleId: PAGE_DESIGN_MODULE_ID,
          moduleInstanceId: pageId,
          instanceId,
          reason: 'headless-run-completed',
        })
      }
      return {
        ok: true,
        pageId,
        instanceId,
        rounds: round,
        text: turn.text,
        projection,
        coreSession: getCoreSessionSnapshot(pageDesign, pageId, instanceId),
        toolResults,
      }
    }

    messages.push(createAssistantMessage(turn.text, normalizedCalls))
    for (const call of normalizedCalls) {
      const toolName = call.function.name
      const action = catalog.actionByToolName.get(toolName)
      const args = parseToolArgs(call.function.arguments)
      const started = nowMs()
      const baseEvent: PageDesignHeadlessToolEvent = {
        round,
        callId: call.id,
        toolName,
        action: action ?? '',
        args,
      }
      options.onToolCall?.(baseEvent)

      const result = action === undefined
        ? failedResult('UNKNOWN_TOOL', `模型调用了未投影的工具: ${toolName}`, '仅使用当前 tools 列表中的 function name。')
        : isRecord(args) && typeof args['__parseError'] === 'string'
          ? failedResult('INVALID_TOOL_ARGS', args['__parseError'], '重新以合法 JSON object 生成工具参数。')
          : await executePageDesignAction({
            pageDesign,
            pageId,
            instanceId,
            projection,
            action,
            args,
            metadata: {
              ...(options.metadata ?? {}),
              round,
              callId: call.id,
              toolName,
            },
          })
      const event: PageDesignHeadlessToolResultEvent = {
        ...baseEvent,
        result,
        durationMs: nowMs() - started,
      }
      toolResults.push(event)
      if (result.ok) {
        options.onToolResult?.(event)
      } else {
        options.onToolError?.(event)
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: safeJsonStringify(result),
      })
    }
  }

  return {
    ok: false,
    pageId,
    instanceId,
    rounds: maxRounds,
    code: 'MAX_ROUNDS_EXCEEDED',
    msg: `pageDesign headless runner 已达到最大轮数 ${maxRounds}`,
    fix: '提高 maxRounds，或让模型在完成页面修改后停止继续调用工具。',
    text: latestText,
    projection,
    coreSession: getCoreSessionSnapshot(pageDesign, pageId, instanceId),
    toolResults,
  }
}
