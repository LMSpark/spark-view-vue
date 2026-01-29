import { getLogger } from './logger.js'

export interface RetryOptions {
  maxAttempts: number
  delay: number
  backoff: 'fixed' | 'exponential'
  retryCondition?: (error: unknown) => boolean
}

export interface ErrorContext {
  operation?: string
  component?: string
  userId?: string
  metadata?: Record<string, any>
}

export enum ErrorType {
  NETWORK = 'network',
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  BUSINESS_LOGIC = 'business_logic',
  SYSTEM = 'system',
  UNKNOWN = 'unknown'
}

export class AppError extends Error {
  public readonly type: ErrorType
  public readonly code?: string
  public readonly context?: ErrorContext
  public readonly timestamp: number

  constructor(message: string, type: ErrorType = ErrorType.UNKNOWN, code?: string, context?: ErrorContext) {
    super(message)
    this.name = 'AppError'
    this.type = type
    this.code = code
    this.context = context
    this.timestamp = Date.now()
  }
}

export class ErrorHandler {
  private static logger = getLogger('ErrorHandler')

  static handle(error: unknown, context?: ErrorContext): never {
    const appError = this.normalizeError(error, context)

    this.logger.error(`[${appError.type}] ${appError.message}`, {
      code: appError.code,
      context: appError.context,
      stack: appError.stack
    })

    this.reportToMonitoring(appError)

    throw appError
  }

  static normalizeError(error: unknown, context?: ErrorContext): AppError {
    if (error instanceof AppError) return error
    if (error instanceof Error) {
      const type = this.classifyError(error)
      return new AppError(error.message, type, undefined, context)
    }
    const message = typeof error === 'string' ? error : 'Unknown error occurred'
    return new AppError(message, ErrorType.UNKNOWN, undefined, context)
  }

  private static classifyError(error: Error): ErrorType {
    const message = error.message.toLowerCase()
    if (message.includes('network') || message.includes('fetch')) return ErrorType.NETWORK
    if (message.includes('validation') || message.includes('invalid')) return ErrorType.VALIDATION
    if (message.includes('unauthorized') || message.includes('401')) return ErrorType.AUTHENTICATION
    if (message.includes('forbidden') || message.includes('403')) return ErrorType.AUTHORIZATION
    if (error.name === 'TypeError' || error.name === 'ReferenceError') return ErrorType.SYSTEM
    return ErrorType.UNKNOWN
  }

  static async withRetry<T>(operation: () => Promise<T>, options: RetryOptions, context?: ErrorContext): Promise<T> {
    const { maxAttempts, delay, backoff, retryCondition } = options
    let lastError: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error
        const shouldRetry = !retryCondition || retryCondition(error)
        if (!shouldRetry || attempt === maxAttempts) {
          this.handle(lastError, { ...context, operation: `${context?.operation || 'unknown'} (attempt ${attempt}/${maxAttempts})` })
        }
        const delayTime = backoff === 'exponential' ? delay * Math.pow(2, attempt - 1) : delay
        this.logger.warn(`Operation failed, retrying in ${delayTime}ms (attempt ${attempt}/${maxAttempts})`)
        await this.delay(delayTime)
      }
    }

    throw lastError
  }

  static getUserFriendlyMessage(error: AppError): string {
    switch (error.type) {
      case ErrorType.NETWORK:
        return '网络连接出现问题，请检查网络后重试'
      case ErrorType.VALIDATION:
        return '输入信息不符合要求，请检查后重新输入'
      case ErrorType.AUTHENTICATION:
        return '登录已过期，请重新登录'
      case ErrorType.AUTHORIZATION:
        return '没有权限执行此操作'
      case ErrorType.BUSINESS_LOGIC:
        return error.message || '操作失败，请稍后重试'
      case ErrorType.SYSTEM:
        return '系统出现异常，请稍后重试或联系管理员'
      default:
        return '发生未知错误，请稍后重试'
    }
  }

  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private static reportToMonitoring(error: AppError): void {
    // keep simple: console for now
    try { console.error('Error reported to monitoring:', error) } catch (_) { /* ignore */ }
  }
}

export const handleError = ErrorHandler.handle.bind(ErrorHandler)
export const withRetry = ErrorHandler.withRetry.bind(ErrorHandler)
export const getUserFriendlyMessage = ErrorHandler.getUserFriendlyMessage.bind(ErrorHandler)
