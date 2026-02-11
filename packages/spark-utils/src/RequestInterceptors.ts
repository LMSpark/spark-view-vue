/**
 * 请求拦截器预设
 * 
 * 提供常用的拦截器，可直接使用或参考自定义
 */

import type { RequestInterceptor, ResponseInterceptor, RequestConfig, RequestResponse, RequestError } from './Request'
import { Logger } from './logger'

const logger = Logger('RequestInterceptors')

/* -----------------------------------------------------------------------------
 * 请求拦截器
 * -------------------------------------------------------------------------- */

/**
 * 认证拦截器 - 添加 Authorization 头
 * 
 * @example
 * ```typescript
 * const tokenProvider = () => localStorage.getItem('token')
 * request.interceptors.request.use(createAuthInterceptor(tokenProvider))
 * ```
 */
export function createAuthInterceptor(
  tokenProvider: () => string | null | Promise<string | null>,
  options: {
    headerName?: string
    prefix?: string
  } = {}
): RequestInterceptor {
  const headerName = options.headerName ?? 'Authorization'
  const prefix = options.prefix ?? 'Bearer'
  
  return {
    name: 'AuthInterceptor',
    onRequest: async (config) => {
      const token = await tokenProvider()
      if (token) {
        config.headers = config.headers ?? {}
        config.headers[headerName] = prefix ? `${prefix} ${token}` : token
        logger.debug('添加认证头', { headerName })
      }
      return config
    }
  }
}

/**
 * 租户 ID 拦截器 - 添加 X-Tenant-Id 头
 * 
 * @example
 * ```typescript
 * request.interceptors.request.use(createTenantInterceptor(() => 'tenant-123'))
 * ```
 */
export function createTenantInterceptor(
  tenantProvider: () => string | null | Promise<string | null>,
  headerName = 'X-Tenant-Id'
): RequestInterceptor {
  return {
    name: 'TenantInterceptor',
    onRequest: async (config) => {
      const tenantId = await tenantProvider()
      if (tenantId) {
        config.headers = config.headers ?? {}
        config.headers[headerName] = tenantId
        logger.debug('添加租户头', { headerName, tenantId })
      }
      return config
    }
  }
}

/**
 * 请求日志拦截器 - 记录请求信息
 * 
 * @example
 * ```typescript
 * request.interceptors.request.use(createRequestLogInterceptor())
 * ```
 */
export function createRequestLogInterceptor(
  options: {
    logHeaders?: boolean
    logData?: boolean
  } = {}
): RequestInterceptor {
  return {
    name: 'RequestLogInterceptor',
    onRequest: (config) => {
      const logData: Record<string, unknown> = {
        url: config.url,
        method: config.method
      }
      
      if (options.logHeaders && config.headers) {
        logData.headers = config.headers
      }
      
      if (options.logData && config.data) {
        logData.data = config.data
      }
      
      logger.info('→ 请求', logData)
      return config
    },
    onRequestError: (error) => {
      logger.error('→ 请求失败', { error: error.message })
    }
  }
}

/**
 * 时间戳拦截器 - 添加时间戳查询参数（防止缓存）
 * 
 * @example
 * ```typescript
 * request.interceptors.request.use(createTimestampInterceptor())
 * ```
 */
export function createTimestampInterceptor(
  paramName = '_t'
): RequestInterceptor {
  return {
    name: 'TimestampInterceptor',
    onRequest: (config) => {
      // 只对 GET 请求添加时间戳
      if (config.method === 'GET' || !config.method) {
        config.params = config.params ?? {}
        config.params[paramName] = Date.now()
      }
      return config
    }
  }
}

/**
 * 自定义头拦截器 - 添加自定义请求头
 * 
 * @example
 * ```typescript
 * request.interceptors.request.use(createHeadersInterceptor({
 *   'X-App-Version': '1.0.0',
 *   'X-Platform': 'web'
 * }))
 * ```
 */
export function createHeadersInterceptor(
  headers: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>)
): RequestInterceptor {
  return {
    name: 'HeadersInterceptor',
    onRequest: async (config) => {
      const customHeaders = typeof headers === 'function' ? await headers() : headers
      config.headers = {
        ...customHeaders,
        ...config.headers
      }
      return config
    }
  }
}

/* -----------------------------------------------------------------------------
 * 响应拦截器
 * -------------------------------------------------------------------------- */

/**
 * 标准 API 响应拦截器 - 处理 { code, message, data } 格式
 * 
 * @example
 * ```typescript
 * request.interceptors.response.use(createStandardApiInterceptor())
 * 
 * // 响应格式：
 * // { code: 0, message: 'Success', data: {...} }
 * // 拦截器会自动提取 data 字段
 * ```
 */
export function createStandardApiInterceptor(
  options: {
    successCodes?: number[]
    errorHandler?: (code: number, message: string) => void
  } = {}
): ResponseInterceptor {
  const successCodes = options.successCodes ?? [0, 200]
  
  return {
    name: 'StandardApiInterceptor',
    onResponse: <T>(response: RequestResponse<T>) => {
      const result = response.data as unknown
      
      // 检查是否是标准格式
      if (
        typeof result === 'object' &&
        result !== null &&
        'code' in result &&
        typeof (result as { code: number }).code === 'number'
      ) {
        const standardResult = result as { code: number; message?: string; data?: T }
        
        // 检查业务状态码
        if (!successCodes.includes(standardResult.code)) {
          const error = new Error(standardResult.message ?? '请求失败') as RequestError
          error.code = String(standardResult.code)
          error.config = response.config
          error.status = response.status
          
          if (options.errorHandler) {
            options.errorHandler(standardResult.code, standardResult.message ?? '')
          }
          
          throw error
        }
        
        // 提取 data 字段
        return {
          ...response,
          data: (standardResult.data ?? result) as T
        }
      }
      
      return response
    }
  }
}

/**
 * 响应日志拦截器 - 记录响应信息
 * 
 * @example
 * ```typescript
 * request.interceptors.response.use(createResponseLogInterceptor())
 * ```
 */
export function createResponseLogInterceptor(
  options: {
    logData?: boolean
    logHeaders?: boolean
  } = {}
): ResponseInterceptor {
  return {
    name: 'ResponseLogInterceptor',
    onResponse: <T>(response: RequestResponse<T>) => {
      const logData: Record<string, unknown> = {
        url: response.config.url,
        status: response.status,
        fromCache: response.fromCache
      }
      
      if (options.logHeaders) {
        logData.headers = Object.fromEntries(response.headers.entries())
      }
      
      if (options.logData) {
        logData.data = response.data
      }
      
      logger.info('← 响应', logData)
      return response
    },
    onResponseError: async (error) => {
      logger.error('← 响应失败', {
        url: error.config.url,
        status: error.status,
        message: error.message
      })
      return error
    }
  }
}

/**
 * 错误转换拦截器 - 将 HTTP 错误转换为友好的错误消息
 * 
 * @example
 * ```typescript
 * request.interceptors.response.use(createErrorTransformInterceptor())
 * ```
 */
export function createErrorTransformInterceptor(
  errorMessages?: Record<number, string>
): ResponseInterceptor {
  const defaultMessages: Record<number, string> = {
    400: '请求参数错误',
    401: '未授权，请重新登录',
    403: '访问被拒绝',
    404: '请求的资源不存在',
    408: '请求超时',
    500: '服务器内部错误',
    502: '网关错误',
    503: '服务不可用',
    504: '网关超时',
    ...errorMessages
  }
  
  return {
    name: 'ErrorTransformInterceptor',
    onResponseError: async (error) => {
      if (error.status && defaultMessages[error.status]) {
        const message = defaultMessages[error.status] ?? ''
        if (message) {
          error.message = message
        }
      }
      return error
    }
  }
}

/**
 * 重定向拦截器 - 处理 401/403 自动跳转登录
 * 
 * @example
 * ```typescript
 * request.interceptors.response.use(createRedirectInterceptor({
 *   onUnauthorized: () => {
 *     router.push('/login')
 *   }
 * }))
 * ```
 */
export function createRedirectInterceptor(
  options: {
    onUnauthorized?: () => void | Promise<void>
    onForbidden?: () => void | Promise<void>
  }
): ResponseInterceptor {
  return {
    name: 'RedirectInterceptor',
    onResponseError: async (error) => {
      if (error.status === 401 && options.onUnauthorized) {
        logger.warn('未授权，执行重定向')
        await options.onUnauthorized()
      } else if (error.status === 403 && options.onForbidden) {
        logger.warn('访问被禁止，执行重定向')
        await options.onForbidden()
      }
      return error
    }
  }
}

/**
 * 重试拦截器 - 响应失败时自动重试（配合 Request 的 retry 配置）
 * 
 * 注意：Request 类本身已支持重试，这个拦截器提供更精细的控制
 * 
 * @example
 * ```typescript
 * request.interceptors.response.use(createRetryInterceptor({
 *   shouldRetry: (error) => error.status >= 500,
 *   maxRetries: 3
 * }))
 * ```
 */
export function createRetryInterceptor(
  options: {
    shouldRetry?: (error: RequestError) => boolean
    maxRetries?: number
    retryDelay?: number
  } = {}
): ResponseInterceptor {
  const shouldRetry = options.shouldRetry ?? ((error: RequestError) => {
    // 默认只重试 5xx 错误和网络错误
    return !error.status || error.status >= 500
  })
  
  const maxRetries = options.maxRetries ?? 3
  const retryDelay = options.retryDelay ?? 1000
  
  const retryMap = new Map<RequestConfig, number>()
  
  return {
    name: 'RetryInterceptor',
    onResponseError: async (error) => {
      const retryCount = retryMap.get(error.config) ?? 0
      
      if (shouldRetry(error) && retryCount < maxRetries) {
        retryMap.set(error.config, retryCount + 1)
        logger.warn(`重试请求 (${retryCount + 1}/${maxRetries})`, {
          url: error.config.url
        })
        
        // 延迟后重试
        await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1)))
        
        // 注意：这里只是示例，实际重试需要重新发起请求
        // 由于拦截器无法直接重新发起请求，建议使用 Request 类的 retry 配置
      } else {
        retryMap.delete(error.config)
      }
      
      return error
    }
  }
}
