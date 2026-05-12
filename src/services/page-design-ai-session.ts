import { ref, type Ref } from 'vue'
import {
  PAGE_CONFIG_FILE_NAMES,
  createPageDocuments,
  type PageDesignEditHost,
  type PageDocumentRegistry,
  type PageConfigFileName,
} from '@spark-view/spark-page-config'
import {
  PAGE_DESIGN_MODULE_ID,
  PageDesignModule,
  runPageDesignHeadless,
  type AiRuntimeEvent,
  type AiRuntimeSessionSnapshot,
  type PageDesignHeadlessRunResult,
  type PageDesignLlmMessage,
  type PageDesignLlmToolCall,
  type PageDesignLlmToolDefinition,
  type PageDesignLlmTurn,
  type PageDesignLlmTurnRequest,
  type PageDesignLlmTurnResult,
} from '@spark-view/spark-ai'
import {
  readCache,
  streamWithFallback,
  writeCache,
  type AiChatSendRequest,
  type AiSessionConfig,
  type AiSessionToolLog,
} from '@spark-view/spark-component'
import { createFetchClient, type SSEEvent } from '@spark-view/spark-utils'
import { createAuthHeaders } from './http'
import { pageConfigWorkspaceDataService } from './page-config-workspace-data-service'

interface PageDesignAiSessionOptions {
  pageId: string
  title?: string | undefined
}

interface CreateAiBackendSessionResponse {
  sessionId: string
  protocolVersion: number
}

interface AiBackendTurnResponse {
  text?: string
  reasoning?: string
  toolCalls?: unknown[]
  usage?: Record<string, unknown>
}

const aiHttp = createFetchClient({ timeout: 300_000 })
const pageConfigService = pageConfigWorkspaceDataService.pageConfig
const sessions = new Map<string, PageDesignAppSession>()
const CORE_SNAPSHOT_PREFIX = 'spark-ai-core-session:page-design:'
const MAX_PAGE_DESIGN_ROUNDS = 32

aiHttp.interceptors.request.use({
  onRequest: (config) => {
    config.headers = { ...config.headers, ...createAuthHeaders() }
    return config
  },
})

function nowIso(): string {
  return new Date().toISOString()
}

function cloneJson<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') return value
  try {
    return structuredClone(value)
  } catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizePageTitle(pageId: string, title: string | undefined): string {
  if (title !== undefined && title.trim() !== '') return title
  if (pageId === 'work-evaluation') return '工作评价'
  return pageId
}

function createScope(pageId: string, instanceId: string): Record<string, unknown> {
  return {
    moduleId: PAGE_DESIGN_MODULE_ID,
    moduleInstanceId: pageId,
    instanceId,
    runtimeInstanceId: instanceId,
  }
}

function createCoreSnapshotKey(pageId: string): string {
  return `${CORE_SNAPSHOT_PREFIX}${pageId}`
}

function tryParseCoreSnapshot(raw: string | null): AiRuntimeSessionSnapshot | null {
  if (raw === null || raw.trim() === '') return null
  try {
    const parsed = JSON.parse(raw) as Partial<AiRuntimeSessionSnapshot>
    return parsed.version === 1 && parsed.session !== undefined
      ? parsed as AiRuntimeSessionSnapshot
      : null
  } catch {
    return null
  }
}

function toBackendMessage(message: PageDesignLlmMessage): Record<string, unknown> {
  return {
    role: message.role,
    content: message.content,
    ...(message.tool_calls !== undefined ? { tool_calls: cloneJson(message.tool_calls) } : {}),
    ...(message.tool_call_id !== undefined ? { tool_call_id: message.tool_call_id } : {}),
  }
}

function normalizeToolCalls(raw: unknown): PageDesignLlmToolCall[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const calls = raw.filter((item): item is PageDesignLlmToolCall => (
    isObject(item)
    && isObject(item['function'])
    && typeof item['function']['name'] === 'string'
  ))
  return calls.length > 0 ? calls : undefined
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    return isObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

function normalizeUsage(raw: unknown): Record<string, unknown> | undefined {
  return isObject(raw) ? raw : undefined
}

function parseBackendTurnResult(raw: string): AiBackendTurnResponse {
  const parsed = parseJsonObject(raw)
  if (parsed === null) return {}
  const text = parsed['text']
  const reasoning = parsed['reasoning']
  const toolCalls = parsed['toolCalls']
  const usage = normalizeUsage(parsed['usage'])
  return {
    ...(typeof text === 'string' ? { text } : {}),
    ...(typeof reasoning === 'string' ? { reasoning } : {}),
    ...(Array.isArray(toolCalls) ? { toolCalls } : {}),
    ...(usage !== undefined ? { usage } : {}),
  }
}

function parseBackendSseError(raw: string): string {
  const parsed = parseJsonObject(raw)
  if (parsed !== null) {
    const error = parsed['error']
    if (typeof error === 'string' && error.trim() !== '') return error.trim()
    const message = parsed['message']
    if (typeof message === 'string' && message.trim() !== '') return message.trim()
  }
  const trimmed = raw.trim()
  return trimmed !== '' ? trimmed : '后端 AI SSE 流返回错误'
}

function toToolPayload(tools: readonly PageDesignLlmToolDefinition[]): Array<Record<string, unknown>> {
  return tools.map(tool => cloneJson(tool) as unknown as Record<string, unknown>)
}

function latestUserPrompt(request: AiChatSendRequest): string {
  const latest = [...request.historyMsgs].reverse().find(message => message.role === 'user')?.content.trim()
  if (!latest) return ''
  const previous = request.historyMsgs
    .slice(0, -1)
    .filter(message => message.content.trim() !== '')
    .slice(-6)
    .map(message => `${message.role}: ${message.content}`)
    .join('\n')
  return previous === ''
    ? latest
    : `以下是最近对话上下文：\n${previous}\n\n本轮页面设计需求：\n${latest}`
}

function summarizeRunFailure(result: Extract<PageDesignHeadlessRunResult, { ok: false }>): string {
  return `[${result.code}] ${result.msg}。建议：${result.fix}`
}

function stripPageDesignToolPrefix(toolName: string): string {
  return toolName.replace(/^pageDesign_/, '')
}

function summarizeSilentSuccess(result: Extract<PageDesignHeadlessRunResult, { ok: true }>): string {
  const toolNames = [...new Set(result.toolResults.map(item => stripPageDesignToolPrefix(item.toolName)))]
  if (toolNames.length === 0) {
    return '已完成本轮 AI 协同设计，但模型没有返回可展示文本。'
  }
  return [
    '已完成本轮工具分析，但模型没有返回文字说明。',
    '',
    `已执行 ${result.toolResults.length} 次工具调用：${toolNames.join('、')}。`,
    '可以继续输入具体修改要求，AI 会基于当前页面四文件继续处理。',
  ].join('\n')
}

class PageDesignAppSession {
  readonly logs: Ref<AiSessionToolLog[]> = ref([])

  private readonly pageId: string
  private readonly instanceId: string
  private readonly docs: PageDocumentRegistry = createPageDocuments()
  private readonly pageDesign: PageDesignModule
  private loaded = false
  private loading: Promise<void> | null = null
  private saveQueue: Promise<void> = Promise.resolve()

  constructor(pageId: string) {
    this.pageId = pageId
    this.instanceId = `app-page-design:${pageId}`
    this.pageDesign = new PageDesignModule({
      getEditToolHost: () => this.createEditHost(),
    })
    this.pageDesign.subscribe((event) => this.handleRuntimeEvent(event))
    this.restoreCoreSnapshot()
  }

  createConfig(title: string | undefined): AiSessionConfig {
    const normalizedTitle = normalizePageTitle(this.pageId, title)
    return {
      storageKey: `spark-ai-session:page-design:${this.pageId}`,
      pageId: `page-design:${this.pageId}`,
      title: `AI 协同设计 · ${normalizedTitle}`,
      placeholder: `描述要怎样调整「${normalizedTitle}」页面`,
      sender: (request) => this.send(request),
      externalToolLogs: this.logs,
      clearExternalToolLogs: () => {
        this.logs.value = []
      },
      turnConcurrency: { maxParallelTurns: 1, overflow: 'queue' },
      draftActions: [
        {
          id: 'page-design-diagnostics',
          label: '诊断快照',
          icon: 'Document',
          prefix: '请基于下面的诊断快照分析失败原因：',
          builder: () => this.exportDiagnostics(),
        },
      ],
    }
  }

  private pushLog(type: AiSessionToolLog['type'], tag: string, text: string): void {
    this.logs.value.push({ type, tag, text, timestamp: nowIso() })
  }

  private async ensureLoaded(force = false): Promise<void> {
    if (this.loaded && !force) return
    if (this.loading !== null && !force) return this.loading

    this.loading = (async () => {
      const files = await pageConfigService.readFiles(this.pageId, {
        forceReload: force,
        missing: 'empty',
      })
      this.docs['rule.json'].loadFromText(files['rule.json'], { markSaved: true })
      this.docs['pagedata.json'].loadFromText(files['pagedata.json'], { markSaved: true })
      this.docs['script.js'].loadFromText(files['script.js'], { markSaved: true })
      this.docs['style.css'].loadFromText(files['style.css'], { markSaved: true })
      this.loaded = true
      this.pushLog('success', 'page-load', `已加载页面四文件：${this.pageId}`)
    })()

    try {
      await this.loading
    } finally {
      this.loading = null
    }
  }

  private enqueueSave(filename: PageConfigFileName, content: string): void {
    this.saveQueue = this.saveQueue
      .then(async () => {
        await pageConfigService.saveFileContent(this.pageId, filename, content)
        this.docs[filename].markSaved()
        this.pushLog('success', 'page-save', `${filename} 已保存`)
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        this.pushLog('error', 'page-save', `${filename} 保存失败：${message}`)
      })
  }

  private createEditHost(): PageDesignEditHost {
    return {
      getNodeTree: () => this.docs['rule.json'].model.value,
      onNodeTreeChanged: () => {
        this.enqueueSave('rule.json', this.docs['rule.json'].text.value)
      },
      getDataSetTool: () => this.docs['pagedata.json'].model.value,
      onDataSetChanged: () => {
        this.enqueueSave('pagedata.json', this.docs['pagedata.json'].text.value)
      },
      readScript: () => this.docs['script.js'].text.value,
      writeScript: (content: string) => {
        this.docs['script.js'].setText(content)
        this.enqueueSave('script.js', this.docs['script.js'].text.value)
      },
      readStyle: () => this.docs['style.css'].text.value,
      writeStyle: (content: string) => {
        this.docs['style.css'].setText(content)
        this.enqueueSave('style.css', this.docs['style.css'].text.value)
      },
    }
  }

  private async send(request: AiChatSendRequest): Promise<void> {
    const prompt = latestUserPrompt(request)
    if (prompt === '') {
      throw new Error('请输入页面设计需求')
    }

    await this.ensureLoaded()
    const turn = this.createBackendTurn(request)
    let runResult: PageDesignHeadlessRunResult | null = null
    await streamWithFallback(request, {
      runLoop: async (pushDelta) => {
        try {
          const result = await runPageDesignHeadless({
            pageId: this.pageId,
            instanceId: this.instanceId,
            pageDesign: this.pageDesign,
            prompt,
            turn,
            maxRounds: MAX_PAGE_DESIGN_ROUNDS,
            bootstrap: true,
            stopWhenDone: false,
            onDelta: pushDelta,
            ...(request.onReasoning === undefined ? {} : { onReasoning: request.onReasoning }),
            ...(request.onUsage === undefined ? {} : { onUsage: request.onUsage }),
            metadata: {
              source: 'app-ai-panel',
              pageId: this.pageId,
              turnId: request.turn?.turnId,
            },
            onToolCall: (event) => {
              this.pushLog('info', 'tool-call', `第 ${event.round} 轮调用 ${event.toolName}`)
              request.onSseEvent?.({
                type: 'tool-call',
                data: JSON.stringify({ pageId: this.pageId, ...event }),
              })
            },
            onToolResult: (event) => {
              const summary = event.result.ok ? event.result.summary : event.result.msg
              this.pushLog('success', 'tool-result', summary)
              request.onFcCall?.({
                toolName: event.toolName,
                args: event.args,
                round: event.round,
                callId: event.callId,
                status: 'success',
                result: event.result,
                durationMs: event.durationMs,
              })
            },
            onToolError: (event) => {
              const resultMessage = event.result.ok ? '未知错误' : `${event.result.code}: ${event.result.msg}`
              this.pushLog('error', 'tool-error', resultMessage)
              request.onFcCall?.({
                toolName: event.toolName,
                args: event.args,
                round: event.round,
                callId: event.callId,
                status: 'error',
                error: resultMessage,
                result: event.result,
                durationMs: event.durationMs,
              })
            },
          })
          runResult = result
          if (!result.ok) {
            throw new Error(summarizeRunFailure(result))
          }
        } finally {
          await this.saveQueue
          this.persistCoreSnapshot()
        }
      },
      getFallbackMessage: () => {
        return runResult?.ok
          ? { text: summarizeSilentSuccess(runResult) }
          : null
      },
      defaultDeltaOnEmpty: '已完成本轮 AI 协同设计。',
    })
  }

  private createBackendTurn(chatRequest: AiChatSendRequest): PageDesignLlmTurn {
    let sessionId: string | null = null
    let nextAppendIndex = 2

    return async (request: PageDesignLlmTurnRequest): Promise<PageDesignLlmTurnResult> => {
      if (chatRequest.signal?.aborted || request.signal?.aborted) {
        throw new Error('AI 会话已取消')
      }

      if (sessionId === null) {
        sessionId = await this.createBackendSession(request)
      } else {
        await this.appendBackendMessages(sessionId, request.messages.slice(nextAppendIndex))
      }

      const response = await this.executeBackendStreamTurn(sessionId, request, chatRequest)
      const toolCalls = normalizeToolCalls(response.toolCalls)
      nextAppendIndex = toolCalls !== undefined && toolCalls.length > 0
        ? request.messages.length
        : request.messages.length + 1
      return {
        text: response.text ?? '',
        ...(response.reasoning !== undefined ? { reasoning: response.reasoning } : {}),
        ...(response.usage !== undefined ? { usage: response.usage } : {}),
        ...(toolCalls !== undefined ? { toolCalls } : {}),
      }
    }
  }

  private async executeBackendStreamTurn(
    sessionId: string,
    request: PageDesignLlmTurnRequest,
    chatRequest: AiChatSendRequest,
  ): Promise<AiBackendTurnResponse> {
    const signal = request.signal ?? chatRequest.signal
    const streamRequest: Parameters<typeof aiHttp.streamSSE>[0] = {
      url: `/api/ai/sessions/${encodeURIComponent(sessionId)}/turn/stream`,
      method: 'POST',
      data: {
        protocolVersion: 3,
        stream: true,
        scope: createScope(this.pageId, this.instanceId),
      },
      timeout: 300_000,
    }
    if (signal !== undefined) {
      streamRequest.signal = signal
    }
    const events = await aiHttp.streamSSE(streamRequest)

    let text = ''
    let reasoning = ''
    let usage: Record<string, unknown> | undefined
    let toolCalls: PageDesignLlmToolCall[] | undefined
    let finalText: string | undefined
    let finalReasoning: string | undefined
    let streamedText = false
    let streamedReasoning = false

    for await (const event of events) {
      const eventType = event.event ?? 'message'
      this.forwardBackendSseEvent(sessionId, eventType, event, chatRequest)

      switch (eventType) {
        case 'delta':
          text += event.data
          streamedText = true
          request.onDelta?.(event.data)
          break
        case 'reasoning':
          reasoning += event.data
          streamedReasoning = true
          request.onReasoning?.(event.data)
          break
        case 'usage': {
          const parsedUsage = normalizeUsage(parseJsonObject(event.data))
          if (parsedUsage !== undefined) {
            usage = parsedUsage
            request.onUsage?.(parsedUsage)
          }
          break
        }
        case 'result': {
          const result = parseBackendTurnResult(event.data)
          if (result.text !== undefined) finalText = result.text
          if (result.reasoning !== undefined) finalReasoning = result.reasoning
          if (result.usage !== undefined) {
            usage = result.usage
            request.onUsage?.(result.usage)
          }
          const normalizedToolCalls = normalizeToolCalls(result.toolCalls)
          if (normalizedToolCalls !== undefined) toolCalls = normalizedToolCalls
          break
        }
        case 'error':
          throw new Error(parseBackendSseError(event.data))
        case 'done':
          break
        default:
          break
      }

      if (eventType === 'done') break
    }

    const resultText = finalText ?? text
    const resultReasoning = finalReasoning ?? (reasoning === '' ? undefined : reasoning)
    if (!streamedText && resultText !== '') request.onDelta?.(resultText)
    if (!streamedReasoning && resultReasoning !== undefined) request.onReasoning?.(resultReasoning)

    return {
      text: resultText,
      ...(resultReasoning !== undefined ? { reasoning: resultReasoning } : {}),
      ...(usage !== undefined ? { usage } : {}),
      ...(toolCalls !== undefined ? { toolCalls } : {}),
    }
  }

  private forwardBackendSseEvent(
    sessionId: string,
    eventType: string,
    event: SSEEvent,
    chatRequest: AiChatSendRequest,
  ): void {
    chatRequest.onSseEvent?.({
      sessionId,
      type: eventType,
      data: event.data,
    })
  }

  private async createBackendSession(request: PageDesignLlmTurnRequest): Promise<string> {
    const systemPrompt = request.messages.find(message => message.role === 'system')?.content ?? ''
    const userPrompt = request.messages.find(message => message.role === 'user')?.content ?? ''
    const response = await aiHttp.post<CreateAiBackendSessionResponse>('/api/ai/sessions', {
      protocolVersion: 3,
      systemPrompt,
      userPrompt,
      windowSize: 40,
      tools: toToolPayload(request.tools),
      mode: 'function',
      reuseScopeSession: false,
      scope: createScope(this.pageId, this.instanceId),
    })
    this.pushLog('success', 'ai-session', `后端会话已创建：${response.sessionId}`)
    return response.sessionId
  }

  private async appendBackendMessages(sessionId: string, messages: readonly PageDesignLlmMessage[]): Promise<void> {
    if (messages.length === 0) return
    await aiHttp.post(`/api/ai/sessions/${encodeURIComponent(sessionId)}/append`, {
      protocolVersion: 3,
      messages: messages.map(toBackendMessage),
      scope: createScope(this.pageId, this.instanceId),
    })
  }

  private handleRuntimeEvent(event: AiRuntimeEvent): void {
    if ('scope' in event && event.scope.moduleInstanceId !== this.pageId) return
    switch (event.type) {
      case 'session.hydrated':
        this.pushLog('success', 'core-session', '已恢复核心会话快照')
        break
      case 'history.function.failed':
        this.pushLog('error', 'core-fc', `${event.entry.action} 执行失败`)
        break
      case 'history.function.completed':
        this.pushLog('success', 'core-fc', `${event.entry.action} 执行完成`)
        break
      case 'module.registered':
      case 'session.started':
      case 'session.stopped':
      case 'history.message.appended':
      case 'history.function.requested':
        break
      default:
        break
    }
    this.persistCoreSnapshot()
  }

  private restoreCoreSnapshot(): void {
    const snapshot = tryParseCoreSnapshot(readCache(createCoreSnapshotKey(this.pageId)))
    if (snapshot === null) return
    try {
      this.pageDesign.hydrateSessionSnapshot(snapshot)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.pushLog('error', 'core-session', `核心会话恢复失败：${message}`)
    }
  }

  private persistCoreSnapshot(): void {
    const snapshot = this.pageDesign.exportSessionSnapshot(this.pageId)
    if (snapshot === null) return
    writeCache(createCoreSnapshotKey(this.pageId), JSON.stringify(snapshot))
  }

  private async exportDiagnostics(): Promise<string> {
    await this.ensureLoaded()
    const snapshot = this.pageDesign.exportSessionSnapshot(this.pageId)
    const files = Object.fromEntries(
      PAGE_CONFIG_FILE_NAMES.map((filename) => [
        filename,
        {
          loaded: this.docs[filename].loadState.value,
          dirty: this.docs[filename].text.value !== this.docs[filename].savedText.value,
          parseError: this.docs[filename].parseError.value,
          bytes: new Blob([this.docs[filename].text.value]).size,
        },
      ]),
    )
    return JSON.stringify({
      pageId: this.pageId,
      instanceId: this.instanceId,
      exportedAt: nowIso(),
      files,
      logs: this.logs.value,
      coreSession: snapshot,
    }, null, 2)
  }
}

function getPageSession(pageId: string): PageDesignAppSession {
  let session = sessions.get(pageId)
  if (session === undefined) {
    session = new PageDesignAppSession(pageId)
    sessions.set(pageId, session)
  }
  return session
}

export function createPageDesignAiSessionConfig(options: PageDesignAiSessionOptions): AiSessionConfig {
  return getPageSession(options.pageId).createConfig(options.title)
}
