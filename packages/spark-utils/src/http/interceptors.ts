/**
 * 预设拦截器
 *
 * 开箱即用的请求/响应拦截器工厂
 */

import type { RequestInterceptor, ResponseInterceptor, RequestError, HttpResponse } from './types'
import { Logger } from '../logger'

const logger = Logger('Http')

// ==================== 请求拦截器 ====================

/** 认证拦截器 - 添加 Authorization 头 */
export function createAuthInterceptor(
  tokenProvider: () => string | null | Promise<string | null>,
  options: { headerName?: string; prefix?: string } = {}
): RequestInterceptor {
  const { headerName = 'Authorization', prefix = 'Bearer' } = options
  return {
    name: 'Auth',
    onRequest: async (config) => {
      const token = await tokenProvider()
      if (token) {
        config.headers = { ...config.headers, [headerName]: prefix ? `${prefix} ${token}` : token }
      }
      return config
    }
  }
}

/** 租户拦截器 - 添加 X-Tenant-Id 头 */
export function createTenantInterceptor(
  tenantProvider: () => string | null | Promise<string | null>,
  headerName = 'X-Tenant-Id'
): RequestInterceptor {
  return {
    name: 'Tenant',
    onRequest: async (config) => {
      const tenantId = await tenantProvider()
      if (tenantId) {
        config.headers = { ...config.headers, [headerName]: tenantId }
      }
      return config
    }
  }
}

/** 自定义头拦截器 */
export function createHeadersInterceptor(
  headers: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>)
): RequestInterceptor {
  return {
    name: 'Headers',
    onRequest: async (config) => {
      const h = typeof headers === 'function' ? await headers() : headers
      config.headers = { ...h, ...config.headers }
      return config
    }
  }
}

/** 时间戳拦截器 - GET 请求添加时间戳参数（防缓存） */
export function createTimestampInterceptor(paramName = '_t'): RequestInterceptor {
  return {
    name: 'Timestamp',
    onRequest: (config) => {
      if (!config.method || config.method === 'GET') {
        config.params = { ...config.params, [paramName]: Date.now() }
      }
      return config
    }
  }
}

/** 请求日志拦截器 */
export function createRequestLogInterceptor(
  options: { logHeaders?: boolean; logData?: boolean } = {}
): RequestInterceptor {
  return {
    name: 'RequestLog',
    onRequest: (config) => {
      const info: Record<string, unknown> = { url: config.url, method: config.method }
      if (options.logHeaders) info['headers'] = config['headers']
      if (options.logData) info['data'] = config['data']
      logger.info('→', info)
      return config
    }
  }
}

// ==================== 响应拦截器 ====================

/** 响应日志拦截器 */
export function createResponseLogInterceptor(
  options: { logData?: boolean } = {}
): ResponseInterceptor {
  return {
    name: 'ResponseLog',
    onResponse: <T>(response: HttpResponse<T>) => {
      const info: Record<string, unknown> = { status: response.status }
      if (options.logData) info['data'] = response['data']
      logger.info('←', info)
      return response
    }
  }
}

/** 标准 API 响应拦截器 - 处理 { code, message, data } 格式 */
export function createStandardApiInterceptor(
  options: {
    successCodes?: number[]
    errorHandler?: (code: number, message: string) => void
  } = {}
): ResponseInterceptor {
  const successCodes = options.successCodes ?? [0, 200]
  return {
    name: 'StandardApi',
    onResponse: <T>(response: HttpResponse<T>) => {
      const raw = response.data as unknown
      if (typeof raw !== 'object' || raw === null || !('code' in raw)) return response

      const { code, message, data } = raw as { code: number; message?: string; data?: T }
      if (!successCodes.includes(code)) {
        if (options.errorHandler) options.errorHandler(code, message ?? '')
        const err: RequestError = Object.assign(new Error(message ?? '请求失败'), {
          config: { url: '' },
          code: String(code),
          status: response.status
        })
        throw err
      }
      return { ...response, data: (data ?? raw) as T }
    }
  }
}

/** 错误转换拦截器 - HTTP 状态码转友好消息 */
export function createErrorTransformInterceptor(
  messages?: Record<number, string>
): ResponseInterceptor {
  const map: Record<number, string> = {
    400: '请求参数错误', 401: '未授权', 403: '访问被拒绝',
    404: '资源不存在', 408: '请求超时', 500: '服务器错误',
    502: '网关错误', 503: '服务不可用', 504: '网关超时',
    ...messages
  }
  return {
    name: 'ErrorTransform',
    onResponseError: async (error) => {
      const msg = error.status !== undefined && error.status !== null ? map[error.status] : undefined
      if (msg) error.message = msg
      return error
    }
  }
}

/** 重定向拦截器 - 401/403 自动处理 */
export function createRedirectInterceptor(
  options: {
    onUnauthorized?: () => void | Promise<void>
    onForbidden?: () => void | Promise<void>
  }
): ResponseInterceptor {
  return {
    name: 'Redirect',
    onResponseError: async (error) => {
      if (error.status === 401 && options.onUnauthorized) await options.onUnauthorized()
      if (error.status === 403 && options.onForbidden) await options.onForbidden()
      return error
    }
  }
}
