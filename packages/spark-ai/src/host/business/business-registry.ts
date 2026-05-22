/**
 * ═══════════════════════════════════════════════════════════════
 * host/business/business-registry.ts — 业务注册表
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】Host 层的业务注册中心。管理所有 AiHostBusinessRegistration，
 *   提供按 moduleId 查询和全量列举能力。注册时自动补全默认 sessionStore。
 *
 * 【注册流程】
 *   1. 业务方构造 AiHostBusinessRegistration
 *   2. 调用 registry.register(registration)
 *   3. 内部检查 moduleId 不重复 → 存入 Map
 *   4. 若未提供 sessionStore → 自动注入 DefaultAiHostSessionStore
 *
 * 【消费方】business-session（resolveRegistration）、Host 初始化代码
 * ═══════════════════════════════════════════════════════════════
 */

import { DefaultAiHostSessionStore } from '../session/default-session-store'
import { AiHostBusinessRegistration } from './business-types'

export class AiHostBusinessRegistry {
  /** moduleId → AiHostBusinessRegistration */
  private readonly registrations = new Map<string, AiHostBusinessRegistration>()

  /**
   * 注册一个业务。
   * 若 moduleId 重复则抛出异常（注册期冲突，非运行时错误）。
   * 若未提供 sessionStore，自动注入内存存储实现。
   */
  public register(registration: AiHostBusinessRegistration): void {
    if (this.registrations.has(registration.moduleId)) {
      throw new Error(`Duplicate AI host business registration: ${registration.moduleId}`)
    }
    this.registrations.set(registration.moduleId, withDefaultSessionStore(registration))
  }

  /** 按 moduleId 查询注册项 */
  public get(moduleId: string): AiHostBusinessRegistration | undefined {
    return this.registrations.get(moduleId)
  }

  /** 列出所有已注册业务 */
  public list(): readonly AiHostBusinessRegistration[] {
    return Array.from(this.registrations.values())
  }
}

/**
 * 确保 registration 持有 sessionStore。
 * 若业务方未提供，自动注入 DefaultAiHostSessionStore（纯内存实现）。
 * 这样业务方在简单场景下无需关心会话持久化细节。
 */
function withDefaultSessionStore(registration: AiHostBusinessRegistration): AiHostBusinessRegistration {
  if (registration.sessionStore !== undefined) return registration
  return new AiHostBusinessRegistration({
    ...registration,
    sessionStore: new DefaultAiHostSessionStore(),
  })
}
