// shared/utils/errorHandler.ts
// 统一错误处理工具

import { Spark } from '../../features/spark'

export interface RetryOptions {
  maxAttempts: number
  delay: number
  backoff: 'fixed' | 'exponential'
  retryCondition?: (error: unknown) => boolean
}

export interface ErrorContext {
  operation: string
  component?: string
  userId?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>
}

/**
 * 错误分类枚举
 */
export enum ErrorType {
  NETWORK = 'network',
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  BUSINESS_LOGIC = 'business_logic',
  SYSTEM = 'system',
  UNKNOWN = 'unknown'
}

/**
 * 统一错误类
 */
export class AppError extends Error {
  public readonly type: ErrorType
  public readonly code?: string
  public readonly context?: ErrorContext
  public readonly timestamp: number

  constructor(
    message: string,
    type: ErrorType = ErrorType.UNKNOWN,
    code?: string,
    context?: ErrorContext
  ) {
    super(message)
    this.name = 'AppError'
    this.type = type
    this.code = code
    this.context = context
    this.timestamp = Date.now()
  }
}

/**
 * 错误处理器类
 */
export class ErrorHandler {
  private static logger = Spark.logger()

  /**
   * 处理错误并记录
   */
  static handle(error: unknown, context?: ErrorContext): never {
    const appError = this.normalizeError(error, context)

    // 记录错误
    this.logger.error(`[${appError.type}] ${appError.message}`, {
      code: appError.code,
      context: appError.context,
      stack: appError.stack
    })

    // 发送到错误监控系统（如果有的话）
    this.reportToMonitoring(appError)

    // 重新抛出标准化错误
    throw appError
  }

  /**
   * 标准化错误
   */
  static normalizeError(error: unknown, context?: ErrorContext): AppError {
    if (error instanceof AppError) {
      return error
    }

    if (error instanceof Error) {
      // 根据错误消息或类型分类
      const type = this.classifyError(error)
      return new AppError(error.message, type, undefined, context)
    }

    // 处理非Error对象
    const message = typeof error === 'string' ? error : 'Unknown error occurred'
    return new AppError(message, ErrorType.UNKNOWN, undefined, context)
  }

  /**
   * 分类错误类型
   */
  private static classifyError(error: Error): ErrorType {
    const message = error.message.toLowerCase()

    if (message.includes('network') || message.includes('fetch')) {
      return ErrorType.NETWORK
    }

    if (message.includes('validation') || message.includes('invalid')) {
      return ErrorType.VALIDATION
    }

    if (message.includes('unauthorized') || message.includes('401')) {
      return ErrorType.AUTHENTICATION
    }

    if (message.includes('forbidden') || message.includes('403')) {
      return ErrorType.AUTHORIZATION
    }

    if (error.name === 'TypeError' || error.name === 'ReferenceError') {
      return ErrorType.SYSTEM
    }

    return ErrorType.UNKNOWN
  }

  /**
   * 重试机制
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions,
    context?: ErrorContext
  ): Promise<T> {
    const { maxAttempts, delay, backoff, retryCondition } = options

    let lastError: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error

        // 检查是否应该重试
        const shouldRetry = !retryCondition || retryCondition(error)

        if (!shouldRetry || attempt === maxAttempts) {
          this.handle(lastError, {
            ...context,
            operation: `${context?.operation || 'unknown'} (attempt ${attempt}/${maxAttempts})`
          })
        }

        // 计算延迟时间
        const delayTime = backoff === 'exponential'
          ? delay * Math.pow(2, attempt - 1)
          : delay

        this.logger.warn(`Operation failed, retrying in ${delayTime}ms (attempt ${attempt}/${maxAttempts})`)
        await this.delay(delayTime)
      }
    }

    // 这行代码不会执行，因为上面的循环会在最后一次尝试失败时抛出错误
    throw lastError
  }

  /**
   * 创建用户友好的错误消息
   */
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

  /**
   * 延迟函数
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 报告错误到监控系统
   */
  private static reportToMonitoring(error: AppError): void {
    // 这里可以集成第三方监控服务，如 Sentry、LogRocket 等
    // 例如：
    // if (typeof window !== 'undefined' && window.Sentry) {
    //   window.Sentry.captureException(error)
    // }

    // 暂时只记录到控制台
    console.error('Error reported to monitoring:', error)
  }
}

/**
 * 便捷函数
 */
export const handleError = ErrorHandler.handle.bind(ErrorHandler)
export const withRetry = ErrorHandler.withRetry.bind(ErrorHandler)
export const getUserFriendlyMessage = ErrorHandler.getUserFriendlyMessage.bind(ErrorHandler)