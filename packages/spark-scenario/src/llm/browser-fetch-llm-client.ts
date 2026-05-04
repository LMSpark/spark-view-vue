import type { AiBrowserLlmClient, AiBrowserLlmGenerateRequest, AiBrowserLlmGenerateResponse } from '../contracts/llm-contracts'

// ==============================================
// LLM 层：浏览器 Fetch 客户端
// ==============================================
// 功能分区：
// 1) 以 OpenAI-compatible chat completions 协议请求模型。
// 2) 把响应正文标准化为 text。
//
// 时序分区：
// 1) 业务侧创建 client。
// 2) planner 调用 client.generate 获取模型输出。

interface OpenAiChatCompletionMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface OpenAiChatCompletionRequest {
  model: string
  messages: OpenAiChatCompletionMessage[]
  temperature?: number
  max_tokens?: number
}

interface OpenAiChatCompletionChoice {
  message?: {
    content?: string
  }
}

interface OpenAiChatCompletionResponse {
  choices?: OpenAiChatCompletionChoice[]
}

export interface BrowserFetchLlmClientOptions {
  endpoint: string
  model: string
  apiKey?: string
  headers?: Record<string, string>
}

function toRequestBody(options: BrowserFetchLlmClientOptions, request: AiBrowserLlmGenerateRequest): OpenAiChatCompletionRequest {
  return {
    model: options.model,
    messages: request.messages.map((item) => ({ role: item.role, content: item.content })),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
  }
}

function extractText(response: OpenAiChatCompletionResponse): string {
  const first = response.choices?.[0]?.message?.content
  return typeof first === 'string' ? first : ''
}

export function createBrowserFetchLlmClient(options: BrowserFetchLlmClientOptions): AiBrowserLlmClient {
  /**
   * 创建基于 Fetch 的浏览器 LLM 客户端（兼容 OpenAI Chat Completions 协议）。
   *
   * 参数：
   * - endpoint: LLM HTTP API 地址（支持 OpenAI-style 接口或兼容实现）。
   * - model: 模型 ID 或名称。
   * - apiKey: 可选的 Bearer token。
   * - headers: 额外 HTTP 头。
   *
   * 返回值：遵循 `AiBrowserLlmClient` 接口的对象，统一返回 { text, raw }。
   */
  async function generate(request: AiBrowserLlmGenerateRequest): Promise<AiBrowserLlmGenerateResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    }

    if (options.apiKey !== undefined && options.apiKey !== '') {
      headers['Authorization'] = `Bearer ${options.apiKey}`
    }

    const response = await fetch(options.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(toRequestBody(options, request)),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`LLM request failed: ${response.status} ${response.statusText}; body=${body}`)
    }

    const data = (await response.json()) as OpenAiChatCompletionResponse
    return {
      text: extractText(data),
      raw: data,
    }
  }

  return { generate }
}
