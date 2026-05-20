/**
 * AI 模块注册仓库。
 *
 * 职责：以 moduleId 为 key 存储和查找 AiModuleRegistration。
 * 注册时委托 AiRuntimeProjector 校验唯一性（moduleId / modulePath / function address）。
 *
 * ┌─────────────────────────────────────────┐
 * │        AiRegistrationRepository          │
 * │                                          │
 * │  registerModule() → 校验 → 存储          │
 * │  getModuleOrThrow() → 查找或抛出         │
 * │  getModuleRegistration() → 查找          │
 * │  listModuleRegistrations() → 列出全部     │
 * └─────────────────────────────────────────┘
 */

import type { AiModuleRegistration } from '../../protocol/runtime-contracts'
import type { AiRuntimeProjector } from './ai-runtime-support'

export class AiRegistrationRepository {
  private readonly modules = new Map<string, AiModuleRegistration>()

  constructor(private readonly projector: AiRuntimeProjector) {}

  /** 注册模块：先校验唯一性 → 检查重复 → 存储 */
  registerModule(registration: AiModuleRegistration): AiModuleRegistration {
    this.projector.assertUniqueRegistrationKeys(registration)
    if (this.modules.has(registration.moduleId)) {
      throw new Error(`Duplicate AI module registration: ${registration.moduleId}`)
    }
    this.modules.set(registration.moduleId, registration)
    return registration
  }

  /** 按 moduleId 查找模块，不存在则抛出 */
  getModuleOrThrow(moduleId: string): AiModuleRegistration {
    const module = this.modules.get(moduleId)
    if (module === undefined) {
      throw new Error(`Unknown AI module registration: ${moduleId}`)
    }
    return module
  }

  /** 按 moduleId 查找模块，不存在返回 undefined */
  getModuleRegistration(moduleId: string): AiModuleRegistration | undefined {
    return this.modules.get(moduleId)
  }

  /** 列出所有已注册的模块 */
  listModuleRegistrations(): readonly AiModuleRegistration[] {
    return Array.from(this.modules.values())
  }
}
