/**
 * 能力系统核心
 * 
 * @deprecated 此文件将在未来版本中移除，请使用 provide/consume/consumeInherited 函数
 * 
 * 保留此文件仅为兼容旧代码，新代码请使用：
 * - provide(context, name, implementation)
 * - consume(context, name)
 * - consumeInherited(context, name)
 */

import { Logger } from '../logger.js'
import type { Provider, Consumer, Context } from './types.js'

/**
 * 能力管理器（已废弃）
 * 
 * @deprecated 请使用 provide/consume 函数
 * 
 * 保留此类仅为兼容旧代码
 */
export class CapabilityManager<P extends Provider = Provider, C extends Consumer = Consumer> {
  private logger = Logger('CapabilityMgr')

  /**
   * @deprecated 无操作，保留接口兼容
   */
  registerConnector(_name: string, _connector: unknown): void {
    // 无操作
  }

  /**
   * 连接能力
   * @deprecated 请使用 provide() 函数
   */
  connectCapability(provider: P, consumer: C, _context: Context<P>): boolean {
    try {
      consumer.implementation = provider.implementation as C['implementation']
      this.logger.debug(`🔗 ${provider.name}`)
      return true
    } catch (e) {
      this.logger.error(`连接失败 '${provider.name}':`, e)
      return false
    }
  }

  /**
   * 断开能力
   * @deprecated 直接设置 consumer.implementation = undefined
   */
  disconnectCapability(provider: P, consumer: C, _context: Context<P>): boolean {
    try {
      consumer.implementation = undefined
      this.logger.debug(`🔌 ${provider.name}`)
      return true
    } catch (e) {
      this.logger.error(`断开失败 '${provider.name}':`, e)
      return false
    }
  }
}

/**
 * 创建管理器实例
 * @deprecated 请使用 provide/consume 函数
 */
export function createManager(): CapabilityManager {
  return new CapabilityManager()
}
