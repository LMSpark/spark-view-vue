/**
 * FetchClient — 基于原生 fetch 的 HTTP 客户端
 *
 * 继承 HttpClientBase（重试/缓存/拦截器/快捷方法），
 * 仅实现 fetch 特有的：请求执行 + 错误归一化 + stream/SSE/beacon。
 */

import { HttpClientBase, DEFAULT_TIMEOUT } from './HttpClientBase'
import type {
  RequestConfig, HttpResponse,
  RequestError,
  FetchHttpClient,
  StreamResponse, SSEEvent,
} from './types'

export class FetchClient extends HttpClientBase implements FetchHttpClient {
  constructor(defaults: Partial<RequestConfig> = {}) {
    super(defaults, 'FetchClient')
  }

  // ==================== 模板方法实现 ====================

  protected async executeRequest<T>(config: RequestConfig): Promise<HttpResponse<T>> {
    const response = await this.fetchRaw(config)

    if (!response.ok) {
      throw await this.buildHttpError(response, config)
    }

    const data = await this.readBody<T>(response, config.responseType ?? 'json')
    return {
      data,
      status: response.status,
      statusText: response.statusText,
      headers: this.extractHeaders(response.headers),
    }
  }

  protected normalizeAdapterError(err: unknown, config?: RequestConfig): RequestError {
    const base = err instanceof Error ? err : new Error(String(err))
    // 区分三种网络错误：用户取消 / 超时 / 其他网络故障
    const code = base.name === 'AbortError'   ? 'ECONNABORTED'
               : base.name === 'TimeoutError' ? 'ETIMEDOUT'
               : 'ERR_NETWORK'
    return this.buildRequestError(base.message, config ?? { url: '' }, { code })
  }

  // ==================== Fetch-Only: 流式响应 ====================

  /**
   * 流式请求公共前置步骤：合并配置 → 请求拦截器 → fetchRaw → 校验响应
   *
   * ⚠️ **不走重试循环**：流式连接建立后重试无意义（数据已开始传输）。
   * 如需重试，请在调用方捕获错误并重新调用。
   */
  private async fetchStreamResponse(config: RequestConfig): Promise<StreamResponse> {
    const merged = this.mergeConfig(config)
    const cfg = await this.applyRequestInterceptors(merged)
    const response = await this.fetchRaw(cfg)
    if (!response.ok) throw await this.buildHttpError(response, cfg)
    if (response.body === null) throw new Error('Response body is null, streaming not supported')
    return {
      body: response.body,
      status: response.status,
      statusText: response.statusText,
      headers: this.extractHeaders(response.headers),
    }
  }

  /** 发起请求并返回原始 ReadableStream（超时仅作用于连接阶段，不限流读取时长）
   *
   * ⚠️ **不走重试循环**——详见 `fetchStreamResponse`。
   */
  async stream(config: RequestConfig): Promise<StreamResponse> {
    return this.fetchStreamResponse(config)
  }

  /**
   * 发起请求并返回 SSE 事件异步迭代器
   *
   * ⚠️ **不走重试循环**——SSE 连接一旦建立即开始接收事件，重试会导致事件重复或乱序。
   *
   * @example
   * ```ts
   * const events = await client.streamSSE({ url: '/sse', method: 'POST', data: { ... } })
   * for await (const event of events) {
   *   if (event.data === '[DONE]') break
   *   console.log(JSON.parse(event.data))
   * }
   * ```
   */
  async streamSSE(config: RequestConfig): Promise<AsyncGenerator<SSEEvent>> {
    const { body } = await this.fetchStreamResponse(config)
    return this.parseSSEStream(body)
  }

  // ==================== Fetch-Only: Beacon ====================

  /**
   * 使用 sendBeacon 发送数据（自动降级为 fetch + keepalive）
   *
   * 适用于页面卸载时的日志/埋点传输。
   */
  beacon(url: string, data: unknown): boolean {
    const fullUrl = this.resolveUrl(url)
    const payload = typeof data === 'string' ? data : JSON.stringify(data)
    const blob = new Blob([payload], { type: 'application/json' })

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const sent = navigator.sendBeacon(fullUrl, blob)
      if (sent) return true
    }

    // 降级 fetch + keepalive
    void fetch(fullUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => { /* 静默 */ })
    return true
  }

  // ==================== Fetch 适配层私有方法 ====================

  /** 执行原始 fetch（含超时处理） */
  private async fetchRaw(config: RequestConfig): Promise<Response> {
    const url = this.resolveUrl(config.url, config.params, config.baseURL)
    const init = this.buildInit(config)

    const timeout = config.timeout ?? DEFAULT_TIMEOUT
    const controller = new AbortController()
    const timer = setTimeout(() => { controller.abort(new DOMException('Timeout', 'TimeoutError')) }, timeout)

    // 合并外部 signal（保留引用以便 finally 清理）
    const externalSignal = config.signal
    const onExternalAbort = (): void => {
      clearTimeout(timer)
      controller.abort(externalSignal?.reason)
    }

    if (externalSignal?.aborted === true) {
      clearTimeout(timer)
      controller.abort(externalSignal.reason)
    } else {
      externalSignal?.addEventListener('abort', onExternalAbort, { once: true })
    }

    try {
      const response = await fetch(url, { ...init, signal: controller.signal })
      return response
    } finally {
      clearTimeout(timer)
      externalSignal?.removeEventListener('abort', onExternalAbort)
    }
  }

  private buildInit(config: RequestConfig): RequestInit {
    const init: RequestInit = { method: config.method ?? 'GET' }
    const headers: Record<string, string> = { ...config.headers }

    if (config.data !== undefined) {
      if (config.data instanceof FormData || config.data instanceof Blob || typeof config.data === 'string') {
        init.body = config.data
      } else {
        init.body = JSON.stringify(config.data)
        const hasContentType = Object.keys(headers).some(k => k.toLowerCase() === 'content-type')
        if (!hasContentType) {
          headers['Content-Type'] = 'application/json'
        }
      }
    }

    if (Object.keys(headers).length > 0) init.headers = headers
    if (config.keepalive === true) init.keepalive = true
    if (config.withCredentials === true) init.credentials = 'include'

    return init
  }

  private resolveUrl(path: string, params?: Record<string, unknown>, baseURL?: string): string {
    const base = baseURL ?? this.defaults.baseURL ?? ''
    let url: string

    if (/^https?:\/\//.test(path) || base === '') {
      url = path
    } else {
      url = `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
    }

    if (params !== undefined) {
      const sp = new URLSearchParams()
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) sp.append(k, String(v))
      }
      const qs = sp.toString()
      if (qs !== '') url += `${url.includes('?') ? '&' : '?'}${qs}`
    }

    return url
  }

  private async readBody<T>(response: Response, responseType: string): Promise<T> {
    switch (responseType) {
      case 'text': return await response.text() as T
      case 'blob': return await response.blob() as T
      case 'arraybuffer': return await response.arrayBuffer() as T
      case 'formdata': return await response.formData() as T
      case 'stream': {
        if (response.body === null) throw new Error('Response body is null, streaming not supported')
        return response.body as T
      }
      case 'document': return await response.text() as T
      default: return await response.json() as T
    }
  }

  // ==================== SSE 解析器 ====================

  /** 标准 SSE 解析——按空行分隔事件，支持多行 data 拼接 */
  private async *parseSSEStream(body: ReadableStream<Uint8Array>): AsyncGenerator<SSEEvent> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let eventType: string | undefined
    let dataLines: string[] = []
    let eventId: string | undefined

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) {
          // flush 剩余字节——防止 UTF-8 多字节字符在最后一个 chunk 被截断丢弃
          buffer += decoder.decode()
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split(/\r\n|\r|\n/)
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line === '') {
            if (dataLines.length > 0) {
              yield this.buildSSEEvent(dataLines, eventType, eventId)
            }
            eventType = undefined
            dataLines = []
            eventId = undefined
            continue
          }

          if (line.startsWith(':')) continue

          const colonIdx = line.indexOf(':')
          let field: string
          let val: string
          if (colonIdx < 0) {
            field = line
            val = ''
          } else {
            field = line.slice(0, colonIdx)
            val = line.slice(colonIdx + 1)
            if (val.startsWith(' ')) val = val.slice(1)
          }

          switch (field) {
            case 'data':  dataLines.push(val); break
            case 'event': eventType = val;     break
            case 'id':    eventId = val;       break
          }
        }
      }

      if (dataLines.length > 0) {
        yield this.buildSSEEvent(dataLines, eventType, eventId)
      }
    } finally {
      reader.releaseLock()
    }
  }

  // ==================== 工具方法 ====================

  private async buildHttpError(response: Response, config: RequestConfig): Promise<RequestError> {
    let body: unknown
    try { body = await response.json() } catch { /* 非 JSON 响应体 */ }

    return this.buildRequestError(
      `HTTP ${response.status}: ${response.statusText}`,
      config,
      { code: `ERR_HTTP_${response.status}`, status: response.status, response: body },
    )
  }

  private extractHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {}
    headers.forEach((v, k) => { result[k] = v })
    return result
  }

  /** 构造 SSEEvent 对象（避免 exactOptionalPropertyTypes 赋 undefined） */
  private buildSSEEvent(dataLines: string[], eventType: string | undefined, eventId: string | undefined): SSEEvent {
    return {
      ...(eventType !== undefined ? { event: eventType } : {}),
      data: dataLines.join('\n'),
      ...(eventId !== undefined ? { id: eventId } : {}),
    }
  }
}

// ==================== 工厂函数 ====================

/** 创建 Fetch 扩展客户端（支持 stream / streamSSE / beacon）。 */
export function createFetchClient(config?: Partial<RequestConfig>): FetchHttpClient {
  return new FetchClient(config)
}
