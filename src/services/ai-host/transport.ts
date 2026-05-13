import type {
  AiSseEventInput,
  FileAttachment,
} from '@spark-view/spark-component'
import {
  AiInvocationProtocol,
} from '@spark-view/spark-ai'
import { createAuthHeaders } from '@/services/http'
import {
  createAppAiStreamKey,
  toRuntimeScope,
} from './scope'
import type {
  AppAiAppendMessagesInput,
  AppAiHostTransport,
  AppAiRouteBusinessInput,
  AppAiRouteDecision,
  AppAiStreamTurnInput,
  AppAiStreamTurnResult,
  AppAiTransportToolCall,
} from './types'

const PROTOCOL_VERSION = 3

export type AppAiHeaderProvider = () => Record<string, string>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const json = AiInvocationProtocol.extractFirstJsonObject(text)
  if (json === null) return null
  const parsed = tryParseJson(json)
  return isRecord(parsed) ? parsed : null
}

function normalizeRouteDecision(value: unknown): AppAiRouteDecision {
  if (!isRecord(value)) return { moduleId: null, confidence: 0, reason: '路由模型没有返回 JSON 对象。' }
  const moduleId = typeof value['moduleId'] === 'string' && value['moduleId'].trim().length > 0
    ? value['moduleId'].trim()
    : null
  const confidence = typeof value['confidence'] === 'number' && Number.isFinite(value['confidence'])
    ? Math.max(0, Math.min(1, value['confidence']))
    : 0
  const reason = typeof value['reason'] === 'string' ? value['reason'] : ''
  return { moduleId, confidence, reason }
}

function appendEventMetadata(
  event: AiSseEventInput,
  input: AppAiStreamTurnInput,
  eventModuleId = 'llm',
): AiSseEventInput {
  const streamKey = createAppAiStreamKey(input.scope, eventModuleId, input.turn.turnId)
  return {
    ...event,
    sessionId: input.sessionId,
    streamKey,
    scope: {
      businessRegistrationId: input.scope.businessRegistrationId,
      businessInstanceId: input.scope.businessInstanceId,
      eventModuleId,
      turnId: input.turn.turnId,
    },
  }
}

function buildRoutePrompt(input: AppAiRouteBusinessInput): string {
  return [
    '你是 SPARK 的 AI 业务路由器。只能从候选注册信息中选择业务。',
    '请只返回一个 JSON 对象，不要输出额外解释。',
    'JSON 形状：{"moduleId": string|null, "confidence": number, "reason": string}',
    '如果用户意图不清晰，moduleId 返回 null，confidence 小于 0.65。',
    `候选业务注册信息：${JSON.stringify(input.candidates)}`,
    `用户输入：${input.userInput}`,
  ].join('\n\n')
}

async function readTextResponse(response: Response): Promise<string> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || `HTTP ${response.status}`)
  }
  return text
}

async function assertResponseOk(response: Response): Promise<void> {
  if (!response.ok) {
    throw new Error(await response.text() || `HTTP ${response.status}`)
  }
}

function readToolCalls(value: unknown): readonly AppAiTransportToolCall[] {
  return Array.isArray(value) ? value.filter(isRecord) as AppAiTransportToolCall[] : []
}

interface ParsedSseEvent {
  readonly event: string
  readonly data: string
}

function parseSseBlocks(buffer: string): { events: ParsedSseEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const rest = parts.pop() ?? ''
  const events = parts.flatMap((block): ParsedSseEvent[] => {
    let event = 'message'
    const dataLines: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice('event:'.length).trim()
      if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trimStart())
    }
    if (dataLines.length === 0) return []
    return [{ event, data: dataLines.join('\n') }]
  })
  return { events, rest }
}

async function readResponseChunks(
  body: ReadableStream<Uint8Array>,
  onChunk: (chunk: Uint8Array) => void,
): Promise<void> {
  for await (const chunk of body) {
    onChunk(chunk)
  }
}

export class FetchAppAiHostTransport implements AppAiHostTransport {
  constructor(
    private readonly baseUrl = '/api/ai',
    private readonly getHeaders: AppAiHeaderProvider = createAuthHeaders,
  ) {}

  private jsonHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...this.getHeaders(),
    }
  }

  async routeBusiness(input: AppAiRouteBusinessInput): Promise<AppAiRouteDecision> {
    const businessInstanceId = `route-${input.turn.turnId}`
    const sessionId = `appAiRouter:${businessInstanceId}`
    const result = await this.streamTurn({
      sessionId,
      turn: input.turn,
      systemPrompt: '你是严格的 JSON 业务路由器。',
      tools: [],
      messages: [{ role: 'user', content: buildRoutePrompt(input) }],
      scope: {
        businessRegistrationId: 'appAiRouter',
        businessInstanceId,
        instanceId: sessionId,
        runtimeInstanceId: sessionId,
      },
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })
    return normalizeRouteDecision(extractJsonObject(result.text))
  }

  async streamTurn(input: AppAiStreamTurnInput): Promise<AppAiStreamTurnResult> {
    const response = await fetch(`${this.baseUrl}/sessions/${encodeURIComponent(input.sessionId)}/turn/stream`, {
      method: 'POST',
      headers: this.jsonHeaders(),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      body: JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        systemPrompt: input.systemPrompt,
        tools: input.tools,
        mode: 'function',
        scope: toRuntimeScope(input.scope),
        turn: input.turn,
        messages: input.messages,
      }),
    })

    await assertResponseOk(response)

    if (!response.body) {
      const text = await response.text()
      return { text, toolCalls: [] }
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let finalText = ''
    let finalReasoning: string | undefined
    let finalToolCalls: readonly AppAiTransportToolCall[] = []

    const handle = (event: ParsedSseEvent): void => {
      const payload = tryParseJson(event.data)
      input.onSseEvent?.(appendEventMetadata({
        type: event.event,
        data: typeof payload === 'string' ? payload : JSON.stringify(payload),
      }, input))

      if (event.event === 'delta') {
        const delta = isRecord(payload) && typeof payload['delta'] === 'string'
          ? payload['delta']
          : (typeof payload === 'string' ? payload : '')
        if (delta !== '') {
          finalText += delta
          input.onDelta?.(delta)
        }
        return
      }
      if (event.event === 'reasoning') {
        const reasoning = isRecord(payload) && typeof payload['reasoning'] === 'string'
          ? payload['reasoning']
          : (typeof payload === 'string' ? payload : '')
        if (reasoning !== '') {
          finalReasoning = `${finalReasoning ?? ''}${reasoning}`
          input.onReasoning?.(reasoning)
        }
        return
      }
      if (event.event === 'usage' && isRecord(payload) && isRecord(payload['usage'])) {
        input.onUsage?.(payload['usage'])
        return
      }
      if (event.event === 'result' && isRecord(payload)) {
        const responseSessionId = typeof payload['sessionId'] === 'string' ? payload['sessionId'] : ''
        const responseTurnId = typeof payload['turnId'] === 'string' ? payload['turnId'] : ''
        if (responseSessionId !== input.sessionId) {
          throw new Error('AI stream result sessionId mismatch')
        }
        if (responseTurnId !== input.turn.turnId) {
          throw new Error('AI stream result turnId mismatch')
        }
        if (typeof payload['text'] === 'string') finalText = payload['text']
        if (typeof payload['reasoning'] === 'string') finalReasoning = payload['reasoning']
        finalToolCalls = readToolCalls(payload['toolCalls'])
      }
    }

    await readResponseChunks(response.body, (chunk) => {
      buffer += decoder.decode(chunk, { stream: true })
      const parsed = parseSseBlocks(buffer)
      buffer = parsed.rest
      for (const event of parsed.events) handle(event)
    })

    return {
      text: finalText,
      ...(finalReasoning === undefined ? {} : { reasoning: finalReasoning }),
      toolCalls: finalToolCalls,
    }
  }

  async appendMessages(input: AppAiAppendMessagesInput): Promise<void> {
    const response = await fetch(`${this.baseUrl}/sessions/${encodeURIComponent(input.sessionId)}/turn/append`, {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        scope: toRuntimeScope(input.scope),
        turn: input.turn,
        messages: input.messages,
      }),
    })
    const body = tryParseJson(await readTextResponse(response))
    if (!isRecord(body)) {
      throw new Error('AI append response missing body')
    }
    if (body['sessionId'] !== input.sessionId) {
      throw new Error('AI append response sessionId mismatch')
    }
    if (body['turnId'] !== input.turn.turnId) {
      throw new Error('AI append response turnId mismatch')
    }
  }
}

export async function uploadAppAiAttachment(
  file: File,
  baseUrl = '/api/ai',
  getHeaders: AppAiHeaderProvider = createAuthHeaders,
): Promise<FileAttachment> {
  const form = new FormData()
  form.append('file', file)

  const response = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    headers: getHeaders(),
    body: form,
  })
  const body = tryParseJson(await readTextResponse(response))
  if (!isRecord(body) || typeof body['fileId'] !== 'string' || body['fileId'].trim().length === 0) {
    throw new Error('AI upload response missing fileId')
  }
  return {
    fileId: body['fileId'].trim(),
    name: typeof body['name'] === 'string' && body['name'].trim().length > 0 ? body['name'] : file.name,
    size: typeof body['size'] === 'number' && Number.isFinite(body['size']) ? body['size'] : file.size,
    mimeType: typeof body['mimeType'] === 'string' && body['mimeType'].trim().length > 0 ? body['mimeType'] : file.type,
  }
}
