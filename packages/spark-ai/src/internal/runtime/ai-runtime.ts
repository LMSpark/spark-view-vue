/**
 * SPARK AI 运行时核心组合根（Composition Root）。
 *
 * 职责：组合所有内部组件，提供统一的 AI Runtime 入口。
 * 所有业务操作通过 AiRegisteredModule 句柄访问，防止调用方绕过模块注册边界。
 *
 * 组件依赖链路：
 * ┌─────────────────────────────────────────────────────────┐
 * │                    AiRuntime（入口）                      │
 * │  registerModule() → AiRegisteredModule（唯一公共路径）     │
 * │  getKnowledgeProjection() → AiKnowledgeProjector         │
 * └─────────────────────┬───────────────────────────────────┘
 *                       │
 *          ┌────────────┼────────────┐
 *          ▼            ▼            ▼
 *   ┌───────────┐ ┌──────────┐ ┌───────────────┐
 *   │Registratio│ │ Session  │ │ Projection    │
 *   │nRepository│ │ Ledger   │ │ Service       │
 *   └───────────┘ └──────────┘ └───────┬───────┘
 *                                      │
 *                    ┌─────────────────┼─────────────────┐
 *                    ▼                 ▼                 ▼
 *             ┌────────────┐   ┌────────────┐   ┌─────────────┐
 *             │FunctionCall│   │FunctionCall│   │AiRegistered │
 *             │Translator  │   │Executor    │   │ApiFactory   │
 *             └────────────┘   └────────────┘   └─────────────┘
 *
 * 使用流程：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 1. 创建 AiRuntime 实例（组合所有内部组件）                     │
 * │ 2. registerModule(source) → 存储注册 → 验证唯一性 → 返回句柄  │
 * │ 3. 通过 AiRegisteredModule 操作：                             │
 * │    ├─ startSession() / stopSession()                          │
 * │    ├─ projectKnowledge()                                      │
 * │    ├─ executeFunctionCall()                                   │
 * │    └─ 读取 registration.functionRegistrations / getSessionHistory() │
 * │ 4. getKnowledgeProjection() → 查询全局知识缓存                │
 * └──────────────────────────────────────────────────────────────┘
 */

import type {
  AiModuleRegistration,
  AiRuntimeOptions,
} from '../../protocol/runtime-contracts'
import { AiRuntimeProjector } from './ai-runtime-support'
import { AiRegistrationRepository } from './ai-registration-repository'
import { AiSessionLedger } from './ai-session-ledger'
import { AiProjectionService } from './ai-projection-service'
import { AiFunctionCallTranslator } from './ai-function-call-translator'
import { AiFunctionCallExecutor } from './ai-function-call-executor'
import { AiRegisteredApiFactory } from './ai-registered-api-factory'
import { AiModuleRegistrationNavigator } from './ai-module-registration-navigator'
import type { AiRegisteredModule } from './ai-registered-module'
import {
  actionOf,
  assertRuntimeId,
} from './runtime-utils'
import type { AiKnowledgeProjector } from '../knowledge/knowledge-projection'

/**
 * SPARK AI 运行时核心组合根。
 *
 * 构造函数中按依赖顺序初始化所有组件：
 * 1. projector: 无状态投影器，模块树 → LLM 知识曝光
 * 2. registrations: 注册仓库，存储 AiModuleRegistration 树
 * 3. sessions: 会话账本，内存中的 session 状态与历史记录
 * 4. projections: 知识投射服务，注册信息 → LLM 可用的知识投影
 * 5. translator: 函数调用翻译器，action 字符串 → 可执行的翻译结果
 * 6. executor: 函数调用执行器，执行翻译后的函数调用
 * 7. apiFactory: 模块句柄工厂，根据注册信息创建 AiRegisteredModule
 */
export class AiRuntime {
  /** 无状态投影器：模块树 → LLM 知识曝光 */
  private readonly projector = new AiRuntimeProjector(actionOf, assertRuntimeId)

  /** 注册仓库：存储 AiModuleRegistration 树 */
  private readonly registrations = new AiRegistrationRepository(this.projector)

  /** 会话账本：内存中的 session 状态与历史记录 */
  private readonly sessions: AiSessionLedger

  /** 知识投射服务：注册信息 → LLM 可用的知识投影 */
  private readonly projections: AiProjectionService

  /** 模块树导航器：集中处理注册树和曝光树查找 */
  private readonly moduleNavigator = new AiModuleRegistrationNavigator()

  /** 函数调用翻译器：action 字符串 → 可执行的翻译结果 */
  private readonly translator: AiFunctionCallTranslator

  /** 函数调用执行器：执行翻译后的函数调用 */
  private readonly executor: AiFunctionCallExecutor

  /** 模块句柄工厂：根据注册信息创建 AiRegisteredModule */
  private readonly apiFactory: AiRegisteredApiFactory

  /**
   * 构造函数：按依赖顺序组合所有内部组件。
   *
   * 依赖链路：
   * projector → registrations → sessions → projections → translator → executor → apiFactory
   */
  constructor(options: AiRuntimeOptions = {}) {
    this.sessions = new AiSessionLedger(options)
    this.projections = new AiProjectionService(this.registrations, this.sessions, this.projector)
    this.translator = new AiFunctionCallTranslator(
      this.registrations,
      this.sessions,
      this.projections,
      this.projector,
      this.moduleNavigator,
    )
    this.executor = new AiFunctionCallExecutor(this.sessions, this.translator)
    this.apiFactory = new AiRegisteredApiFactory(
      this.registrations,
      this.sessions,
      this.projections,
      this.translator,
      this.executor,
    )
  }

  /**
   * 注册业务模块到运行时。
   *
   * 流程：
   * 1. 存储注册信息到仓库
   * 2. 验证唯一性（moduleId / modulePath / function address 不重复）
   * 3. 通过 apiFactory 创建模块句柄
   *
   * 返回值 AiRegisteredModule 是外部与当前模块交互的唯一公共路径。
   * 调用方通过句柄操作会话、知识投影和函数调用。
   */
  registerModule(source: AiModuleRegistration): AiRegisteredModule {
    const registration = this.registrations.registerModule(source)
    return this.apiFactory.createRegisteredModuleApi(registration)
  }

  /**
   * 获取全局知识投射缓存。
   *
   * 用于查询所有已注册模块的函数和模块信息，不绑定特定会话。
   * 返回的 AiKnowledgeProjector 包含所有已调用 projectKnowledge() 的模块投影。
   */
  getKnowledgeProjection(): AiKnowledgeProjector {
    return this.projections.getKnowledgeProjection()
  }
}
