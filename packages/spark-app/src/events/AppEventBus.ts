/**
 * 应用层事件总线
 * 提供全局应用级事件的发布/订阅（双向：向下广播 + 向上冒泡）
 */

import type { RouteLocationNormalized } from 'vue-router'
import type { UserInfo } from '../types'
import { EventEmitter } from './EventEmitter'

/**
 * 应用级事件接口（双向事件）
 */
export interface AppEvents extends Record<string, (...args: any[]) => void> {
  // === 向下广播（Broadcast Down）- 应用状态变化通知下层 ===
  
  /**
   * 用户登录成功 → 通知所有页面刷新数据
   */
  'user:login': (user: UserInfo) => void

  /**
   * 用户登出 → 通知所有页面清空数据
   */
  'user:logout': () => void

  /**
   * 用户信息更新 → 通知相关页面更新
   */
  'user:updated': (user: Partial<UserInfo>) => void

  /**
   * 全局配置更新 → 通知所有页面重新加载配置
   */
  'config:updated': (config: Record<string, unknown>) => void

  /**
   * 主题变更 → 通知所有页面重新渲染样式
   */
  'theme:changed': (theme: string) => void

  /**
   * 语言变更 → 通知所有页面重新加载文案
   */
  'locale:changed': (locale: string) => void

  /**
   * 应用初始化完成 → 通知所有模块应用已就绪
   */
  'app:initialized': () => void

  /**
   * 应用销毁 → 通知所有模块清理资源
   */
  'app:destroyed': () => void

  // === 向上冒泡（Bubble Up）- 接收来自页面层的事件 ===

  /**
   * 页面错误 → 全局错误处理
   */
  'page:error': (pageId: string, error: Error) => void

  /**
   * 页面导航 → 记录访问轨迹
   */
  'page:navigation': (from: string, to: string) => void

  /**
   * 埋点事件 → 发送到分析服务
   */
  'track:event': (event: string, data: unknown) => void

  /**
   * API 错误 → 全局监控上报
   */
  'api:error': (api: string, error: Error) => void

  /**
   * 路由变化 → 全局路由监控
   */
  'route:changed': (to: RouteLocationNormalized, from: RouteLocationNormalized) => void

  /**
   * 权限变更 → 更新用户权限缓存
   */
  'permissions:changed': (permissions: string[]) => void
}

/**
 * 应用事件总线单例
 */
class AppEventBus extends EventEmitter<AppEvents> {
  private static instance: AppEventBus | null = null

  private constructor() {
    super()
  }

  /**
   * 获取单例实例
   */
  static getInstance(): AppEventBus {
    if (!AppEventBus.instance) {
      AppEventBus.instance = new AppEventBus()
    }
    return AppEventBus.instance
  }

  /**
   * 重置实例（仅用于测试）
   */
  static resetInstance(): void {
    if (AppEventBus.instance) {
      AppEventBus.instance.removeAllListeners()
      AppEventBus.instance = null
    }
  }
}

/**
 * 导出全局应用事件总线实例
 */
export const appEventBus = AppEventBus.getInstance()

/**
 * 类型安全的事件发射辅助函数
 */
export function emitAppEvent<K extends keyof AppEvents>(
  event: K,
  ...args: Parameters<AppEvents[K]>
): void {
  appEventBus.emit(event, ...args)
}

/**
 * 类型安全的事件监听辅助函数
 */
export function onAppEvent<K extends keyof AppEvents>(
  event: K,
  handler: AppEvents[K]
): () => void {
  return appEventBus.on(event, handler)
}

/**
 * 一次性事件监听
 */
export function onceAppEvent<K extends keyof AppEvents>(
  event: K,
  handler: AppEvents[K]
): () => void {
  return appEventBus.once(event, handler)
}

/**
 * 取消事件监听
 */
export function offAppEvent<K extends keyof AppEvents>(
  event: K,
  handler?: AppEvents[K]
): void {
  appEventBus.off(event, handler)
}
