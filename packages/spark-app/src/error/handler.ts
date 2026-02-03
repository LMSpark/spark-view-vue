/**
 * Error Handler
 * 全局错误处理与降级策略
 */

import type { App } from 'vue'
import type { ErrorHandlerOptions, ErrorType, ErrorContext } from '../types'
import { createLogger } from '../logger'

const errorLogger = createLogger('error')

/**
 * 设置全局错误处理
 */
export function setupErrorHandler(app: App, options: ErrorHandlerOptions = {}): void {
  const { onError, errorClassifier, onErrorByType } = options

  // Vue 错误处理
  app.config.errorHandler = (err: unknown, instance, info) => {
    const error = err as Error
    const errorType = errorClassifier ? errorClassifier(error) : classifyError(error)
    
    const context: ErrorContext = {
      source: instance?.$options?.name,
      info,
      timestamp: Date.now()
    }

    errorLogger.error('[Global Error]', {
      type: errorType,
      message: error.message,
      context,
      stack: error.stack
    })

    // 用户自定义错误处理
    if (onError) {
      onError(error, context)
    }

    // 根据错误类型处理（如果提供了回调）
    if (onErrorByType) {
      onErrorByType(errorType, error)
    }
  }

  // Promise 未捕获错误
  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
      errorLogger.error('[Unhandled Promise]', event.reason)
      event.preventDefault()
      
      if (onError) {
        onError(
          event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
          { info: 'unhandledrejection', timestamp: Date.now() }
        )
      }
    })
  }

  errorLogger.info('全局错误处理已设置')
}

/**
 * 错误分类
 */
function classifyError(error: Error): ErrorType {
  const message = error.message.toLowerCase()
  
  if (message.includes('auth') || message.includes('token')) {
    return 'AUTH' as ErrorType
  }
  if (message.includes('permission') || message.includes('forbidden')) {
    return 'PERMISSION' as ErrorType
  }
  if (message.includes('network') || message.includes('fetch')) {
    return 'NETWORK' as ErrorType
  }
  if (message.includes('validation') || message.includes('invalid')) {
    return 'VALIDATION' as ErrorType
  }
  
  return 'UNKNOWN' as ErrorType
}

/**
 * 错误类型处理建议（供消费层参考）
 * 
 * @example
 * ```ts
 * setupErrorHandler(app, {
 *   onErrorByType: (type, error) => {
 *     switch (type) {
 *       case 'AUTH':
 *         // 重定向到登录页
 *         router.push('/login')
 *         break
 *       case 'PERMISSION':
 *         ElMessage.error('权限不足')
 *         break
 *       case 'NETWORK':
 *         ElMessage.error('网络错误')
 *         break
 *       default:
 *         ElMessage.error(error.message)
 *     }
 *   }
 * })
 * ```
 */

/**
 * 创建错误边界组件（Vue 3）
 */
export function createErrorBoundary(fallbackRender?: (error: Error) => unknown) {
  return {
    name: 'ErrorBoundary',
    data() {
      return {
        error: null as Error | null
      }
    },
    errorCaptured(err: Error) {
      const self = this as unknown as { error: Error | null }
      self.error = err
      errorLogger.error('[Error Boundary]', err)
      return false // 阻止错误继续传播
    },
    render(): unknown {
      const self = this as unknown as { error: Error | null; $slots: Record<string, () => unknown> }
      if (self.error) {
        return fallbackRender
          ? fallbackRender(self.error)
          : self.$slots.fallback
          ? self.$slots.fallback()
          : null
      }
      return self.$slots.default?.()
    }
  }
}
