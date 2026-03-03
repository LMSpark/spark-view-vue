/**
 * Error Handler
 * 全局错误处理与降级策略
 */

import { type App, defineComponent } from 'vue'
import type { ErrorHandlerOptions, ErrorContext } from '../types'
import { ErrorType } from '../types'
import { createLogger } from '../logger'
import { toError } from '@spark-view/spark-utils'

const errorLogger = createLogger('error')

/**
 * 设置全局错误处理
 *
 * @returns 清理函数，调用后移除全局事件监听器（HMR / 应用卸载时使用）
 */
export function setupErrorHandler(app: App, options: ErrorHandlerOptions = {}): () => void {
  const { onError, errorClassifier, onErrorByType, enableFallback } = options
  const cleanupFns: Array<() => void> = []

  // Vue 错误处理
  app.config.errorHandler = (err: unknown, instance, info) => {
    const error = toError(err)
    const errorType = errorClassifier ? errorClassifier(error) : classifyError(error)
    
    const context: ErrorContext = {
      info,
      timestamp: Date.now()
    }
    
    if (instance?.$options.name !== undefined) {
      context.source = instance.$options.name
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
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      // event.reason 类型为 any，转为 Error 或字符串记录
      const reason = event.reason instanceof Error ? event.reason : { reason: String(event.reason) }
      errorLogger.error('[Unhandled Promise]', reason)
      event.preventDefault()
      
      if (onError) {
        onError(
          event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
          { info: 'unhandledrejection', timestamp: Date.now() }
        )
      }
    }
    window.addEventListener('unhandledrejection', rejectionHandler)
    cleanupFns.push(() => window.removeEventListener('unhandledrejection', rejectionHandler))
  }

  // 启用降级边界组件
  if (enableFallback) {
    app.component('ErrorBoundary', createErrorBoundary())
    errorLogger.info('已注册 ErrorBoundary 降级组件')
  }

  errorLogger.info('全局错误处理已设置')

  // 返回清理函数（HMR / 应用卸载时调用，避免累积监听器）
  return () => {
    for (const fn of cleanupFns) fn()
    cleanupFns.length = 0
  }
}

/**
 * 错误分类
 */
function classifyError(error: Error): ErrorType {
  const message = error.message.toLowerCase()
  
  if (message.includes('auth') || message.includes('token')) {
    return ErrorType.Auth
  }
  if (message.includes('permission') || message.includes('forbidden')) {
    return ErrorType.Permission
  }
  if (message.includes('network') || message.includes('fetch')) {
    return ErrorType.Network
  }
  if (message.includes('validation') || message.includes('invalid')) {
    return ErrorType.Validation
  }
  
  return ErrorType.Unknown
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
  return defineComponent({
    name: 'ErrorBoundary',
    data() {
      return {
        error: null as Error | null
      }
    },
    errorCaptured(err: unknown) {
      this.error = err instanceof Error ? err : new Error(String(err))
      errorLogger.error('[Error Boundary]', this.error)
      return false // 阻止错误继续传播
    },
    render() {
      if (this.error) {
        return fallbackRender
          ? fallbackRender(this.error)
          : this.$slots['fallback'] !== undefined
          ? this.$slots['fallback']()
          : null
      }
      return this.$slots['default']?.()
    }
  })
}
