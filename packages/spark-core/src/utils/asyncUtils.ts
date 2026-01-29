// async utilities (migrated from shared)
import { withRetry } from './errorHandler.js'

export interface TimeoutOptions { timeout: number; timeoutMessage?: string }
export interface DebounceOptions { leading?: boolean; trailing?: boolean }
export interface ThrottleOptions { leading?: boolean; trailing?: boolean }

export class RaceController {
  private abortController: AbortController | null = null
  static create(): RaceController { return new RaceController() }
  abort(): void {
    if (this.abortController) { this.abortController.abort(); this.abortController = null }
  }
  async execute<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.abort()
    this.abortController = new AbortController()
    const { signal } = this.abortController
    try { return await operation(signal) } finally { this.abortController = null }
  }
  get aborted(): boolean { return this.abortController?.signal.aborted ?? false }
}

export const asyncUtils = {
  timeout<T>(promise: Promise<T>, options: TimeoutOptions): Promise<T> {
    const { timeout, timeoutMessage = 'Operation timed out' } = options
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeout)
      promise.then(resolve).catch(reject).finally(() => clearTimeout(timer))
    })
  },
  async retry<T>(operation: () => Promise<T>, options: Parameters<typeof withRetry>[1]) { return withRetry(operation, options) },
  debounce<T extends (...args: any[]) => any>(func: T, wait: number, options: DebounceOptions = {}) {
    const { leading = false, trailing = true } = options
    let timeoutId: NodeJS.Timeout | null = null
    let lastArgs: Parameters<T> | null = null
    let lastThis: any = null
    let result: ReturnType<T> | undefined
    let lastCallTime: number | undefined
    let lastInvokeTime = 0
    function invokeFunc(time: number): ReturnType<T> { const args = lastArgs!; const thisArg = lastThis; lastArgs = null; lastThis = null; lastInvokeTime = time; result = func.apply(thisArg, args); return result }
    function leadingEdge(time: number): ReturnType<T> { lastInvokeTime = time; timeoutId = setTimeout(timerExpired, wait); return leading ? invokeFunc(time) : result! }
    function remainingWait(time: number): number { const timeSinceLastCall = time - (lastCallTime || 0); const timeWaiting = wait - timeSinceLastCall; return timeWaiting }
    function shouldInvoke(time: number): boolean { const timeSinceLastCall = time - (lastCallTime || 0); const timeSinceLastInvoke = time - lastInvokeTime; return (lastCallTime === undefined || timeSinceLastCall >= wait || timeSinceLastCall < 0 || (leading && timeSinceLastInvoke >= wait)) }
    function timerExpired(): void { const time = Date.now(); if (shouldInvoke(time)) trailingEdge(time); else timeoutId = setTimeout(timerExpired, remainingWait(time)) }
    function trailingEdge(time: number): ReturnType<T> | undefined { timeoutId = null; if (trailing && lastArgs) return invokeFunc(time); lastArgs = null; lastThis = null; return result }
    function cancel(): void { if (timeoutId !== null) clearTimeout(timeoutId); lastInvokeTime = 0; lastArgs = null; lastCallTime = undefined; lastThis = null; timeoutId = null }
    function flush(): ReturnType<T> | undefined { return timeoutId === null ? result : trailingEdge(Date.now()) }
    function debounced(this: any, ...args: Parameters<T>): ReturnType<T> | undefined { const time = Date.now(); const isInvoking = shouldInvoke(time); lastArgs = args; lastThis = this; lastCallTime = time; if (isInvoking) { if (timeoutId === null) return leadingEdge(lastCallTime); if (leading) { timeoutId = setTimeout(timerExpired, wait); return invokeFunc(lastCallTime) } } if (timeoutId === null) timeoutId = setTimeout(timerExpired, wait); return result }
    ;(debounced as any).cancel = cancel
    ;(debounced as any).flush = flush
    return debounced as T & { cancel(): void; flush(): ReturnType<T> | undefined }
  },
  throttle<T extends (...args: any[]) => any>(func: T, wait: number, options: ThrottleOptions = {}) {
    const { leading = true, trailing = true } = options
    let timeoutId: NodeJS.Timeout | null = null
    let lastArgs: Parameters<T> | null = null
    let lastThis: any = null
    let result: ReturnType<T> | undefined
    let lastCallTime: number | undefined
    let lastInvokeTime = 0
    function invokeFunc(time: number): ReturnType<T> { const args = lastArgs!; const thisArg = lastThis; lastArgs = null; lastThis = null; lastInvokeTime = time; result = func.apply(thisArg, args); return result }
    function leadingEdge(time: number): ReturnType<T> { lastInvokeTime = time; timeoutId = setTimeout(timerExpired, wait); return leading ? invokeFunc(time) : result! }
    function remainingWait(time: number): number { const timeSinceLastCall = time - (lastCallTime || 0); const timeWaiting = wait - timeSinceLastCall; return timeWaiting }
    function shouldInvoke(time: number): boolean { const timeSinceLastCall = time - (lastCallTime || 0); const timeSinceLastInvoke = time - lastInvokeTime; return (lastCallTime === undefined || timeSinceLastCall >= wait || timeSinceLastCall < 0 || (leading && timeSinceLastInvoke >= wait)) }
    function timerExpired(): void { const time = Date.now(); if (shouldInvoke(time)) trailingEdge(time); else timeoutId = setTimeout(timerExpired, remainingWait(time)) }
    function trailingEdge(time: number): ReturnType<T> | undefined { timeoutId = null; if (trailing && lastArgs) return invokeFunc(time); lastArgs = null; lastThis = null; return result }
    function cancel(): void { if (timeoutId !== null) clearTimeout(timeoutId); lastInvokeTime = 0; lastArgs = null; lastCallTime = undefined; lastThis = null; timeoutId = null }
    function flush(): ReturnType<T> | undefined { return timeoutId === null ? result : trailingEdge(Date.now()) }
    function throttled(this: any, ...args: Parameters<T>): ReturnType<T> | undefined { const time = Date.now(); if (shouldInvoke(time)) return leadingEdge(time); lastArgs = args; lastThis = this; lastCallTime = time; if (timeoutId === null) timeoutId = setTimeout(timerExpired, wait); return result }
    ;(throttled as any).cancel = cancel
    ;(throttled as any).flush = flush
    return throttled as T & { cancel(): void; flush(): ReturnType<T> | undefined }
  },
  createRaceController(): RaceController { return RaceController.create() },
  delay(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)) },
  async raceSafe<T>(operation: () => Promise<T>, controller: { execute: (op: (signal: AbortSignal) => Promise<T>) => Promise<T> }) { return controller.execute(async (signal) => { if (signal.aborted) throw new Error('Operation was cancelled'); const result = await operation(); if (signal.aborted) throw new Error('Operation was cancelled'); return result }) }
}