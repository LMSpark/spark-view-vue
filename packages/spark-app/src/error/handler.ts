/**
 * Error Handler
 * 全局错误处理与降级策略
 */

import type { App } from 'vue'
import type { ErrorHandlerOptions, ErrorType, ErrorContext } from '../types'

/**
 * 设置全局错误处理
 */
export function setupErrorHandler(app: App, options: ErrorHandlerOptions = {}): void {
  const { onError, enableFallback = true, errorClassifier } = options

  // Vue 错误处理
  app.config.errorHandler = (err: unknown, instance, info) => {
    const error = err as Error
    const errorType = errorClassifier ? errorClassifier(error) : classifyError(error)
    
    const context: ErrorContext = {
      source: instance?.$options?.name,
      info,
      timestamp: Date.now()
    }

    console.error('❌ [Global Error]', {
      type: errorType,
      message: error.message,
      context,
      stack: error.stack
    })

    // 用户自定义错误处理
    if (onError) {
      onError(error, context)
    }

    // 根据错误类型显示不同提示
    handleErrorByType(errorType, error, enableFallback)
  }

  // Promise 未捕获错误
  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
      console.error('❌ [Unhandled Promise]', event.reason)
      event.preventDefault()
      
      if (onError) {
        onError(
          event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
          { info: 'unhandledrejection', timestamp: Date.now() }
        )
      }
    })
  }

  console.log('✅ 全局错误处理已设置')
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
 * 根据错误类型处理
 */
function handleErrorByType(type: ErrorType, error: Error, enableFallback: boolean): void {
  switch (type) {
    case 'AUTH':
      // 重定向到登录页
      if (typeof window !== 'undefined') {
        window.location.href = '/login'
      }
      break
      
    case 'PERMISSION':
      // 显示权限不足提示
      showErrorMessage('权限不足，无法执行此操作')
      break
      
    case 'NETWORK':
      // 显示网络错误提示
      showErrorMessage('网络错误，请检查网络连接后重试')
      break
      
    case 'VALIDATION':
      // 显示验证错误提示
      showErrorMessage(error.message || '数据验证失败')
      break
      
    default:
      // 显示通用错误提示
      if (enableFallback) {
        showErrorMessage('系统错误，请稍后重试')
      }
  }
}

/**
 * 显示错误消息（简单实现，实际应该使用 UI 库）
 */
function showErrorMessage(message: string): void {
  if (typeof window !== 'undefined') {
    // 简单的 alert（实际应该使用 Element Plus 等 UI 库）
    console.error(message)
    
    // 如果有 Element Plus，使用 ElMessage
    if ((window as any).ElMessage) {
      (window as any).ElMessage.error(message)
    }
  }
}

/**
 * 创建错误边界组件（Vue 3）
 */
export function createErrorBoundary(fallbackRender?: (error: Error) => any) {
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
      console.error('❌ [Error Boundary]', err)
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
