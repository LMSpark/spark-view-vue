import type {
  AiModuleInstanceBinding,
  AiModuleRegistration,
  AiRuntimeActivePathSnapshot,
  AiRuntimeFunctionContextParam,
  AiRuntimeFunctionExposure,
  AiRuntimeInstanceScope,
  AiRuntimeModuleExposure,
} from '../../protocol/runtime-contracts'
// 这里不再为 JS 基础类型保留导出别名，直接使用原生类型。
import type { LlmJsonSchema, LlmParameterSchemaRoot } from '../../protocol/parameter-schema'
import { LlmParamsValidator } from '../llm-params-validator'
import { cloneRuntimeValue } from './runtime-utils'

/**
 * AiRuntime 的无状态支持模块。
 *
 * 这里集中处理快照 clone、模块树投影、上下文参数注入和轻量参数校验。
 * 不保存实例，不发布事件，也不执行注册方函数。
 */

interface ProjectModuleOptions {
  /** 当前要投影的模块注册。 */
  readonly module: AiModuleRegistration
  /** 调用方传入的会话 scope。 */
  readonly scope: AiRuntimeInstanceScope
  /** 父级模块路径 ID，用于递归拼接 modulePath。 */
  readonly parentIds: readonly string[]
  /** 父级模块实例参数，用于注入子函数 schema。 */
  readonly parentContextParams: readonly AiRuntimeFunctionContextParam[]
}

/** 负责把递归模块注册树投影成 LLM 可见知识的无状态工具。 */
export class AiRuntimeProjector {
  constructor(
    /** action 拼接策略，由 facade 注入，保证路径格式集中维护。 */
    private readonly actionOf: (
      modulePath: string,
      functionId: string,
      scope: AiRuntimeInstanceScope,
      contextParams: readonly AiRuntimeFunctionContextParam[],
    ) => string,
    /** ID 校验策略，由 facade 注入，保证注册校验集中维护。 */
    private readonly assertId: (kind: string, value: string) => void,
  ) {}

  /** 克隆函数暴露列表；返回值可安全交给调用方读取。 */
  cloneExposure(functions: readonly AiRuntimeFunctionExposure[]): AiRuntimeFunctionExposure[] {
    return functions.map((item) => ({
      action: item.action,
      moduleId: item.moduleId,
      modulePath: item.modulePath,
      moduleIds: [...item.moduleIds],
      description: item.description,
      paramsSchema: cloneRuntimeValue(item.paramsSchema),
      ...(item.resultSchema !== undefined ? { resultSchema: cloneRuntimeValue(item.resultSchema) } : {}),
      ...(item.maxExecutionMs !== undefined ? { maxExecutionMs: item.maxExecutionMs } : {}),
      ...(item.usageRules !== undefined ? { usageRules: [...item.usageRules] } : {}),
      ...(item.failureModes !== undefined ? { failureModes: item.failureModes.map((mode) => ({ ...mode })) } : {}),
      contextParams: item.contextParams.map((param) => ({ ...param })),
    }))
  }

  /** 克隆递归模块暴露树；返回值可安全交给调用方读取。 */
  cloneModuleExposure(module: AiRuntimeModuleExposure): AiRuntimeModuleExposure {
    return {
      moduleId: module.moduleId,
      modulePath: module.modulePath,
      moduleIds: [...module.moduleIds],
      name: module.name,
      description: module.description,
      ...(module.prompt !== undefined ? { prompt: module.prompt } : {}),
      ...(module.instanceParam !== undefined ? { instanceParam: { ...module.instanceParam } } : {}),
      functions: this.cloneExposure(module.functions),
      modules: module.modules.map((child) => this.cloneModuleExposure(child)),
    }
  }

  /** 根据调用方传入的 active path 生成只读快照。 */
  createActivePathSnapshot(
    scope: AiRuntimeInstanceScope,
    bindings: readonly AiModuleInstanceBinding[] = [],
  ): AiRuntimeActivePathSnapshot {
    return {
      instanceId: scope.instanceId,
      bindings: bindings.map((binding) => ({ ...binding })),
      moduleInstances: this.moduleInstancesFromBindings(bindings),
    }
  }

  /** 投影一个顶层模块注册树；不会保存任何投影状态。 */
  async projectModule(
    module: AiModuleRegistration,
    scope: AiRuntimeInstanceScope,
  ): Promise<AiRuntimeModuleExposure> {
    return this.projectModuleNode({
      module,
      scope,
      parentIds: [],
      parentContextParams: [],
    })
  }

  /** 将递归模块树中的函数展平成 LLM tool 列表。 */
  flattenFunctions(module: AiRuntimeModuleExposure): AiRuntimeFunctionExposure[] {
    return [
      ...module.functions,
      ...module.modules.flatMap((child) => this.flattenFunctions(child)),
    ]
  }

  /** 聚合模块树中的 prompt，形成会话提示词快照。 */
  buildPromptSnapshot(module: AiRuntimeModuleExposure): string {
    const parts: string[] = []
    this.collectPrompts(module, parts)
    return parts.join('\n\n')
  }

  /** 校验注册树中的模块 ID、模块路径和“模块路径 + 函数 ID”不重复。 */
  assertUniqueRegistrationKeys(module: AiModuleRegistration): void {
    this.assertId('moduleId', module.moduleId)
    const moduleIdOwners = new Map<string, string>()
    const modulePaths = new Set<string>()
    const functionAddresses = new Set<string>()
    this.collectRegistrationKeys(module, [], moduleIdOwners, modulePaths, functionAddresses)
  }

  /** 将 active path 绑定转换为参数名到模块实例 ID 的映射。 */
  moduleInstancesFromBindings(bindings: readonly AiModuleInstanceBinding[]): Record<string, string> {
    const out: Record<string, string> = {}
    for (const binding of bindings) {
      if (binding.paramName !== undefined && binding.paramName.trim().length > 0) {
        out[binding.paramName] = binding.instanceId
      }
    }
    return out
  }

  /** 递归投影单个模块节点。 */
  private async projectModuleNode(options: ProjectModuleOptions): Promise<AiRuntimeModuleExposure> {
    const { module, scope, parentIds, parentContextParams } = options
    const moduleIds = [...parentIds, module.moduleId]
    const modulePath = moduleIds.join('/')
    const currentContextParam = module.instanceParam === undefined
      ? null
      : {
          modulePath,
          moduleId: module.moduleId,
          paramName: module.instanceParam.name,
          description: module.instanceParam.description,
        } satisfies AiRuntimeFunctionContextParam

    // 函数 schema 会携带父级/当前模块实例参数，让 LLM 知道必须提供哪些上下文。
    const functions = module.getFunctions().map((definition) => {
      this.assertId('functionId', definition.functionId)
      const contextParams = definition.scope === 'instance' && currentContextParam !== null
        ? [...parentContextParams, currentContextParam]
        : [...parentContextParams]
      return {
        action: this.actionOf(modulePath, definition.functionId, scope, contextParams),
        moduleId: module.moduleId,
        modulePath,
        moduleIds,
        description: definition.description,
        paramsSchema: this.injectContextParamsSchema(definition.paramsSchema, contextParams),
        ...(definition.resultSchema !== undefined ? { resultSchema: definition.resultSchema } : {}),
        ...(definition.maxExecutionMs !== undefined ? { maxExecutionMs: definition.maxExecutionMs } : {}),
        ...(definition.usageRules !== undefined ? { usageRules: definition.usageRules } : {}),
        ...(definition.failureModes !== undefined ? { failureModes: definition.failureModes } : {}),
        contextParams,
      } satisfies AiRuntimeFunctionExposure
    })

    const prompt = await this.modulePrompt(modulePath, module.prompt, scope, moduleIds)
    // 子模块会继承父级实例参数；若当前模块声明 instanceParam，也继续向下传递。
    const childParentParams = currentContextParam === null
      ? parentContextParams
      : [...parentContextParams, currentContextParam]
    const modules: AiRuntimeModuleExposure[] = []
    for (const child of module.modules ?? []) {
      modules.push(await this.projectModuleNode({
        module: child,
        scope,
        parentIds: moduleIds,
        parentContextParams: childParentParams,
      }))
    }

    return {
      moduleId: module.moduleId,
      modulePath,
      moduleIds,
      name: module.name,
      description: module.description,
      ...(prompt !== undefined ? { prompt } : {}),
      ...(module.instanceParam !== undefined ? { instanceParam: module.instanceParam } : {}),
      functions,
      modules,
    }
  }

  private injectContextParamsSchema(
    schema: LlmParameterSchemaRoot,
    contextParams: readonly AiRuntimeFunctionContextParam[],
  ): LlmParameterSchemaRoot {
    // 没有上下文参数时仍然克隆 schema，保证对外快照不可反向修改注册源。
    if (contextParams.length === 0) return cloneRuntimeValue(schema)

    const cloned = cloneRuntimeValue(schema)
    if (Object.keys(cloned).length !== 0 && cloned.type !== 'object') {
      throw new Error('paramsSchema root must be standard JSON Schema type=object')
    }
    const properties: Record<string, LlmJsonSchema> = cloned.properties === undefined ? {} : { ...cloned.properties }
    const required = Array.isArray(cloned.required)
      ? cloned.required.filter((key): key is string => typeof key === 'string')
      : []
    for (const param of contextParams) {
      properties[param.paramName] = {
        type: 'string',
        description: `${param.description}（模块路径: ${param.modulePath}）`,
      }
      if (!required.includes(param.paramName)) required.push(param.paramName)
    }
    const nextSchema: LlmParameterSchemaRoot = {
      ...cloned,
      type: 'object',
      properties,
      required,
    }
    return nextSchema
  }

  private collectPrompts(module: AiRuntimeModuleExposure, parts: string[]): void {
    if (module.prompt !== undefined && module.prompt.trim().length > 0) {
      parts.push(module.prompt)
    }
    for (const child of module.modules) {
      this.collectPrompts(child, parts)
    }
  }

  private collectRegistrationKeys(
    module: AiModuleRegistration,
    parentIds: readonly string[],
    moduleIdOwners: Map<string, string>,
    modulePaths: Set<string>,
    functionAddresses: Set<string>,
  ): void {
    this.assertId('moduleId', module.moduleId)
    const moduleIds = [...parentIds, module.moduleId]
    const modulePath = moduleIds.join('/')
    // LLM action 使用 rootInstanceId/childInstanceId@moduleId@actionName；
    // 因此同一注册树内的 moduleId 必须唯一，否则知识投影无法生成可唯一翻译的函数调用。
    const previousModulePath = moduleIdOwners.get(module.moduleId)
    if (previousModulePath !== undefined) {
      throw new Error(`Duplicate module id in registration tree: ${module.moduleId} (${previousModulePath}, ${modulePath})`)
    }
    moduleIdOwners.set(module.moduleId, modulePath)
    if (modulePaths.has(modulePath)) {
      throw new Error(`Duplicate module path: ${modulePath}`)
    }
    modulePaths.add(modulePath)

    if (module.instanceParam !== undefined) {
      this.assertId(`instanceParam ${modulePath}`, module.instanceParam.name)
    }

    // 同一个模块节点内注册函数键不能重复，整棵树中的目录地址也不能重复。
    const functionIds = new Set<string>()
    for (const definition of module.getFunctions()) {
      this.assertId('functionId', definition.functionId)
      if (functionIds.has(definition.functionId)) {
        throw new Error(`Duplicate function ${definition.functionId} in module ${modulePath}`)
      }
      functionIds.add(definition.functionId)
      const functionAddress = `${modulePath}/${definition.functionId}`
      if (functionAddresses.has(functionAddress)) {
        throw new Error(`Duplicate function address: ${functionAddress}`)
      }
      functionAddresses.add(functionAddress)
    }

    for (const child of module.modules ?? []) {
      this.collectRegistrationKeys(child, moduleIds, moduleIdOwners, modulePaths, functionAddresses)
    }
  }

  private async modulePrompt(
    modulePath: string,
    prompt: AiModuleRegistration['prompt'],
    scope: AiRuntimeInstanceScope,
    moduleIds: readonly string[],
  ): Promise<string | undefined> {
    // 空字符串 prompt 不进入最终 promptSnapshot，避免污染 LLM 上下文。
    if (typeof prompt === 'string') return prompt.trim().length > 0 ? prompt : undefined
    if (prompt === undefined) return undefined
    const resolved = await prompt({ ...scope, modulePath, moduleIds })
    return resolved !== null && resolved.trim().length > 0 ? resolved : undefined
  }
}

/** 翻译阶段使用的轻量参数校验器。 */
export class AiRuntimeArgValidator {
  /** 根据函数投影后的 paramsSchema 校验 LLM args，返回 null 表示通过。 */
  validateArgsBySchema(schema: LlmParameterSchemaRoot, args: unknown): string | null {
    const result = LlmParamsValidator.validateLlmDeserializedParams(args ?? {}, schema)
    return result.ok ? null : LlmParamsValidator.formatLlmParamValidationIssues(result.issues)
  }
}
