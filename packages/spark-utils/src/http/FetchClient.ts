/**
 * FetchClient — 基于原生 fetch 的 HTTP 客户端
 *
 * 继承 HttpClientBase（重试/缓存/拦截器/快捷方法），
 * 仅实现 fetch 特有的：请求执行 + 错误归一化 + beacon。
 */

import { HttpClientBase, DEFAULT_TIMEOUT } from './HttpClientBase'
import { isRecord, readStringProperty } from '../internal/guards.js'
import type {
  RequestConfig, HttpResponse,
  RequestError,
} from './types'

export class FetchClient extends HttpClientBase {
  constructor(defaults: Partial<RequestConfig> = {}) {
    super(defaults, 'FetchClient')
  }

  // ==================== 模板方法实现 ====================

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    const response = await this.fetchRaw(config)

    if (!response.ok) {
      throw await this.buildHttpError(response, config)
    }

    const data = await this.readBody(response, config.responseType ?? 'json')
    return {
      data,
      status: response.status,
      statusText: response.statusText,
      headers: this.extractHeaders(response.headers),
    }
  }

  protected override normalizeTransportError(err: unknown, config?: RequestConfig): RequestError {
    const base = err instanceof Error ? err : new Error(String(err))
    // 区分三种网络错误：用户取消 / 超时 / 其他网络故障
    const code = base.name === 'AbortError'   ? 'ECONNABORTED'
               : base.name === 'TimeoutError' ? 'ETIMEDOUT'
               : 'ERR_NETWORK'
    return this.buildRequestError(base.message, config ?? { url: '' }, { code })
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

  private async readBody(response: Response, responseType: string): Promise<unknown> {
    switch (responseType) {
      case 'text': return await response.text()
      case 'blob': return await response.blob()
      case 'arraybuffer': return await response.arrayBuffer()
      case 'formdata': return await response.formData()
      case 'document': return await response.text()
      default: return await response.json()
    }
  }

  // ==================== 工具方法 ====================

  private async buildHttpError(response: Response, config: RequestConfig): Promise<RequestError> {
    let body: unknown
    try {
      body = await response.clone().json()
    } catch {
      try {
        body = await response.clone().text()
      } catch {
        body = undefined
      }
    }

    const message = this.extractErrorMessage(body) ?? `HTTP ${response.status}: ${response.statusText}`

    return this.buildRequestError(
      message,
      config,
      { code: `ERR_HTTP_${response.status}`, status: response.status, response: body },
    )
  }

  private extractErrorMessage(body: unknown): string | undefined {
    if (typeof body === 'string') {
      const trimmed = body.trim()
      return trimmed.length > 0 ? trimmed : undefined
    }

    if (!isRecord(body)) {
      return undefined
    }

    const record = body
    const message = readStringProperty(record, 'message')
    if (typeof message === 'string' && message.trim() !== '') {
      return message.trim()
    }

    const error = record['error']
    if (isRecord(error)) {
      const errorRecord = error
      const nestedMessage = readStringProperty(errorRecord, 'message')
      if (typeof nestedMessage === 'string' && nestedMessage.trim() !== '') {
        return nestedMessage.trim()
      }

      const synthesized = this.synthesizeEnvelopeErrorMessage(record, errorRecord)
      if (synthesized !== undefined) {
        return synthesized
      }
    }

    return undefined
  }

  private synthesizeEnvelopeErrorMessage(
    body: Record<string, unknown>,
    error: Record<string, unknown>,
  ): string | undefined {
    const code = typeof error['code'] === 'string' ? error['code'] : undefined
    if (code === undefined) {
      return undefined
    }

    const base = this.describeErrorCode(code)
    const data = body['data']
    const details = error['details']
    const handoff = body['handoff'] ?? (
      isRecord(data) ? data['handoff'] : undefined
    ) ?? (
      isRecord(details) ? details['handoff'] : undefined
    )
    const nextAction = isRecord(handoff)
      ? handoff['nextAction']
      : undefined

    if (typeof nextAction === 'string' && nextAction.trim() !== '') {
      return `${base}：${nextAction.trim()}`
    }
    return base
  }

  private describeErrorCode(code: string): string {
    switch (code) {
      case 'SESSION_SCOPE_MISMATCH':
        return '后端 AI 会话与当前模块实例不匹配'
      case 'HANDOFF_REQUIRED':
        return 'AI 会话已进入人工接管状态'
      case 'INVALID_STATE_TRANSITION':
        return 'AI 会话状态迁移非法'
      case 'PARALLEL_WRITE_BUDGET_EXCEEDED':
        return '本轮写操作超出并行预算'
      case 'PARALLEL_WRITE_NOT_ALLOWED_STAGE1':
        return '当前阶段不允许并行写操作'
      case 'IDEMPOTENCY_REPLAY_BLOCKED':
        return '请求被幂等保护阻止重放'
      case 'DUPLICATE_TOOL_CALL_ID':
        return '检测到重复的工具调用 ID'
      case 'LLM_CALL_FAILED':
        return 'LLM 调用失败'
      default:
        return code
    }
  }

  private extractHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {}
    headers.forEach((v, k) => { result[k] = v })
    return result
  }

}

// ==================== 工厂函数 ====================

/** 创建 Fetch 客户端（支持 beacon）。 */
export function createFetchClient(config?: Partial<RequestConfig>): FetchClient {
  return new FetchClient(config)
}
