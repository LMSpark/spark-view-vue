/**
 * 异步工具函数集合
 * 
 * @description 提供超时控制、重试、延迟等异步操作辅助功能
 */
import { withRetry } from './errorHandler.js'

/**
 * 超时选项
 */
export interface TimeoutOptions {
  /** 超时时间（毫秒） */
  timeout: number
  /** 超时错误消息 */
  timeoutMessage?: string
}

/**
 * 竞态控制器
 * 
 * @description 用于管理可取消的异步操作，确保同一时间只有一个操作在执行
 */
export class RaceController {
  private abortController: AbortController | null = null
  
  /**
   * 创建竞态控制器实例
   */
  static create(): RaceController { return new RaceController() }
  
  /**
   * 取消当前操作
   */
  abort(): void {
    if (this.abortController) { this.abortController.abort(); this.abortController = null }
  }
  
  /**
   * 执行可取消的异步操作
   * 
   * @template T - 操作返回值类型
   * @param operation - 异步操作函数
   * @returns 操作结果
   */
  async execute<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.abort()
    this.abortController = new AbortController()
    const { signal } = this.abortController
    try { return await operation(signal) } finally { this.abortController = null }
  }
  /**
   * 检查操作是否已被取消
   */
  get aborted(): boolean { return this.abortController?.signal.aborted ?? false }
}

/**
 * 异步工具函数集合
 */
export const asyncUtils = {
  /**
   * 为 Promise 添加超时控制
   * 
   * @template T - Promise 返回值类型
   * @param promise - 需要超时控制的 Promise
   * @param options - 超时选项
   * @returns 带超时控制的 Promise
   */
  timeout<T>(promise: Promise<T>, options: TimeoutOptions): Promise<T> {
    const { timeout, timeoutMessage = 'Operation timed out' } = options
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeout)
      promise.then(resolve).catch(reject).finally(() => clearTimeout(timer))
    })
  },
  
  /**
   * 重试失败的异步操作
   * 
   * @template T - 操作返回值类型
   * @param operation - 需要重试的操作
   * @param options - 重试选项
   * @returns 操作结果
   */
  async retry<T>(operation: () => Promise<T>, options: Parameters<typeof withRetry>[1]) { return withRetry(operation, options) },
  
  /**
   * 创建竞态控制器
   * 
   * @returns 竞态控制器实例
   */
  createRaceController(): RaceController { return RaceController.create() },
  
  /**
   * 延迟指定毫秒数
   * 
   * @param ms - 延迟时间（毫秒）
   * @returns 延迟 Promise
   */
  delay(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)) },
  
  /**
   * 安全执行可取消的操作
   * 
   * @template T - 操作返回值类型
   * @param operation - 需要执行的操作
   * @param controller - 竞态控制器
   * @returns 操作结果
   */
  async raceSafe<T>(operation: () => Promise<T>, controller: { execute: (op: (signal: AbortSignal) => Promise<T>) => Promise<T> }) { return controller.execute(async (signal) => { if (signal.aborted) throw new Error('Operation was cancelled'); const result = await operation(); if (signal.aborted) throw new Error('Operation was cancelled'); return result }) }
}
