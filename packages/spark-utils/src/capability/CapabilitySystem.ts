/**
 * 能力系统核心
 * 
 * 对外接口：provide(name, impl) / consume(name)
 * 内部实现：上下文管理 + 能力连接
 * 
 * 能力3种类型：
 * - 字面量：直接值
 * - 方法：函数集合
 * - 事件：on/off/emit（EventCapability）
 */

import { Logger } from '../logger.js'
import type { Provider, Consumer, Context, Connector, Manager } from './types.js'

const logger = Logger('Capability')

/**
 * 通用连接器
 * 能力本质就是数据/方法，直接赋值即可
 */
class UniversalConnector implements Connector {
  connect(provider: Provider, consumer: Consumer): boolean {
    try {
      consumer.implementation = provider.implementation
      return true
    } catch (e: unknown) {
      logger.error('连接能力失败:', String(e))
      return false
    }
  }

  disconnect(_provider: Provider, consumer: Consumer): boolean {
    try {
      consumer.implementation = undefined
      return true
    } catch (e: unknown) {
      logger.error('断开能力失败:', String(e))
      return false
    }
  }

  isConnected(_provider: Provider, consumer: Consumer): boolean {
    return consumer.implementation !== undefined
  }
}

/**
 * 能力管理器
 * 职责：连接 Provider 和 Consumer
 */
export class CapabilityManager implements Manager {
  private connector = new UniversalConnector()
  private logger = Logger('CapabilityMgr')

  registerConnector(_name: string, _connector: Connector): void {
    // 已废弃，保留接口兼容
  }

  connectCapability(provider: Provider, consumer: Consumer, _context: Context): boolean {
    try {
      const ok = this.connector.connect(provider, consumer)
      if (ok) {
        this.logger.debug(`🔗 ${provider.name}`)
      }
      return ok
    } catch (e) {
      this.logger.error(`连接失败 '${provider.name}':`, e)
      return false
    }
  }

  disconnectCapability(provider: Provider, consumer: Consumer, _context: Context): boolean {
    try {
      const ok = this.connector.disconnect(provider, consumer)
      if (ok) {
        this.logger.debug(`🔌 ${provider.name}`)
      }
      return ok
    } catch (e) {
      this.logger.error(`断开失败 '${provider.name}':`, e)
      return false
    }
  }
}

/** 创建管理器实例 */
export function createManager(): CapabilityManager {
  return new CapabilityManager()
}
