/**
 * 已注册模块 API 工厂。
 *
 * 职责：将 AiModuleRegistration 包装为 AiRegisteredModule 实例，
 * 作为 AiRuntime.registerModule() 的返回值，是外部与特定模块交互的唯一公共路径。
 *
 * 在组合根中的位置：
 * ┌──────────────────────────────────────────────────────────┐
 * │ AiRuntime.registerModule(source)                         │
 * │   ├─ ① registrations.registerModule(source)               │
 * │   │   → 存储到仓库 + 校验唯一性                            │
 * │   ├─ ② apiFactory.createRegisteredModuleApi(registration) │
 * │   │   └─ new AiRegisteredModule(                          │
 * │   │        registrations, sessions, projections,          │
 * │   │        translator, executor, registration)            │
 * │   └─ ③ 返回 AiRegisteredModule 句柄                        │
 * │                                                             │
 * │ 依赖注入链：                                                │
 * │ AiRuntime → AiRegisteredApiFactory → AiRegisteredModule   │
 * │   (传入所有内部组件引用，句柄可访问完整运行时能力)           │
 * └──────────────────────────────────────────────────────────┘
 *
 * 使用流程：
 * 1. 外部调用 runtime.registerModule(registration) 获取句柄
 * 2. 通过句柄操作：startSession / stopSession / projectKnowledge
 *    / executeFunctionCall / 读取 registration.functionRegistrations / getSessionHistory
 * 3. 句柄持有对内部组件的引用，但外部无法直接访问组件本身
 */

import type {
  AiModuleRegistration,
} from '../../protocol/runtime-contracts'
import type { AiRegistrationRepository } from './ai-registration-repository'
import type { AiSessionLedger } from './ai-session-ledger'
import type { AiProjectionService } from './ai-projection-service'
import type { AiFunctionCallTranslator } from './ai-function-call-translator'
import type { AiFunctionCallExecutor } from './ai-function-call-executor'
import { AiRegisteredModule } from './ai-registered-module'

export class AiRegisteredApiFactory {
  constructor(
    private readonly registrations: AiRegistrationRepository,
    private readonly sessions: AiSessionLedger,
    private readonly projections: AiProjectionService,
    private readonly translator: AiFunctionCallTranslator,
    private readonly executor: AiFunctionCallExecutor,
  ) {}

  createRegisteredModuleApi(registration: AiModuleRegistration): AiRegisteredModule {
    return new AiRegisteredModule(
      this.registrations,
      this.sessions,
      this.projections,
      this.translator,
      this.executor,
      registration,
    )
  }

}
