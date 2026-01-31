import { Logger } from './logger.js'

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
  metadata?: Record<string, unknown>
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
  private static logger = Logger('ErrorHandler')

  static handle(error: unknown, context?: ErrorContext): never {
    const appError = this.normalizeError(error, context)

    // Log with structured context
    this.logger.error(`[${appError.type}] ${appError.message}`, {
      code: appError.code,
      context: appError.context,
      stack: appError.stack,
      timestamp: appError.timestamp
    })

    // Report to monitoring in production
    this.reportToMonitoring(appError)

    throw appError
  }

  static normalizeError(error: unknown, context?: ErrorContext): AppError {
    if (error instanceof AppError) return error

    if (error instanceof Error) {
      const type = this.classifyError(error)
      const code = this.extractErrorCode(error)
      return new AppError(error.message, type, code, context)
    }

    const message = typeof error === 'string' ? error : 'An unknown error occurred'
    return new AppError(message, ErrorType.UNKNOWN, undefined, context)
  }

  private static extractErrorCode(error: Error): string | undefined {
    // Extract error codes from common patterns
    const message = error.message.toLowerCase()
    if (message.includes('network')) return 'NETWORK_ERROR'
    if (message.includes('timeout')) return 'TIMEOUT_ERROR'
    if (message.includes('validation')) return 'VALIDATION_ERROR'
    if (message.includes('unauthorized')) return 'AUTH_ERROR'
    if (message.includes('forbidden')) return 'PERMISSION_ERROR'
    return undefined
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

  static async withRetry<T>(operation: () => Promise<T>, options?: RetryOptions, context?: ErrorContext): Promise<T> {
    const opts: RetryOptions = options ?? { maxAttempts: 3, delay: 1000, backoff: 'fixed' }
    const { maxAttempts, delay, backoff, retryCondition } = opts
    let lastError: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error
        const shouldRetry = !retryCondition || retryCondition(error)
        if (!shouldRetry || attempt === maxAttempts) {
          this.handle(lastError, { ...context, operation: `${context?.operation ?? 'unknown'} (attempt ${attempt}/${maxAttempts})` })
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
        return 'Network error occurred, please check your connection and try again'
      case ErrorType.VALIDATION:
        return 'Input validation failed, please check your data'
      case ErrorType.AUTHENTICATION:
        return 'Authentication failed, please log in again'
      case ErrorType.AUTHORIZATION:
        return 'Access denied, insufficient permissions'
      case ErrorType.BUSINESS_LOGIC:
        return error.message || 'Operation failed, please try again later'
      case ErrorType.SYSTEM:
        return 'System error occurred, please try again or contact support'
      default:
        return 'An unknown error occurred, please try again'
    }
  }

  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private static reportToMonitoring(error: AppError): void {
    // keep simple: console for now
    try { console.error('Error reported to monitoring:', error) } catch { /* ignore */ }
  }
}

export const handleError = ErrorHandler.handle.bind(ErrorHandler)
export const withRetry = ErrorHandler.withRetry.bind(ErrorHandler)
export const getUserFriendlyMessage = ErrorHandler.getUserFriendlyMessage.bind(ErrorHandler)
