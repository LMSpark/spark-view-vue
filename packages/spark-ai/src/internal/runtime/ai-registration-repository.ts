/**
 * AI 模块注册仓库。
 *
 * 职责：以 moduleId 为 key 存储和查找 AiModuleRegistration。
 * 注册时委托 AiRuntimeProjector 校验唯一性（moduleId / modulePath / function address）。
 *
 * 注册流程：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 1. AiRuntime 创建时 → 初始化 AiRegistrationRepository          │
 * │    └─ 依赖注入：AiRuntimeProjector（用于唯一性校验）            │
 * │                                                               │
 * │ 2. registerModule(registration)                               │
 * │    ├─ ① projector.assertUniqueRegistrationKeys()              │
 * │    │   → 校验 moduleId 唯一、modulePath 唯一、function address 唯一 │
 * │    ├─ ② 检查 modules Map 是否已有相同 moduleId                 │
 * │    └─ ③ 存储到 Map<moduleId, AiModuleRegistration>            │
 * │                                                               │
 * │ 3. getModuleOrThrow(moduleId) → 查找或抛出                    │
 * │ 4. getModuleRegistration(moduleId) → 查找或返回 undefined      │
 * │ 5. listModuleRegistrations() → 列出全部已注册模块              │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 线程安全：内部使用 Map 存储，注册操作是同步的。
 * 唯一性校验在注册时执行，通过后才会存储，不会出现脏数据。
 */

import type { AiModuleRegistration } from '../../protocol/runtime-contracts'
import type { AiRuntimeProjector } from './ai-runtime-support'

export class AiRegistrationRepository {
  /** 内部存储：moduleId → 模块注册树 */
  private readonly modules = new Map<string, AiModuleRegistration>()

  constructor(private readonly projector: AiRuntimeProjector) {}

  /**
   * 注册模块到仓库。
   *
   * 流程：
   * 1. 调用 projector 校验注册树的唯一性（moduleId / modulePath / function address 不重复）
   * 2. 检查当前仓库中是否已有相同 moduleId（防止跨注册树冲突）
   * 3. 存储到内部 Map
   *
   * 如果 moduleId 已存在则抛出错误，调用方不应重复注册。
   */
  registerModule(registration: AiModuleRegistration): AiModuleRegistration {
    this.projector.assertUniqueRegistrationKeys(registration)
    if (this.modules.has(registration.moduleId)) {
      throw new Error(`Duplicate AI module registration: ${registration.moduleId}`)
    }
    this.modules.set(registration.moduleId, registration)
    return registration
  }

  /**
   * 按 moduleId 查找模块注册树。
   * 不存在时抛出异常，用于调用方明确需要模块但找不到的场景。
   */
  getModuleOrThrow(moduleId: string): AiModuleRegistration {
    const module = this.modules.get(moduleId)
    if (module === undefined) {
      throw new Error(`Unknown AI module registration: ${moduleId}`)
    }
    return module
  }

  /**
   * 按 moduleId 查找模块注册树。
   * 不存在时返回 undefined，用于调用方需要可选读取的场景。
   */
  getModuleRegistration(moduleId: string): AiModuleRegistration | undefined {
    return this.modules.get(moduleId)
  }

  /**
   * 列出所有已注册的模块。
   * 返回只读数组快照，调用方修改不影响内部状态。
   */
  listModuleRegistrations(): readonly AiModuleRegistration[] {
    return Array.from(this.modules.values())
  }
}
