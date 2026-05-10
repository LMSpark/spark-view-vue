import { onUnmounted, ref, shallowRef } from 'vue'
import type { ToolLogEntry } from '@spark-view/spark-component'
import {
  PageDesignEditActionClassifier,
  PageDesignEditRuntimePrompt,
  type AiRuntimeFunctionCallResult,
  type AiRuntimeFunctionExposure,
  type EditToolHost,
  type PageDesignNodeTree,
} from '@spark-view/spark-ai'
import type { PageModelBackendMessage, PageModelFunctionContext, PageModelSessionHost } from './usePageModelSessionHost'

export type LogEntry = ToolLogEntry

export interface DialogueToolBlock {
  id?: string
  action: string
  params: unknown
}

export interface DialogueTurn {
  round: number
  timestamp: string
  phase: 'assistant' | 'function-execute'
  text?: string
  reasoning?: string
  toolBlock?: DialogueToolBlock
  functionResult?: AiRuntimeFunctionCallResult<unknown>
  elapsed?: number
}

export interface RepeatDetectionConfig {
  maxSameSignature?: number
  maxConsecutiveErrors?: number
  maxCyclePeriod?: number
  cycleRepeatThreshold?: number
  maxReadOnlyActions?: number
  abortOnReadOnlyLimit?: boolean
  maxRepeatedFailureRetries?: number
}

export interface PageModelEditSessionOptions {
  getSessionKey: () => string
  getEditToolHost: () => EditToolHost
  sessionHost: PageModelSessionHost
  ensureContextLoaded?: () => Promise<void>
}

export interface PageModelEditRunHooks {
  onDelta?: (delta: string) => void
  onReasoning?: (reasoning: string) => void
  onSseEvent?: (event: { sessionId: string; type: string; data: string }) => void
  onToolTurn?: (turn: DialogueTurn) => void
  onRunComplete?: (payload: { rounds: number; writeCount: number }) => void
  signal?: AbortSignal
}

interface PageModelEditRunOptions extends PageModelEditRunHooks {
  originalUserInput?: string
  skipBootstrap?: boolean
  maxRounds?: number
  maxParallelTurns?: number
  toolMode?: 'all' | 'describe-only'
  repeatDetection?: RepeatDetectionConfig
}

interface PageModelEditBootstrapOptions {
  silent?: boolean
  skipContextLoad?: boolean
}

interface ParsedToolCall {
  id?: string
  name: string
  args: unknown
  raw: Record<string, unknown>
}

const PAGE_MODEL_SUPPORTED_TOOL_MODULES = new Set([
  'lifecycle',
  'textModel',
  'knowledge',
  'nodeTree',
  'dataset',
])

const PAGE_MODEL_BLOCKED_ACTION_SEGMENTS = [
  '@jsonDoc@',
  '__jsonDoc__',
]

const SESSION_RECOVERY_ERROR_CODES = new Set([
  'INVALID_STATE_TRANSITION',
  'HANDOFF_REQUIRED',
  'SESSION_SCOPE_MISMATCH',
])

function nowIso(): string {
  return new Date().toISOString()
}

function appendLog(log: { value: LogEntry[] }, entry: Omit<LogEntry, 'timestamp'>): void {
  log.value = [
    ...log.value,
    {
      ...entry,
      timestamp: nowIso(),
    },
  ]
}

function toObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function inferLeafJsonSchema(description: string): Record<string, unknown> {
  const lower = description.toLowerCase()
  const nullable = lower.includes('null') || description.includes('?')
  const baseType = lower.includes('number')
    ? 'number'
    : lower.includes('boolean')
      ? 'boolean'
      : lower.includes('array')
        ? 'array'
        : lower.includes('object') || lower.includes('json')
          ? 'object'
          : 'string'
  return nullable ? { type: [baseType, 'null'] } : { type: baseType }
}

function projectSchemaNode(node: unknown): Record<string, unknown> {
  if (typeof node === 'string') return inferLeafJsonSchema(node)
  if (Array.isArray(node)) return { type: 'array', items: {} }

  const objectNode = toObject(node)
  if (objectNode === null) return {}

  const kind = typeof objectNode['kind'] === 'string' ? objectNode['kind'] : undefined
  if (kind === 'array') {
    const items = objectNode['items'] !== undefined ? projectSchemaNode(objectNode['items']) : {}
    return { type: 'array', items }
  }

  const rawProperties = toObject(objectNode['properties']) ?? objectNode
  const rawOptional = toObject(objectNode['optional'])
  const properties: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rawProperties)) {
    if (key === 'kind' || key === 'required' || key === 'optional' || key === 'note') continue
    properties[key] = projectSchemaNode(value)
  }
  if (rawOptional !== null) {
    for (const [key, value] of Object.entries(rawOptional)) {
      properties[key] = projectSchemaNode(value)
    }
  }

  const required = Array.isArray(objectNode['required'])
    ? objectNode['required'].filter((item): item is string => typeof item === 'string')
    : []

  return {
    type: 'object',
    properties,
    additionalProperties: true,
    ...(required.length > 0 ? { required } : {}),
  }
}

function createToolProjection(functions: readonly AiRuntimeFunctionExposure[]): {
  tools: ReadonlyArray<Record<string, unknown>>
  nameToAction: ReadonlyMap<string, string>
  nameToDefinition: ReadonlyMap<string, AiRuntimeFunctionExposure>
} {
  const nameToAction = new Map<string, string>()
  const nameToDefinition = new Map<string, AiRuntimeFunctionExposure>()
  const tools = functions.map((definition) => {
    const name = definition.action.replace(/[^a-zA-Z0-9_-]/g, '__')
    nameToAction.set(name, definition.action)
    nameToDefinition.set(name, definition)
    const usageRules = definition.usageRules?.length ? `\n\n关键规则:\n${definition.usageRules.join('\n')}` : ''
    const failureModes = definition.failureModes?.length
      ? `\n\n失败模式:\n${definition.failureModes.map(mode => `${mode.code}: ${mode.when}; 修复: ${mode.fix}`).join('\n')}`
      : ''
    return {
      type: 'function',
      function: {
        name,
        description: `${definition.action}\n${definition.description}${usageRules}${failureModes}`,
        parameters: projectSchemaNode(definition.paramsSchema),
      },
    }
  })
  return { tools, nameToAction, nameToDefinition }
}

function isSupportedPageModelTool(definition: AiRuntimeFunctionExposure): boolean {
  if (!PAGE_MODEL_SUPPORTED_TOOL_MODULES.has(definition.moduleId)) return false
  return !PAGE_MODEL_BLOCKED_ACTION_SEGMENTS.some(segment => definition.action.includes(segment))
}

function isBlockedPageModelAction(action: string): boolean {
  return PAGE_MODEL_BLOCKED_ACTION_SEGMENTS.some(segment => action.includes(segment))
}

function findProjectedAction(
  functions: readonly AiRuntimeFunctionExposure[],
  moduleId: string,
  functionId: string,
): string {
  const found = functions.find(definition => definition.moduleId === moduleId && definition.functionId === functionId)
  if (found === undefined) {
    throw new Error(`AI 工具未投影：${moduleId}@${functionId}`)
  }
  return found.action
}

function parseToolCall(raw: Record<string, unknown>): ParsedToolCall | null {
  const functionBlock = toObject(raw['function'])
  if (functionBlock === null) return null
  const name = typeof functionBlock['name'] === 'string' ? functionBlock['name'] : null
  if (name === null) return null

  const argsText = typeof functionBlock['arguments'] === 'string' ? functionBlock['arguments'] : '{}'
  let args: unknown
  try {
    args = JSON.parse(argsText)
  } catch {
    args = {}
  }

  const id = typeof raw['id'] === 'string' ? raw['id'] : undefined
  return {
    ...(id !== undefined ? { id } : {}),
    name,
    args,
    raw,
  }
}

function normalizeToolCalls(value: unknown): ParsedToolCall[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => toObject(item))
    .filter((item): item is Record<string, unknown> => item !== null)
    .map(parseToolCall)
    .filter((item): item is ParsedToolCall => item !== null)
}

function stringifyToolPayload(value: unknown): string {
  try {
    const seen = new WeakSet<object>()
    const serialized = JSON.stringify(value, (_key, nested: unknown) => {
      if (typeof nested === 'bigint') return nested.toString()
      if (nested === null || typeof nested !== 'object') return nested
      if (seen.has(nested)) return '[Circular]'
      seen.add(nested)
      return nested
    })
    return typeof serialized === 'string' ? serialized : String(value)
  } catch {
    return String(value)
  }
}

function extractBackendErrorCode(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object') return undefined
  const response = (error as { response?: unknown }).response
  if (response === null || typeof response !== 'object') return undefined
  const envelopeError = (response as Record<string, unknown>)['error']
  if (envelopeError === null || typeof envelopeError !== 'object') return undefined
  const code = (envelopeError as Record<string, unknown>)['code']
  return typeof code === 'string' && code.trim() !== '' ? code : undefined
}

function isRecoverableSessionError(error: unknown): boolean {
  const code = extractBackendErrorCode(error)
  return code !== undefined && SESSION_RECOVERY_ERROR_CODES.has(code)
}

function toolResultMessage(call: ParsedToolCall, result: AiRuntimeFunctionCallResult<unknown>): PageModelBackendMessage {
  return {
    role: 'tool',
    content: stringifyToolPayload(result),
    ...(call.id !== undefined ? { tool_call_id: call.id } : {}),
  }
}

export function usePageModelEditSession(options: PageModelEditSessionOptions) {
  const editActionClassifier = new PageDesignEditActionClassifier()
  const runtimePrompt = new PageDesignEditRuntimePrompt()
  const ready = ref(false)
  const dirty = ref(false)
  const busy = ref(false)
  const aiBuffer = ref('')
  const log = ref<LogEntry[]>([])
  const nodeTree = shallowRef<PageDesignNodeTree | null>(null)

  function refreshLiveNodeTree(): void {
    nodeTree.value = options.getEditToolHost().getNodeTree?.() ?? null
  }

  async function bootstrap(bootstrapOptions: PageModelEditBootstrapOptions = {}): Promise<void> {
    if (bootstrapOptions.skipContextLoad !== true) {
      await options.ensureContextLoaded?.()
    }
    const context = await options.sessionHost.ensureSession()
    const bootstrapAction = findProjectedAction(context.availableFunctions, 'lifecycle', 'bootstrap')
    const output = await options.sessionHost.executeFunctionCall({
      scopeKey: context.scopeKey,
      instanceId: context.instanceId,
      action: bootstrapAction,
      args: {},
    })
    refreshLiveNodeTree()
    ready.value = output.result.ok
    if (output.result.ok) {
      if (bootstrapOptions.silent !== true) {
        appendLog(log, { type: 'success', tag: 'bootstrap', text: output.result.summary })
      }
      return
    }
    appendLog(log, { type: 'error', tag: output.result.code, text: output.result.msg })
    throw new Error(output.result.msg)
  }

  async function ensureBackendSession(
    context: PageModelFunctionContext,
    prompt: string,
    tools: ReadonlyArray<Record<string, unknown>>,
    isolated: boolean,
    signal?: AbortSignal,
  ): Promise<string> {
    const resume = options.sessionHost.getResumeSessionOptions(context.scopeKey)
    if (!isolated && resume.resumeSessionId !== undefined) {
      await options.sessionHost.appendBackendMessages([{ role: 'user', content: prompt }], signal, context.scopeKey)
      return resume.resumeSessionId
    }
    return await options.sessionHost.createBackendSession({
      context,
      systemPrompt: runtimePrompt.content,
      userPrompt: prompt,
      tools,
      reuseScopeSession: !isolated,
      bindToScope: !isolated,
      ...(signal !== undefined ? { signal } : {}),
    })
  }

  async function runLlm(prompt: string, hooks: PageModelEditRunOptions = {}): Promise<void> {
    if (hooks.skipBootstrap !== true) {
      await bootstrap({ silent: true })
    }

    const context = await options.sessionHost.ensureSession()
    const supportedFunctions = context.availableFunctions.filter(isSupportedPageModelTool)
    const availableFunctions = hooks.toolMode === 'describe-only'
      ? supportedFunctions.filter(definition => !editActionClassifier.isWriteAction(definition.functionId))
      : supportedFunctions
    const projection = createToolProjection(availableFunctions)

    busy.value = true
    aiBuffer.value = ''
    let rounds = 0
    let writeCount = 0
    const isolatedBackendSession = (hooks.maxParallelTurns ?? 1) > 1
    let activeBackendSessionId: string | undefined

    try {
      await options.sessionHost.appendRuntimeMessage({
        context,
        role: 'user',
        content: hooks.originalUserInput ?? prompt,
      })
      activeBackendSessionId = await ensureBackendSession(
        context,
        prompt,
        projection.tools,
        isolatedBackendSession,
        hooks.signal,
      )

      const maxRounds = hooks.maxRounds ?? 8
      while (rounds < maxRounds) {
        rounds += 1
        const turnStartedAt = performance.now()
        let turn: Awaited<ReturnType<PageModelSessionHost['executeBackendTurn']>>
        try {
          turn = await options.sessionHost.executeBackendTurn(
            hooks.signal,
            context.scopeKey,
            activeBackendSessionId,
          )
        } catch (error) {
          if (!isRecoverableSessionError(error)) {
            throw error
          }
          if (isolatedBackendSession && activeBackendSessionId !== undefined) {
            await options.sessionHost.destroyBackendSessionById(activeBackendSessionId, hooks.signal)
          } else {
            await options.sessionHost.destroyBackendSession(context.scopeKey, hooks.signal)
          }
          activeBackendSessionId = await options.sessionHost.createBackendSession({
            context,
            systemPrompt: runtimePrompt.content,
            userPrompt: prompt,
            tools: projection.tools,
            reuseScopeSession: !isolatedBackendSession,
            bindToScope: !isolatedBackendSession,
            ...(hooks.signal !== undefined ? { signal: hooks.signal } : {}),
          })
          turn = await options.sessionHost.executeBackendTurn(
            hooks.signal,
            context.scopeKey,
            activeBackendSessionId,
          )
        }
        if (turn.reasoning !== undefined && turn.reasoning !== '') {
          hooks.onReasoning?.(turn.reasoning)
        }
        if (turn.text !== '') {
          aiBuffer.value += turn.text
          hooks.onDelta?.(turn.text)
          appendLog(log, { type: 'info', tag: 'assistant', text: turn.text })
        }
        hooks.onSseEvent?.({
          sessionId: activeBackendSessionId
            ?? options.sessionHost.getResumeSessionOptions(context.scopeKey).resumeSessionId
            ?? context.instanceId,
          type: 'turn',
          data: JSON.stringify(turn),
        })

        const toolCalls = normalizeToolCalls(turn.toolCalls)
        if (toolCalls.length === 0) break

        const toolMessages: PageModelBackendMessage[] = []
        for (const call of toolCalls) {
          const actionText = projection.nameToAction.get(call.name)
          if (actionText === undefined) {
            throw new Error(`未知 AI 工具调用：${call.name}`)
          }
          const definition = projection.nameToDefinition.get(call.name)
          const action = actionText
          const output = isBlockedPageModelAction(action)
            ? {
              result: {
                ok: false,
                code: 'TOOL_NOT_ALLOWED_IN_PAGE_MODEL',
                msg: `页面模型级编辑禁止执行工具：${action}`,
                fix: '请改用 lifecycle/textModel/nodeTree/dataset/knowledge 路径完成任务，不要调用 jsonDoc。',
              } as AiRuntimeFunctionCallResult<unknown>,
            }
            : await options.sessionHost.executeFunctionCall({
              scopeKey: context.scopeKey,
              instanceId: context.instanceId,
              action,
              args: call.args,
            })
          if (definition !== undefined && editActionClassifier.isWriteAction(definition.functionId) && output.result.ok) writeCount += 1
          const elapsed = Math.max(0, Math.round(performance.now() - turnStartedAt))
          const dialogueTurn: DialogueTurn = {
            round: rounds,
            timestamp: nowIso(),
            phase: 'function-execute',
            toolBlock: {
              ...(call.id !== undefined ? { id: call.id } : {}),
              action,
              params: call.args,
            },
            functionResult: output.result,
            elapsed,
          }
          hooks.onToolTurn?.(dialogueTurn)
          appendLog(log, {
            type: output.result.ok ? 'success' : 'error',
            tag: action,
            text: output.result.ok ? output.result.summary : output.result.msg,
          })
          toolMessages.push(toolResultMessage(call, output.result))
        }

        await options.sessionHost.appendBackendMessages(
          toolMessages,
          hooks.signal,
          context.scopeKey,
          activeBackendSessionId,
        )
      }

      if (rounds >= maxRounds) {
        appendLog(log, { type: 'error', tag: 'MAX_ROUNDS', text: `AI 工具循环达到最大轮次 ${maxRounds}` })
      }
      hooks.onRunComplete?.({ rounds, writeCount })
      refreshLiveNodeTree()
      dirty.value = dirty.value || writeCount > 0
    } finally {
      if (isolatedBackendSession && activeBackendSessionId !== undefined) {
        await options.sessionHost.destroyBackendSessionById(activeBackendSessionId, hooks.signal)
      }
      busy.value = false
    }
  }

  function clearLog(): void {
    log.value = []
  }

  function reset(): void {
    ready.value = false
    dirty.value = false
    busy.value = false
    aiBuffer.value = ''
    log.value = []
    nodeTree.value = null
  }

  onUnmounted(() => {
    reset()
  })

  return {
    ready,
    dirty,
    busy,
    aiBuffer,
    log,
    nodeTree,
    bootstrap,
    runLlm,
    clearLog,
    reset,
  }
}
