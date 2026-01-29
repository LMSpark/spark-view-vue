// Re-export async utilities from the canonical package to avoid duplication
export { asyncUtils, RaceController, TimeoutOptions, DebounceOptions, ThrottleOptions } from '@spark-view/spark-core'
/**
 * 节流选项
 */
export interface ThrottleOptions {
  leading?: boolean
  trailing?: boolean
}

/**
 * 竞态条件控制器
 */
export class RaceController {
  private abortController: AbortController | null = null

  /**
   * 创建新的竞态控制器
   */
  static create(): RaceController {
    return new RaceController()
  }

  /**
   * 取消之前的操作
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  /**
   * 执行操作，如果有之前的操作则取消
   */
  async execute<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.abort()

    this.abortController = new AbortController()
    const { signal } = this.abortController

    try {
      return await operation(signal)
    } finally {
      this.abortController = null
    }
  }

  /**
   * 检查是否已取消
   */
  get aborted(): boolean {
    return this.abortController?.signal.aborted ?? false
  }
}

/**
 * 异步工具集
 */
export const asyncUtils = {
  /**
   * 为Promise添加超时
   */
  timeout<T>(
    promise: Promise<T>,
    options: TimeoutOptions
  ): Promise<T> {
    const { timeout, timeoutMessage = 'Operation timed out' } = options

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(timeoutMessage))
      }, timeout)

      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timer))
    })
  },

  /**
   * 重试机制
   */
  async retry<T>(
    operation: () => Promise<T>,
    options: RetryOptions
  ): Promise<T> {
    return ErrorHandler.withRetry(operation, options)
  },

  /**
   * 防抖函数
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number,
    options: DebounceOptions = {}
  ): T & { cancel(): void; flush(): ReturnType<T> | undefined } {
    const { leading = false, trailing = true } = options

    let timeoutId: NodeJS.Timeout | null = null
    let lastArgs: Parameters<T> | null = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let lastThis: any = null
    let result: ReturnType<T> | undefined
    let lastCallTime: number | undefined
    let lastInvokeTime = 0

    function invokeFunc(time: number): ReturnType<T> {
      const args = lastArgs!
      const thisArg = lastThis

      lastArgs = null
      lastThis = null
      lastInvokeTime = time
      result = func.apply(thisArg, args)
      return result
    }

    function leadingEdge(time: number): ReturnType<T> {
      lastInvokeTime = time
      timeoutId = setTimeout(timerExpired, wait)
      return leading ? invokeFunc(time) : result!
    }

    function remainingWait(time: number): number {
      const timeSinceLastCall = time - (lastCallTime || 0)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const timeSinceLastInvoke = time - lastInvokeTime
      const timeWaiting = wait - timeSinceLastCall

      return timeWaiting
    }

    function shouldInvoke(time: number): boolean {
      const timeSinceLastCall = time - (lastCallTime || 0)
      const timeSinceLastInvoke = time - lastInvokeTime

      return (
        lastCallTime === undefined ||
        timeSinceLastCall >= wait ||
        timeSinceLastCall < 0 ||
        (leading && timeSinceLastInvoke >= wait)
      )
    }

    function timerExpired(): void {
      const time = Date.now()
      if (shouldInvoke(time)) {
        trailingEdge(time)
      } else {
        timeoutId = setTimeout(timerExpired, remainingWait(time))
      }
    }

    function trailingEdge(time: number): ReturnType<T> | undefined {
      timeoutId = null

      if (trailing && lastArgs) {
        return invokeFunc(time)
      }

      lastArgs = null
      lastThis = null
      return result
    }

    function cancel(): void {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
      lastInvokeTime = 0
      lastArgs = null
      lastCallTime = undefined
      lastThis = null
      timeoutId = null
    }

    function flush(): ReturnType<T> | undefined {
      return timeoutId === null ? result : trailingEdge(Date.now())
    }

    function debounced(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this: any, 
      ...args: Parameters<T>
    ): ReturnType<T> | undefined {
      const time = Date.now()
      const isInvoking = shouldInvoke(time)

      lastArgs = args
      lastThis = this
      lastCallTime = time

      if (isInvoking) {
        if (timeoutId === null) {
          return leadingEdge(lastCallTime)
        }
        if (leading) {
          timeoutId = setTimeout(timerExpired, wait)
          return invokeFunc(lastCallTime)
        }
      }

      if (timeoutId === null) {
        timeoutId = setTimeout(timerExpired, wait)
      }

      return result
    }

    debounced.cancel = cancel
    debounced.flush = flush

    return debounced as T & { cancel(): void; flush(): ReturnType<T> | undefined }
  },

  /**
   * 节流函数
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  throttle<T extends (...args: any[]) => any>(
    func: T,
    wait: number,
    options: ThrottleOptions = {}
  ): T & { cancel(): void; flush(): ReturnType<T> | undefined } {
    const { leading = true, trailing = true } = options

    let timeoutId: NodeJS.Timeout | null = null
    let lastArgs: Parameters<T> | null = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let lastThis: any = null
    let result: ReturnType<T> | undefined
    let lastCallTime: number | undefined
    let lastInvokeTime = 0

    function invokeFunc(time: number): ReturnType<T> {
      const args = lastArgs!
      const thisArg = lastThis

      lastArgs = null
      lastThis = null
      lastInvokeTime = time
      result = func.apply(thisArg, args)
      return result
    }

    function leadingEdge(time: number): ReturnType<T> {
      lastInvokeTime = time
      timeoutId = setTimeout(timerExpired, wait)
      return leading ? invokeFunc(time) : result!
    }

    function remainingWait(time: number): number {
      const timeSinceLastCall = time - (lastCallTime || 0)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const timeSinceLastInvoke = time - lastInvokeTime
      const timeWaiting = wait - timeSinceLastCall

      return timeWaiting
    }

    function shouldInvoke(time: number): boolean {
      const timeSinceLastCall = time - (lastCallTime || 0)
      const timeSinceLastInvoke = time - lastInvokeTime

      return (
        lastCallTime === undefined ||
        timeSinceLastCall >= wait ||
        timeSinceLastCall < 0 ||
        (leading && timeSinceLastInvoke >= wait)
      )
    }

    function timerExpired(): void {
      const time = Date.now()
      if (shouldInvoke(time)) {
        trailingEdge(time)
      } else {
        timeoutId = setTimeout(timerExpired, remainingWait(time))
      }
    }

    function trailingEdge(time: number): ReturnType<T> | undefined {
      timeoutId = null

      if (trailing && lastArgs) {
        return invokeFunc(time)
      }

      lastArgs = null
      lastThis = null
      return result
    }

    function cancel(): void {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
      lastInvokeTime = 0
      lastArgs = null
      lastCallTime = undefined
      lastThis = null
      timeoutId = null
    }

    function flush(): ReturnType<T> | undefined {
      return timeoutId === null ? result : trailingEdge(Date.now())
    }

    function throttled(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this: any, 
      ...args: Parameters<T>
    ): ReturnType<T> | undefined {
      const time = Date.now()

      if (shouldInvoke(time)) {
        return leadingEdge(time)
      }

      lastArgs = args
      lastThis = this
      lastCallTime = time

      if (timeoutId === null) {
        timeoutId = setTimeout(timerExpired, wait)
      }

      return result
    }

    throttled.cancel = cancel
    throttled.flush = flush

    return throttled as T & { cancel(): void; flush(): ReturnType<T> | undefined }
  },

  /**
   * 创建竞态控制器
   */
  createRaceController(): RaceController {
    return RaceController.create()
  },

  /**
   * 延迟执行
   */
  delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  },

  /**
   * 竞态安全的异步操作
   */
  async raceSafe<T>(
    operation: () => Promise<T>,
    controller: RaceController
  ): Promise<T> {
    return controller.execute(async (signal) => {
      // 检查是否已取消
      if (signal.aborted) {
        throw new Error('Operation was cancelled')
      }

      // 执行操作
      const result = await operation()

      // 再次检查是否已取消
      if (signal.aborted) {
        throw new Error('Operation was cancelled')
      }

      return result
    })
  }
}

/**
 * 便捷导出
 */
export const {
  timeout,
  retry,
  debounce,
  throttle,
  createRaceController,
  delay,
  raceSafe
} = asyncUtils