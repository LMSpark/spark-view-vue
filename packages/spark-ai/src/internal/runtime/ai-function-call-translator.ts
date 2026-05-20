/**
 * AI 函数调用翻译器。
 *
 * 职责：将 LLM 产生的 action 字符串翻译为可执行的函数调用上下文。
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │              AiFunctionCallTranslator                          │
 * │                                                               │
 * │  translateFunctionCall()                                      │
 * │    ├─ ① normalizeScope + 检查会话状态                          │
 * │    ├─ ② parseActionPath(action) → 解析实例路径/模块/函数       │
 * │    ├─ ③ 校验模块匹配（MODULE_MISMATCH / CONTEXT_MISMATCH）     │
 * │    ├─ ④ 查找目标模块注册（递归或按 ID 搜索）                    │
 * │    ├─ ⑤ 获取知识投影 → 查找匹配的 FunctionExposure             │
 * │    ├─ ⑥ 校验 action 实例路径长度和根实例                       │
 * │    ├─ ⑦ 合并 activePath → 归一化                              │
 * │    ├─ ⑧ 注入上下文参数到 args → 校验 schema                   │
 * │    └─ ⑨ 构建 FunctionExecutionContext + Translation           │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 失败码：INVALID_ACTION / MODULE_MISMATCH / CONTEXT_MISMATCH /
 *         MODULE_AMBIGUOUS / MODULE_NOT_AVAILABLE / PROJECTION_SCOPE_MISMATCH /
 *         FUNCTION_AMBIGUOUS / FUNCTION_NOT_AVAILABLE /
 *         INVALID_ACTION_INSTANCE_PATH / INVALID_ARGS / MISSING_CONTEXT_INSTANCE
 */

import type {
  AiModuleInstanceBinding,
  AiModuleRegistration,
  AiRuntimeFunctionCallFailure,
  AiRuntimeFunctionCallTranslation,
  AiRuntimeFunctionCallTranslationResult,
  AiRuntimeFunctionExposure,
  AiRuntimeModuleExposure,
  AiRuntimeProjectKnowledgeOptions,
  AiRuntimeTranslateFunctionCallOptions,
  FunctionExecutionContext,
} from '../../protocol/runtime-contracts'
import { AiInvocationProtocol, type ActionPathParts } from '../invocation-helpers'
import {
  AiRuntimeArgValidator,
} from './ai-runtime-support'
import type { AiRuntimeProjector } from './ai-runtime-support'
import type { AiRegistrationRepository } from './ai-registration-repository'
import type { AiProjectionService } from './ai-projection-service'
import type { AiSessionLedger } from './ai-session-ledger'
import {
  createFunctionCallFailure,
  isRecord,
} from './runtime-utils'

export class AiFunctionCallTranslator {
  private readonly argValidator = new AiRuntimeArgValidator()

  constructor(
    private readonly registrations: AiRegistrationRepository,
    private readonly sessions: AiSessionLedger,
    private readonly projections: AiProjectionService,
    private readonly projector: AiRuntimeProjector,
  ) {}

  /**
   * 翻译函数调用。
   * 核心流程：校验会话 → 解析 action → 查找模块 → 获取投影 → 匹配函数 → 注入上下文 → 校验 schema。
   * 每一步失败均返回 FunctionCallFailure，成功则返回 translation。
   */
  async translateFunctionCall(
    options: AiRuntimeTranslateFunctionCallOptions,
  ): Promise<AiRuntimeFunctionCallTranslationResult> {
    const scope = this.sessions.normalizeScope(options)
    // 阶段 1：检查会话状态
    const sessionFailure = this.sessions.getSessionFailure(scope)
    if (sessionFailure !== null) return sessionFailure
    try {
      this.sessions.bindSessionAliases(scope)
    } catch (error) {
      return createFunctionCallFailure(
        'SESSION_ALIAS_CONFLICT',
        AiInvocationProtocol.toErrorMessage(error),
        'Use a distinct AI session instanceId, or keep the same moduleId/moduleInstanceId scope for this alias.',
      )
    }
    const session = this.sessions.requireStartedSession(scope)

    // 阶段 2：解析 action 路径
    let address: ActionPathParts
    try {
      address = AiInvocationProtocol.parseActionPath(options.action)
    } catch (error) {
      return createFunctionCallFailure('INVALID_ACTION', AiInvocationProtocol.toErrorMessage(error), 'Use action format rootInstance[/childInstance]@module@actionName.')
    }

    if (address.format === 'legacy' && address.moduleIds[0] !== scope.moduleId) {
      return createFunctionCallFailure(
        'MODULE_MISMATCH',
        `Action ${options.action} targets module ${address.moduleIds[0] ?? ''}, but current scope is ${scope.moduleId}.`,
        'Use an action from the projected functions for the same module scope.',
      )
    }

    if (address.format === 'instance' && address.instanceIds[0] !== session.moduleInstanceId) {
      return createFunctionCallFailure(
        'CONTEXT_MISMATCH',
        `Action ${options.action} targets root instance ${address.instanceIds[0] ?? ''}, but current root entity is ${session.moduleInstanceId}.`,
        'Use the root module instance id from the current session as the action prefix.',
      )
    }

    // 阶段 3 & 4：查找目标模块注册
    const rootModule = this.registrations.getModuleOrThrow(scope.moduleId)
    let targetModule: AiModuleRegistration | null
    try {
      targetModule = address.format === 'instance'
        ? this.findModuleRegistrationByModuleId(rootModule, address.moduleId)
        : this.findModuleRegistration(rootModule, address.moduleIds)
    } catch (error) {
      return createFunctionCallFailure(
        'MODULE_AMBIGUOUS',
        AiInvocationProtocol.toErrorMessage(error),
        'Use unique module IDs in the registration tree, or extend the action module segment to a unique module path.',
      )
    }
    if (targetModule === null) {
      return createFunctionCallFailure(
        'MODULE_NOT_AVAILABLE',
        `Module path ${address.modulePath} is not registered under module ${scope.moduleId}.`,
        'Use a module path exposed by the current module registration.',
      )
    }

    // 阶段 5：获取知识投影并查找匹配的函数曝光
    const projection = options.projection ?? await this.projections.projectKnowledge(scope)
    if (projection.scope.moduleId !== scope.moduleId || projection.scope.moduleInstanceId !== scope.moduleInstanceId) {
      return createFunctionCallFailure(
        'PROJECTION_SCOPE_MISMATCH',
        `Projection scope ${projection.scope.moduleId}/${projection.scope.moduleInstanceId} does not match ${scope.moduleId}/${scope.moduleInstanceId}.`,
        'Project functions again for the same module scope before translating this call.',
      )
    }

    let exposure: AiRuntimeFunctionExposure | undefined
    try {
      exposure = this.findFunctionExposure(projection.availableFunctions, address, options.action)
    } catch (error) {
      return createFunctionCallFailure(
        'FUNCTION_AMBIGUOUS',
        AiInvocationProtocol.toErrorMessage(error),
        'Use unique module/function pairs in the LLM projection.',
      )
    }
    if (exposure === undefined) {
      return createFunctionCallFailure(
        'FUNCTION_NOT_AVAILABLE',
        `Function ${options.action} is not available in the current LLM knowledge projection.`,
        'Use one of projection.availableFunctions for this module scope.',
      )
    }

    // 阶段 6：校验 action 实例路径
    const actionPathError = this.validateActionInstancePath(address, exposure, session)
    if (actionPathError !== null) return actionPathError

    // 阶段 7：查找函数定义
    const definition = targetModule.functionRegistrations.find((candidate) => candidate.functionId === address.function)
    if (definition === undefined) {
      return createFunctionCallFailure(
        'FUNCTION_DEFINITION_MISSING',
        `Function definition ${options.action} is missing from module ${address.modulePath}.`,
        'Fix the module registration so registered functions and exposed actions stay aligned.',
      )
    }

    // 阶段 8：合并 activePath → 注入上下文参数 → 校验 schema
    const mergedActivePath = this.mergeActionInstancePath(address, exposure, options.activePath ?? [], session)
    if ('ok' in mergedActivePath) return mergedActivePath
    const activePath = this.normalizeActivePath(projection.module, mergedActivePath)
    const contextArgs = this.prepareExecutionArgs(scope, exposure, options.args, activePath)
    if ('ok' in contextArgs) return contextArgs

    const validationError = this.argValidator.validateArgsBySchema(exposure.paramsSchema, contextArgs.effectiveArgs)
    if (validationError !== null) {
      return createFunctionCallFailure('INVALID_ARGS', validationError, `Use paramsSchema from projection.availableFunctions for ${options.action}.`)
    }

    const context: FunctionExecutionContext = {
      instanceId: session.instanceId,
      runtimeInstanceId: session.runtimeInstanceId,
      moduleId: session.moduleId,
      moduleInstanceId: session.moduleInstanceId,
      modulePath: exposure.modulePath,
      moduleIds: exposure.moduleIds,
      functionId: address.function,
      action: options.action,
      moduleInstances: contextArgs.moduleInstances,
      activePath: this.projector.createActivePathSnapshot(session, activePath),
    }

    const translation: AiRuntimeFunctionCallTranslation = {
      action: options.action,
      rawArgs: options.args,
      effectiveArgs: contextArgs.effectiveArgs,
      executionArgs: contextArgs.executionArgs,
      context,
      exposure,
      moduleRegistration: targetModule,
      functionRegistration: definition,
    }
    return { ok: true, translation }
  }

  // ═══════════════════════════════════════════════════════
  // 内部辅助：上下文参数注入 & 执行参数准备
  // ═══════════════════════════════════════════════════════

  /**
   * 准备执行参数。
   *
   * 流程：
   * 1. 遍历函数曝光的 contextParams（上下文参数列表）
   * 2. 对每个 context param，从 activePath 或 rawArgs 中解析模块实例 ID
   * 3. 校验类型和一致性（不能同时传入矛盾的 instanceId）
   * 4. 将上下文参数注入 effectiveArgs，同时从 executionArgs 中移除
   *
   * 返回值：
   * - effectiveArgs: 包含上下文参数的完整参数（用于 schema 校验）
   * - executionArgs: 移除了上下文参数的纯业务参数（传给执行器）
   * - moduleInstances: paramName → instanceId 的映射
   */
  private prepareExecutionArgs(
    scope: AiRuntimeProjectKnowledgeOptions,
    exposure: AiRuntimeFunctionExposure,
    rawArgs: unknown,
    activePath: readonly AiModuleInstanceBinding[],
  ): {
    effectiveArgs: Record<string, unknown>
    executionArgs: unknown
    moduleInstances: Readonly<Record<string, string>>
  } | AiRuntimeFunctionCallFailure {
    const args = isRecord(rawArgs) ? { ...rawArgs } : rawArgs
    const effectiveArgs = isRecord(args) ? { ...args } : {}
    let executionArgs = isRecord(args) ? { ...args } : args
    const moduleInstances: Record<string, string> = {}

    for (const param of exposure.contextParams) {
      const active = this.resolveActiveBinding(scope, activePath, param.modulePath, param.paramName)
      const fromArgs = isRecord(rawArgs) ? rawArgs[param.paramName] : undefined
      if (fromArgs !== undefined && typeof fromArgs !== 'string') {
        return createFunctionCallFailure(
          'INVALID_ARGS',
          `${exposure.action} expects ${param.paramName} to be a string module instance id.`,
          `Pass a string ${param.paramName}, or provide activePath for ${param.modulePath}.`,
        )
      }
      if (active !== undefined && fromArgs !== undefined && active.instanceId !== fromArgs) {
        return createFunctionCallFailure(
          'CONTEXT_MISMATCH',
          `${exposure.action} received ${param.paramName}=${fromArgs}, but active path ${param.modulePath} is ${active.instanceId}.`,
          'Use the active module instance id or update activePath before retrying.',
        )
      }
      const value = fromArgs ?? active?.instanceId
      if (typeof value !== 'string' || value.trim().length === 0) {
        return createFunctionCallFailure(
          'MISSING_CONTEXT_INSTANCE',
          `${exposure.action} requires module instance ${param.paramName} for ${param.modulePath}.`,
          `Pass ${param.paramName} in args or provide activePath for ${param.modulePath}.`,
        )
      }
      effectiveArgs[param.paramName] = value
      moduleInstances[param.paramName] = value
      if (isRecord(executionArgs)) {
        const { [param.paramName]: _unused, ...rest } = executionArgs
        void _unused
        executionArgs = rest
      }
    }

    return {
      effectiveArgs,
      executionArgs,
      moduleInstances,
    }
  }

  // ═══════════════════════════════════════════════════════
  // 内部辅助：ActivePath 归一化
  // ═══════════════════════════════════════════════════════

  /** 批量归一化 activePath 中的每个 binding */
  private normalizeActivePath(
    module: AiRuntimeModuleExposure,
    bindings: readonly AiModuleInstanceBinding[],
  ): AiModuleInstanceBinding[] {
    return bindings.map((binding) => this.normalizeActivePathBinding(module, binding))
  }

  /**
   * 归一化单个 activePath binding。
   * 校验模块在曝光树中存在，并补充 paramName（默认使用模块的 instanceParam.name）。
   */
  private normalizeActivePathBinding(module: AiRuntimeModuleExposure, binding: AiModuleInstanceBinding): AiModuleInstanceBinding {
    const target = this.findModuleExposure(module, binding.modulePath)
    if (target === null) {
      throw new Error(`Unknown active path module: ${binding.modulePath}`)
    }
    const paramName = binding.paramName ?? target.instanceParam?.name
    if (paramName === undefined || paramName.trim().length === 0) {
      throw new Error(`Active path module ${binding.modulePath} does not declare instanceParam; pass paramName explicitly.`)
    }
    return {
      modulePath: binding.modulePath,
      instanceId: binding.instanceId,
      paramName,
    }
  }

  /**
   * 解析活跃绑定：按 modulePath 或 paramName 在 activePath 中查找。
   * 如果未找到且 modulePath 等于当前 scope.moduleId，则回退到 scope.moduleInstanceId。
   */
  private resolveActiveBinding(
    scope: AiRuntimeProjectKnowledgeOptions,
    activePath: readonly AiModuleInstanceBinding[],
    modulePath: string,
    paramName: string,
  ): AiModuleInstanceBinding | undefined {
    const active = activePath.find((binding) => binding.modulePath === modulePath || binding.paramName === paramName)
    if (active !== undefined) return active
    if (modulePath === scope.moduleId) {
      return { modulePath, paramName, instanceId: scope.moduleInstanceId }
    }
    return undefined
  }

  // ═══════════════════════════════════════════════════════
  // 内部辅助：模块和函数查找
  // ═══════════════════════════════════════════════════════

  /**
   * 按 moduleIds 数组递归查找模块注册。
   * moduleIds[0] 必须是当前模块的 moduleId，后续元素逐层深入子模块。
   */
  private findModuleRegistration(module: AiModuleRegistration, moduleIds: readonly string[]): AiModuleRegistration | null {
    if (moduleIds.length === 0 || module.moduleId !== moduleIds[0]) return null
    let current: AiModuleRegistration = module
    for (const moduleId of moduleIds.slice(1)) {
      const child = (current.modules ?? []).find((candidate) => candidate.moduleId === moduleId)
      if (child === undefined) return null
      current = child
    }
    return current
  }

  /**
   * 按 moduleId 在注册树中递归查找（不考虑路径，仅按 ID 匹配）。
   * 如果找到多个同名模块则抛出 MODULE_AMBIGUOUS 错误。
   */
  private findModuleRegistrationByModuleId(module: AiModuleRegistration, moduleId: string): AiModuleRegistration | null {
    const found: AiModuleRegistration[] = []
    this.collectModuleRegistrationsById(module, moduleId, found)
    if (found.length === 1) return found[0] ?? null
    if (found.length > 1) {
      throw new Error(`Ambiguous AI module id in registration tree: ${moduleId}`)
    }
    return null
  }

  /** 递归收集所有匹配 moduleId 的模块注册（用于 findModuleRegistrationByModuleId） */
  private collectModuleRegistrationsById(module: AiModuleRegistration, moduleId: string, out: AiModuleRegistration[]): void {
    if (module.moduleId === moduleId) out.push(module)
    for (const child of module.modules ?? []) {
      this.collectModuleRegistrationsById(child, moduleId, out)
    }
  }

  /**
   * 在函数曝光列表中查找匹配的函数。
   *
   * 查找策略：
   * - legacy 格式（无实例路径）：按 action 字符串精确匹配
   * - instance 格式：按 moduleId + function 匹配，如果找到多个则抛出 FUNCTION_AMBIGUOUS
   */
  private findFunctionExposure(
    functions: readonly AiRuntimeFunctionExposure[],
    address: ActionPathParts,
    action: string,
  ): AiRuntimeFunctionExposure | undefined {
    if (address.format === 'legacy') {
      return functions.find((candidate) => candidate.action === action)
    }
    const found = functions.filter((candidate) => {
      const parsed = AiInvocationProtocol.tryParseActionPath(candidate.action)
      return candidate.moduleId === address.moduleId && parsed?.function === address.function
    })
    if (found.length > 1) {
      throw new Error(`Ambiguous AI function action: ${action}`)
    }
    return found[0]
  }

  // ═══════════════════════════════════════════════════════
  // 内部辅助：实例路径合并与校验
  // ═══════════════════════════════════════════════════════

  /**
   * 合并 action 实例路径与 activePath。
   *
   * 流程：
   * 1. 遍历 exposure 的 contextParams
   * 2. 从 action 的 instanceIds 中提取对应位置的实例 ID
   * 3. 校验是否与 activePath 中的 binding 冲突
   * 4. 构建新的 bindings 列表并追加 activePath
   *
   * legacy 格式的 action 不携带实例路径，直接返回 activePath。
   */
  private mergeActionInstancePath(
    address: ActionPathParts,
    exposure: AiRuntimeFunctionExposure,
    activePath: readonly AiModuleInstanceBinding[],
    scope: AiRuntimeProjectKnowledgeOptions,
  ): readonly AiModuleInstanceBinding[] | AiRuntimeFunctionCallFailure {
    if (address.format === 'legacy') return activePath
    const bindings: AiModuleInstanceBinding[] = []
    const contextParams = exposure.contextParams
    for (let index = 0; index < contextParams.length; index++) {
      const param = contextParams[index]
      const instanceId = address.instanceIds[index]
      if (param === undefined || instanceId === undefined) continue
      if (param.modulePath === scope.moduleId) continue
      const conflict = activePath.find((binding) => (
        binding.modulePath === param.modulePath || binding.paramName === param.paramName
      ))
      if (conflict !== undefined && conflict.instanceId !== instanceId) {
        return createFunctionCallFailure(
          'CONTEXT_MISMATCH',
          `Action ${address.instanceIds.join('/')} uses ${param.paramName}=${instanceId}, but active path ${param.modulePath} is ${conflict.instanceId}.`,
          'Use the same child instance id in the action path and activePath, or refresh the activePath snapshot.',
        )
      }
      bindings.push({
        modulePath: param.modulePath,
        paramName: param.paramName,
        instanceId,
      })
    }
    return [...bindings, ...activePath]
  }

  /**
   * 校验 action 实例路径长度和根实例。
   *
   * 校验规则：
   * - instanceIds 长度必须等于 contextParams 数量（至少为 1）
   * - 根实例（instanceIds[0]）必须等于 scope.moduleInstanceId
   *
   * legacy 格式不携带实例路径，跳过此校验。
   */
  private validateActionInstancePath(
    address: ActionPathParts,
    exposure: AiRuntimeFunctionExposure,
    scope: AiRuntimeProjectKnowledgeOptions,
  ): AiRuntimeFunctionCallFailure | null {
    if (address.format === 'legacy') return null
    const expectedLength = Math.max(1, exposure.contextParams.length)
    if (address.instanceIds.length !== expectedLength) {
      return createFunctionCallFailure(
        'INVALID_ACTION_INSTANCE_PATH',
        `${exposure.action} expects ${expectedLength} instance id(s), but received ${address.instanceIds.length}.`,
        'Use rootInstance[/childInstance] from the projected action path; when an instance id contains / or @, keep it URI-encoded.',
      )
    }
    if (address.instanceIds[0] !== scope.moduleInstanceId) {
      return createFunctionCallFailure(
        'CONTEXT_MISMATCH',
        `Action root instance ${address.instanceIds[0] ?? ''} does not match current root entity ${scope.moduleInstanceId}.`,
        'Use the root module instance id from the current AI session.',
      )
    }
    return null
  }

  /** 在模块曝光树中按 modulePath 递归查找 */
  private findModuleExposure(module: AiRuntimeModuleExposure, modulePath: string): AiRuntimeModuleExposure | null {
    if (module.modulePath === modulePath) return module
    for (const child of module.modules) {
      const found = this.findModuleExposure(child, modulePath)
      if (found !== null) return found
    }
    return null
  }
}
