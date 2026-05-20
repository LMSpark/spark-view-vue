/**
 * AI Runtime 无状态支持模块。
 *
 * 集中处理快照 clone、模块树投影、上下文参数注入和轻量参数校验。
 * 不保存实例、不发布事件、也不执行注册方函数。
 *
 * 类职责分组：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 1. AiRuntimeProjector（核心投影器）                           │
 * │    ├─ projectModule()         → 投影顶层模块注册树             │
 * │    ├─ projectModuleNode()     → 递归投影单个模块节点           │
 * │    ├─ flattenFunctions()      → 展平模块树中的函数列表         │
 * │    ├─ buildPromptSnapshot()   → 聚合模块树的 prompt 文本       │
 * │    ├─ injectContextParamsSchema() → 注入上下文参数到 schema   │
 * │    ├─ cloneExposure()         → 深拷贝函数曝光列表             │
 * │    ├─ cloneModuleExposure()   → 深拷贝模块曝光树               │
 * │    ├─ createActivePathSnapshot() → 创建 active path 快照      │
 * │    ├─ assertUniqueRegistrationKeys() → 校验注册唯一性         │
 * │    └─ moduleInstancesFromBindings() → active path → 映射      │
 * │                                                               │
 * │ 2. AiRuntimeArgValidator（轻量参数校验器）                     │
 * │    └─ validateArgsBySchema()  → 按 paramsSchema 校验 LLM args │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 投影流程详解（projectModuleNode）：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 输入：AiModuleRegistration 树 + AiRuntimeInstanceScope        │
 * │                                                               │
 * │ 步骤 1：计算当前模块的 moduleIds 和 modulePath                 │
 * │    └─ moduleIds = [...parentIds, module.moduleId]             │
 * │    └─ modulePath = moduleIds.join('/')                        │
 * │                                                               │
 * │ 步骤 2：构建当前模块的上下文参数（contextParam）               │
 * │    └─ 如果模块声明了 instanceParam，则构建 AiRuntimeFunctionContextParam │
 * │    └─ modulePath + moduleId + paramName + description         │
 * │                                                               │
 * │ 步骤 3：投影模块中的函数列表                                   │
 * │    ├─ 遍历 module.getFunctions()                              │
 * │    ├─ 确定 contextParams：instance 作用域携带当前模块的 contextParam │
 * │    ├─ 拼接 action 字符串（由 actionOf 策略决定）               │
 * │    ├─ 注入上下文参数到 paramsSchema（在 properties 中新增字段） │
 * │    └─ 保留 resultSchema、maxExecutionMs、usageRules、failureModes │
 * │                                                               │
 * │ 步骤 4：聚合模块 prompt                                        │
 * │    └─ 同步 prompt 直接使用；异步 prompt 调用后 await           │
 * │    └─ 空字符串 prompt 被过滤，避免污染 LLM 上下文              │
 * │                                                               │
 * │ 步骤 5：递归投影子模块                                         │
 * │    └─ 子模块继承父级的 contextParams                           │
 * │    └─ 如果当前模块声明了 instanceParam，也继续向下传递         │
 * │                                                               │
 * │ 输出：AiRuntimeModuleExposure（递归模块曝光树）                │
 * └──────────────────────────────────────────────────────────────┘
 */

import type {
  AiModuleInstanceBinding,
  AiModuleRegistration,
  AiRuntimeActivePathSnapshot,
  AiRuntimeFunctionContextParam,
  AiRuntimeFunctionExposure,
  AiRuntimeInstanceScope,
  AiRuntimeModuleExposure,
} from '../../protocol/runtime-contracts'
import type { LlmJsonSchema, LlmParameterSchemaRoot } from '../../protocol/parameter-schema'
import { LlmParamsValidator } from '../llm-params-validator'
import { cloneRuntimeValue } from './runtime-utils'

// ═══════════════════════════════════════════════════════
// 内部类型
// ═══════════════════════════════════════════════════════

/** projectModuleNode 的输入参数，包含递归所需的上下文状态 */
interface ProjectModuleOptions {
  /** 当前要投影的模块注册 */
  readonly module: AiModuleRegistration
  /** 调用方传入的会话 scope */
  readonly scope: AiRuntimeInstanceScope
  /** 父级模块路径 ID 数组，用于递归拼接 modulePath */
  readonly parentIds: readonly string[]
  /** 父级模块的实例参数，用于注入到子函数的 schema 中 */
  readonly parentContextParams: readonly AiRuntimeFunctionContextParam[]
}

// ═══════════════════════════════════════════════════════
// AiRuntimeProjector - 模块树投影器
// ═══════════════════════════════════════════════════════

/**
 * 负责把递归模块注册树投影成 LLM 可见知识的无状态工具。
 *
 * 所有方法都是无状态的：不保存投影结果，不修改注册源。
 * 投影结果通过返回值交给调用方处理。
 *
 * 构造时注入两个策略：
 * - actionOf: action 字符串拼接策略（由 facade 注入，保证路径格式集中维护）
 * - assertId: ID 校验策略（由 facade 注入，保证注册校验集中维护）
 */
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

  // ═══════════════════════════════════════════════════════
  // 公共 API - 克隆
  // ═══════════════════════════════════════════════════════

  /**
   * 克隆函数暴露列表。
   * 返回值可安全交给调用方读取，修改不影响原始注册源。
   * 深拷贝 paramsSchema、resultSchema、usageRules、failureModes 等可变字段。
   */
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

  /**
   * 克隆递归模块曝光树。
   * 返回值可安全交给调用方读取，修改不影响原始注册源。
   * 递归克隆子模块，保证整棵树不可变。
   */
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

  // ═══════════════════════════════════════════════════════
  // 公共 API - 投影
  // ═══════════════════════════════════════════════════════

  /**
   * 投影一个顶层模块注册树。
   * 不会保存任何投影状态，返回值交给调用方处理。
   *
   * 这是知识投射的入口方法，内部委托 projectModuleNode() 递归处理。
   */
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

  /**
   * 递归投影单个模块节点。
   *
   * 核心流程：
   * 1. 计算 moduleIds 和 modulePath
   * 2. 构建当前模块的 contextParam（如果有 instanceParam）
   * 3. 投影函数列表：注入上下文参数到 schema、拼接 action 字符串
   * 4. 聚合模块 prompt
   * 5. 递归投影子模块（继承父级 contextParams）
   * 6. 返回 AiRuntimeModuleExposure
   */
  private async projectModuleNode(options: ProjectModuleOptions): Promise<AiRuntimeModuleExposure> {
    const { module, scope, parentIds, parentContextParams } = options
    const moduleIds = [...parentIds, module.moduleId]
    const modulePath = moduleIds.join('/')

    // 构建当前模块的上下文参数（如果声明了 instanceParam）
    const currentContextParam = module.instanceParam === undefined
      ? null
      : {
          modulePath,
          moduleId: module.moduleId,
          paramName: module.instanceParam.name,
          description: module.instanceParam.description,
        } satisfies AiRuntimeFunctionContextParam

    // 投影函数列表：为每个函数生成 action、注入上下文参数到 schema
    const functions = module.getFunctions().map((definition) => {
      this.assertId('functionId', definition.functionId)
      // instance 作用域的函数携带当前模块的 contextParam，其他作用域只携带父级的
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

    // 聚合模块 prompt（同步或异步）
    const prompt = await this.modulePrompt(modulePath, module.prompt, scope, moduleIds)

    // 子模块继承父级 contextParams；若当前模块声明了 instanceParam，也继续向下传递
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

  // ═══════════════════════════════════════════════════════
  // 公共 API - 展平 & 聚合
  // ═══════════════════════════════════════════════════════

  /**
   * 将递归模块树中的函数展平成 LLM tool 列表。
   * 递归遍历所有子模块，将所有函数收集到一个扁平数组中。
   *
   * 用途：生成 availableFunctions 列表，供 LLM 查询和工具编码使用。
   */
  flattenFunctions(module: AiRuntimeModuleExposure): AiRuntimeFunctionExposure[] {
    return [
      ...module.functions,
      ...module.modules.flatMap((child) => this.flattenFunctions(child)),
    ]
  }

  /**
   * 聚合模块树中的 prompt，形成会话提示词快照。
   * 递归收集所有模块的 prompt 文本，用 \n\n 分隔拼接。
   *
   * 用途：在知识投影中生成 promptSnapshot 字段，
   * 作为 LLM systemPrompt 的一部分。
   */
  buildPromptSnapshot(module: AiRuntimeModuleExposure): string {
    const parts: string[] = []
    this.collectPrompts(module, parts)
    return parts.join('\n\n')
  }

  // ═══════════════════════════════════════════════════════
  // 公共 API - 校验 & 工具
  // ═══════════════════════════════════════════════════════

  /**
   * 校验注册树中的模块 ID、模块路径和"模块路径 + 函数 ID"不重复。
   *
   * 校验规则：
   * 1. moduleId 在同一注册树中必须唯一（LLM action 需要唯一解析）
   * 2. modulePath 不能重复（不同路径不能指向同一模块）
   * 3. 同一模块节点内 functionId 不能重复
   * 4. 整棵树中的 function address（modulePath/functionId）不能重复
   *
   * 失败时抛出异常，调用方应在注册前捕获并处理。
   */
  assertUniqueRegistrationKeys(module: AiModuleRegistration): void {
    this.assertId('moduleId', module.moduleId)
    const moduleIdOwners = new Map<string, string>()
    const modulePaths = new Set<string>()
    const functionAddresses = new Set<string>()
    this.collectRegistrationKeys(module, [], moduleIdOwners, modulePaths, functionAddresses)
  }

  /**
   * 将 active path 绑定转换为参数名到模块实例 ID 的映射。
   * 只提取有 paramName 的绑定，忽略未指定 paramName 的绑定。
   *
   * 用途：在函数翻译阶段快速获取 moduleInstances 映射，
   * 用于注入上下文参数到函数调用参数中。
   */
  moduleInstancesFromBindings(bindings: readonly AiModuleInstanceBinding[]): Record<string, string> {
    const out: Record<string, string> = {}
    for (const binding of bindings) {
      if (binding.paramName !== undefined && binding.paramName.trim().length > 0) {
        out[binding.paramName] = binding.instanceId
      }
    }
    return out
  }

  /**
   * 根据调用方传入的 active path 生成只读快照。
   * 深拷贝 bindings 数组，计算 moduleInstances 映射。
   *
   * 用途：在函数翻译完成后记录 active path 的不可变快照，
   * 用于函数执行时的上下文恢复。
   */
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

  // ═══════════════════════════════════════════════════════
  // Schema 注入
  // ═══════════════════════════════════════════════════════

  /**
   * 将上下文参数注入到函数参数的 JSON Schema 中。
   *
   * 流程：
   * 1. 没有上下文参数时直接克隆 schema（保证快照不可变）
   * 2. 校验 schema 根节点必须是 type=object
   * 3. 为每个 contextParam 在 properties 中新增一个 string 类型字段
   *    - description 包含原始描述和模块路径信息
   *    - 将该字段名添加到 required 数组中（设为必填）
   *
   * 用途：让 LLM 知道必须提供哪些模块实例 ID 参数，
   * 例如 pageInstanceId、nodeInstanceId 等。
   */
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

  // ═══════════════════════════════════════════════════════
  // Prompt 聚合
  // ═══════════════════════════════════════════════════════

  /**
   * 递归收集模块树中的所有 prompt 文本。
   * 如果模块 prompt 非空，则添加到输出数组。
   * 然后递归处理所有子模块。
   */
  private collectPrompts(module: AiRuntimeModuleExposure, parts: string[]): void {
    if (module.prompt !== undefined && module.prompt.trim().length > 0) {
      parts.push(module.prompt)
    }
    for (const child of module.modules) {
      this.collectPrompts(child, parts)
    }
  }

  /**
   * 解析单个模块的 prompt。
   * 同步 prompt 直接使用；异步 prompt 调用后 await。
   * 空字符串 prompt 被过滤，不进入最终 promptSnapshot。
   */
  private async modulePrompt(
    modulePath: string,
    prompt: AiModuleRegistration['prompt'],
    scope: AiRuntimeInstanceScope,
    moduleIds: readonly string[],
  ): Promise<string | undefined> {
    if (typeof prompt === 'string') return prompt.trim().length > 0 ? prompt : undefined
    if (prompt === undefined) return undefined
    const resolved = await prompt({ ...scope, modulePath, moduleIds })
    return resolved !== null && resolved.trim().length > 0 ? resolved : undefined
  }

  // ═══════════════════════════════════════════════════════
  // 唯一性校验
  // ═══════════════════════════════════════════════════════

  /**
   * 递归收集注册树中的 moduleId、modulePath 和 function address。
   * 用于 assertUniqueRegistrationKeys 的唯一性校验。
   *
   * 校验规则：
   * 1. 同一注册树内 moduleId 必须唯一（LLM action 格式需要唯一解析）
   * 2. modulePath 不能重复
   * 3. 同一模块内 functionId 不能重复
   * 4. 整棵树的 function address（modulePath/functionId）不能重复
   */
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
}

// ═══════════════════════════════════════════════════════
// AiRuntimeArgValidator - 轻量参数校验器
// ═══════════════════════════════════════════════════════

/**
 * 翻译阶段使用的轻量参数校验器。
 *
 * 职责：根据函数投影后的 paramsSchema 校验 LLM 返回的 args。
 * 内部委托 LlmParamsValidator 执行 AJV 校验，
 * 返回 null 表示通过，返回字符串表示错误信息。
 *
 * 调用时机：在 AiFunctionCallTranslator 翻译函数调用后，
 * 校验 LLM 传入的参数是否符合投影后的 paramsSchema。
 */
export class AiRuntimeArgValidator {
  /**
   * 根据函数投影后的 paramsSchema 校验 LLM args。
   * 返回 null 表示校验通过，返回字符串表示错误信息。
   *
   * 内部流程：
   * 1. 调用 LlmParamsValidator.validateLlmDeserializedParams() 执行 AJV 校验
   * 2. 如果通过返回 null
   * 3. 如果失败调用 formatLlmParamValidationIssues() 格式化错误信息
   */
  validateArgsBySchema(schema: LlmParameterSchemaRoot, args: unknown): string | null {
    const result = LlmParamsValidator.validateLlmDeserializedParams(args ?? {}, schema)
    return result.ok ? null : LlmParamsValidator.formatLlmParamValidationIssues(result.issues)
  }
}
