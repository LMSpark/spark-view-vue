/**
 * ═══════════════════════════════════════════════════════════════
 * host/business/business-registry.ts — 业务注册表
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】Host 层的业务注册中心。管理所有 AiAgentRegistration，
 *   提供按 moduleId 查询能力。sessionStore 必须由业务注册显式注入。
 *
 * 【注册流程】
 *   1. 业务方构造 AiAgentRegistration
 *   2. AiAgent.reg/ensureReg 委托到内部 registry
 *   3. 内部检查 moduleId 不重复 → 存入 Map
 *
 * 【消费方】business-session（resolveRegistration）、Host 初始化代码
 * ═══════════════════════════════════════════════════════════════
 */

import { isRecord } from '@spark-view/spark-utils'
import type { AiJsonParams } from '../../json'
import type { AiAgentRegistration } from './registration-types'

export class AiAgentRegistry<TInput extends AiJsonParams = AiJsonParams> {
  /** moduleId → AiAgentRegistration */
  private readonly registrations = new Map<string, AiAgentRegistration<TInput>>()

  /**
   * 注册一个业务。
   * 若 moduleId 重复则抛出异常（注册期冲突，非运行时错误）。
   */
  public register(registration: AiAgentRegistration<TInput>): void {
    if (this.registrations.has(registration.moduleId)) {
      throw new Error(`Duplicate AI host business registration: ${registration.moduleId}`)
    }
    if (!hasExplicitSessionStore(registration)) {
      throw new Error(`AI agent registration requires explicit sessionStore: ${registration.moduleId}`)
    }
    this.registrations.set(registration.moduleId, registration)
  }

  /** 按 moduleId 查询注册项 */
  public get(moduleId: string): AiAgentRegistration<TInput> | undefined {
    return this.registrations.get(moduleId)
  }
}

function hasExplicitSessionStore(value: unknown): boolean {
  return isRecord(value) && 'sessionStore' in value && value['sessionStore'] !== undefined
}
