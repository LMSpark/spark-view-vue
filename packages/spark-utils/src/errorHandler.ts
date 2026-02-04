/**
 * 错误处理模块
 * 
 * @description 提供统一的错误处理、分类、重试和上报功能
 */
import { Logger } from './logger.js'

/**
 * 重试选项
 */
export interface RetryOptions {
  /** 最大重试次数 */
  maxAttempts: number
  /** 重试延迟时间（毫秒） */
  delay: number
  /** 退避策略 */
  backoff: 'fixed' | 'exponential'
  /** 重试条件判断函数 */
  retryCondition?: (error: unknown) => boolean
}

/**
 * 错误上下文信息
 */
export interface ErrorContext {
  /** 操作名称 */
  operation?: string
  /** 组件名称 */
  component?: string
  /** 用户 ID */
  userId?: string
  /** 附加元数据 */
  metadata?: Record<string, unknown>
}

/**
 * 错误类型枚举
 */
export enum ErrorType {
  /** 网络错误 */
  NETWORK = 'network',
  /** 验证错误 */
  VALIDATION = 'validation',
  /** 身份认证错误 */
  AUTHENTICATION = 'authentication',
  /** 授权错误 */
  AUTHORIZATION = 'authorization',
  /** 业务逻辑错误 */
  BUSINESS_LOGIC = 'business_logic',
  /** 系统错误 */
  SYSTEM = 'system',
  /** 未知错误 */
  UNKNOWN = 'unknown'
}

/**
 * 应用错误类
 * 
 * @description 统一的错误类，包含类型、代码和上下文信息
 */
export class AppError extends Error {
  /** 错误类型 */
  public readonly type: ErrorType
  /** 错误代码 */
  public readonly code?: string
  /** 错误上下文 */
  public readonly context?: ErrorContext
  /** 错误时间戳 */
  public readonly timestamp: number

  /**
   * 创建应用错误实例
   * 
   * @param message - 错误消息
   * @param type - 错误类型
   * @param code - 错误代码
   * @param context - 错误上下文
   */
  constructor(message: string, type: ErrorType = ErrorType.UNKNOWN, code?: string, context?: ErrorContext) {
    super(message)
    this.name = 'AppError'
    this.type = type
    this.code = code
    this.context = context
    this.timestamp = Date.now()
  }
}

/**
 * 错误处理器
 * 
 * @description 提供统一的错误处理、日志记录和上报功能
 */
export class ErrorHandler {
  private static logger = Logger('ErrorHandler')

  /**
   * 处理错误
   * 
   * @param error - 错误对象
   * @param context - 错误上下文
   * @throws {AppError} 规范化后的错误
   */
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

  /**
   * 规范化错误对象
   * 
   * @param error - 原始错误
   * @param context - 错误上下文
   * @returns 规范化的应用错误
   */
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

  /**
   * 提取错误代码
   * 
   * @param error - 错误对象
   * @returns 错误代码或 undefined
   */
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

  /**
   * 分类错误类型
   * 
   * @param error - 错误对象
   * @returns 错误类型
   */
  private static classifyError(error: Error): ErrorType {
    const message = error.message.toLowerCase()
    if (message.includes('network') || message.includes('fetch')) return ErrorType.NETWORK
    if (message.includes('validation') || message.includes('invalid')) return ErrorType.VALIDATION
    if (message.includes('unauthorized') || message.includes('401')) return ErrorType.AUTHENTICATION
    if (message.includes('forbidden') || message.includes('403')) return ErrorType.AUTHORIZATION
    if (error.name === 'TypeError' || error.name === 'ReferenceError') return ErrorType.SYSTEM
    return ErrorType.UNKNOWN
  }

  /**
   * 带重试的操作执行
   * 
   * @template T - 操作返回值类型
   * @param operation - 需要执行的操作
   * @param options - 重试选项
   * @param context - 错误上下文
   * @returns 操作结果
   */
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

  /**
   * 获取用户友好的错误消息
   * 
   * @param error - 应用错误对象
   * @returns 用户友好的错误消息
   */
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

  /**
   * 延迟指定毫秒数
   * 
   * @param ms - 延迟时间（毫秒）
   * @returns 延迟 Promise
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 上报错误到监控系统
   * 
   * @param error - 应用错误对象
   */
  private static reportToMonitoring(error: AppError): void {
    // keep simple: console for now
    try { console.error('Error reported to monitoring:', error) } catch { /* ignore */ }
  }
}

/** 处理错误的快捷函数 */
export const handleError = ErrorHandler.handle.bind(ErrorHandler)

/** 带重试的操作执行快捷函数 */
export const withRetry = ErrorHandler.withRetry.bind(ErrorHandler)

/** 获取用户友好错误消息的快捷函数 */
export const getUserFriendlyMessage = ErrorHandler.getUserFriendlyMessage.bind(ErrorHandler)
