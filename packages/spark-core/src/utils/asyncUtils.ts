// async utilities (migrated from shared)
import { withRetry } from './errorHandler.js'

export interface TimeoutOptions { timeout: number; timeoutMessage?: string }

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
  createRaceController(): RaceController { return RaceController.create() },
  delay(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)) },
  async raceSafe<T>(operation: () => Promise<T>, controller: { execute: (op: (signal: AbortSignal) => Promise<T>) => Promise<T> }) { return controller.execute(async (signal) => { if (signal.aborted) throw new Error('Operation was cancelled'); const result = await operation(); if (signal.aborted) throw new Error('Operation was cancelled'); return result }) }
}