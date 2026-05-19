import type {
  IBusinessRegistration,
  IBusinessRegistrationData,
  IBusinessRegistrationStoreSnapshot,
  AiFunctionRegistration,
  AiFunctionRegistrationFailureMode,
  AiFunctionRegistrationStoreFunction,
  AiFunctionRegistrationUsageRule,
  AiModuleInstanceBinding,
  AiModuleRegistration,
  AiModuleRegistrationData,
  AiModuleRegistrationStoreModule,
  AiModuleRegistrationStoreSnapshot,
  AiRuntimeAction,
  AiRuntimeActivePathSnapshot,
  AiRuntimeFunctionContextParam,
  AiRuntimeFunctionExposure,
  AiRuntimeInstanceScope,
  AiRuntimeModuleExposure,
} from '../../protocol/runtime-contracts'
import type { LlmJsonObject, LlmParameterSchemaRoot } from '../../protocol/parameter-schema'
import { LlmParamsValidator } from '../llm-params-validator'
import { aiBusinessRegistrationAdapter } from './ai-business-registration-adapter'
import { cloneRuntimeValue, isRecord } from './runtime-utils'

/**
 * AiRuntime 的无状态支持模块。
 *
 * 这里集中处理快照 clone、模块树投影、上下文参数注入和轻量参数校验。
 * 不保存实例，不发布事件，也不执行注册方函数。
 */

/** 判断值是否为可直接 JSON 持久化的普通对象。 */
function isPlainJsonRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** 校验注册快照中的任意值能无损写入 JSON 数据库字段。 */
function assertRegistrationJsonValue(value: unknown, path: string): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Registration data ${path} must be a finite JSON number`)
    }
    return
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) {
        throw new Error(`Registration data ${path}[${index}] must not be a sparse array slot`)
      }
      assertRegistrationJsonValue(value[index], `${path}[${index}]`)
    }
    return
  }
  if (isPlainJsonRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      assertRegistrationJsonValue(child, `${path}.${key}`)
    }
    return
  }
  throw new Error(`Registration data ${path} must be JSON-persistable`)
}

/** 克隆 JSON 对象，确保返回值没有运行时引用。 */
function cloneRegistrationJsonObject(value: unknown, path: string): LlmJsonObject {
  if (!isPlainJsonRecord(value)) {
    throw new Error(`Registration data ${path} must be a JSON object`)
  }
  assertRegistrationJsonValue(value, path)
  return JSON.parse(JSON.stringify(value)) as LlmJsonObject
}

interface ProjectModuleOptions {
  /** 当前要投影的模块注册。 */
  module: AiModuleRegistration
  /** 调用方传入的会话 scope。 */
  scope: AiRuntimeInstanceScope
  /** 父级模块路径 ID，用于递归拼接 modulePath。 */
  parentIds: readonly string[]
  /** 父级模块实例参数，用于注入子函数 schema。 */
  parentContextParams: readonly AiRuntimeFunctionContextParam[]
}

interface RegistrationStoreBuildState {
  readonly modules: AiModuleRegistrationStoreModule[]
  readonly functions: AiFunctionRegistrationStoreFunction[]
  readonly usageRules: AiFunctionRegistrationUsageRule[]
  readonly failureModes: AiFunctionRegistrationFailureMode[]
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
    ) => AiRuntimeAction,
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

  /** 从运行时模块注册生成纯数据快照；结果可 JSON 序列化后交给上层持久化。 */
  createRegistrationData(module: AiModuleRegistration | AiModuleRegistrationData | AiModuleRegistrationStoreSnapshot): AiModuleRegistrationData {
    const registration = this.createRuntimeRegistration(module)
    return this.createRegistrationDataNode(registration, registration.moduleId)
  }

  /** 把运行时注册或数据库纯数据注册统一成 core 可消费的运行时注册。 */
  createRuntimeRegistration(source: AiModuleRegistration | AiModuleRegistrationData | AiModuleRegistrationStoreSnapshot): AiModuleRegistration {
    if (this.isRuntimeRegistration(source)) return source
    const data = this.isStoreSnapshot(source)
      ? this.createRegistrationDataFromStoreSnapshot(source)
      : this.cloneRegistrationData(source, source.moduleId)
    return this.runtimeRegistrationFromData(data, data.moduleId)
  }

  /** 从注册源生成完全结构化的持久化快照；调用方可将数组行映射到数据库表。 */
  createRegistrationStoreSnapshot(
    source: AiModuleRegistration | AiModuleRegistrationData | AiModuleRegistrationStoreSnapshot,
  ): AiModuleRegistrationStoreSnapshot {
    if (this.isStoreSnapshot(source)) {
      const data = this.createRegistrationDataFromStoreSnapshot(source)
      return this.createRegistrationStoreSnapshot(data)
    }
    const data = this.createRegistrationData(source)
    const state: RegistrationStoreBuildState = {
      modules: [],
      functions: [],
      usageRules: [],
      failureModes: [],
    }
    this.collectRegistrationStoreRows(data, undefined, data.moduleId, 0, state)
    const snapshot: AiModuleRegistrationStoreSnapshot = {
      rootModulePath: data.moduleId,
      modules: state.modules,
      functions: state.functions,
      usageRules: state.usageRules,
      failureModes: state.failureModes,
    }
    assertRegistrationJsonValue(snapshot, `registrationStore.${data.moduleId}`)
    return snapshot
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

  /** 递归生成可持久化注册数据。 */
  private createRegistrationDataNode(module: AiModuleRegistration, modulePath: string): AiModuleRegistrationData {
    const prompt = this.staticRegistrationPrompt(module.prompt, modulePath)
    const data: AiModuleRegistrationData = {
      moduleId: module.moduleId,
      name: module.name,
      description: module.description,
      ...(prompt !== undefined ? { prompt } : {}),
      ...(module.instanceParam !== undefined ? { instanceParam: { ...module.instanceParam } } : {}),
      functions: module.getFunctions().map((definition): AiFunctionRegistration => ({
        functionId: definition.functionId,
        description: definition.description,
        paramsSchema: cloneRegistrationJsonObject(definition.paramsSchema, `${modulePath}.${definition.functionId}.paramsSchema`),
        ...(definition.resultSchema !== undefined ? {
          resultSchema: cloneRegistrationJsonObject(definition.resultSchema, `${modulePath}.${definition.functionId}.resultSchema`),
        } : {}),
        ...(definition.maxExecutionMs !== undefined ? { maxExecutionMs: definition.maxExecutionMs } : {}),
        ...(definition.usageRules !== undefined ? { usageRules: [...definition.usageRules] } : {}),
        ...(definition.failureModes !== undefined ? { failureModes: definition.failureModes.map((mode) => ({ ...mode })) } : {}),
        ...(definition.scope !== undefined ? { scope: definition.scope } : {}),
      })),
      modules: (module.modules ?? []).map((child) => this.createRegistrationDataNode(child, `${modulePath}/${child.moduleId}`)),
    }
    assertRegistrationJsonValue(data, `registration.${modulePath}`)
    return data
  }

  /** 克隆并校验已是纯数据形态的注册树。 */
  private cloneRegistrationData(data: AiModuleRegistrationData, modulePath: string): AiModuleRegistrationData {
    const cloned: AiModuleRegistrationData = {
      moduleId: data.moduleId,
      name: data.name,
      description: data.description,
      ...(data.prompt !== undefined ? { prompt: data.prompt } : {}),
      ...(data.instanceParam !== undefined ? { instanceParam: { ...data.instanceParam } } : {}),
      functions: data.functions.map((definition) => this.cloneFunctionData(definition, modulePath)),
      modules: data.modules.map((child) => this.cloneRegistrationData(child, `${modulePath}/${child.moduleId}`)),
    }
    assertRegistrationJsonValue(cloned, `registration.${modulePath}`)
    return cloned
  }

  /** 克隆并校验纯数据形态的函数注册。 */
  private cloneFunctionData(definition: AiFunctionRegistration, modulePath: string): AiFunctionRegistration {
    return {
      functionId: definition.functionId,
      description: definition.description,
      paramsSchema: cloneRegistrationJsonObject(definition.paramsSchema, `${modulePath}.${definition.functionId}.paramsSchema`),
      ...(definition.resultSchema !== undefined ? {
        resultSchema: cloneRegistrationJsonObject(definition.resultSchema, `${modulePath}.${definition.functionId}.resultSchema`),
      } : {}),
      ...(definition.maxExecutionMs !== undefined ? { maxExecutionMs: definition.maxExecutionMs } : {}),
      ...(definition.usageRules !== undefined ? { usageRules: [...definition.usageRules] } : {}),
      ...(definition.failureModes !== undefined ? { failureModes: definition.failureModes.map((mode) => ({ ...mode })) } : {}),
      ...(definition.scope !== undefined ? { scope: definition.scope } : {}),
    }
  }

  /** 将数据库纯数据注册适配成运行时注册；适配器只补 `getFunctions`，不引入执行器。 */
  private runtimeRegistrationFromData(data: AiModuleRegistrationData, modulePath: string): AiModuleRegistration {
    const modules = data.modules.map((child) => this.runtimeRegistrationFromData(child, `${modulePath}/${child.moduleId}`))
    const functions = data.functions.map((definition) => this.functionRegistrationFromData(definition, modulePath))
    return {
      moduleId: data.moduleId,
      name: data.name,
      description: data.description,
      ...(data.prompt !== undefined ? { prompt: data.prompt } : {}),
      ...(data.instanceParam !== undefined ? { instanceParam: { ...data.instanceParam } } : {}),
      modules,
      getFunctions: () => functions.map((definition) => this.cloneFunctionRegistration(definition, modulePath)),
    }
  }

  /** 将纯数据函数注册适配成运行时函数注册。 */
  private functionRegistrationFromData(definition: AiFunctionRegistration, modulePath: string): AiFunctionRegistration {
    return this.cloneFunctionRegistration(definition, modulePath)
  }

  /** 克隆运行时函数注册中的可持久化字段。 */
  private cloneFunctionRegistration(definition: AiFunctionRegistration, modulePath: string): AiFunctionRegistration {
    return {
      functionId: definition.functionId,
      description: definition.description,
      paramsSchema: cloneRegistrationJsonObject(definition.paramsSchema, `${modulePath}.${definition.functionId}.paramsSchema`),
      ...(definition.resultSchema !== undefined ? {
        resultSchema: cloneRegistrationJsonObject(definition.resultSchema, `${modulePath}.${definition.functionId}.resultSchema`),
      } : {}),
      ...(definition.maxExecutionMs !== undefined ? { maxExecutionMs: definition.maxExecutionMs } : {}),
      ...(definition.usageRules !== undefined ? { usageRules: [...definition.usageRules] } : {}),
      ...(definition.failureModes !== undefined ? { failureModes: definition.failureModes.map((mode) => ({ ...mode })) } : {}),
      ...(definition.scope !== undefined ? { scope: definition.scope } : {}),
    }
  }

  private collectRegistrationStoreRows(
    data: AiModuleRegistrationData,
    parentModulePath: string | undefined,
    modulePath: string,
    sortOrder: number,
    state: RegistrationStoreBuildState,
  ): void {
    this.assertId('moduleId', data.moduleId)
    state.modules.push({
      modulePath,
      ...(parentModulePath !== undefined ? { parentModulePath } : {}),
      moduleId: data.moduleId,
      sortOrder,
      name: data.name,
      description: data.description,
      ...(data.prompt !== undefined ? { prompt: data.prompt } : {}),
      ...(data.instanceParam !== undefined ? {
        instanceParamName: data.instanceParam.name,
        instanceParamDescription: data.instanceParam.description,
      } : {}),
    })

    data.functions.forEach((definition, functionIndex) => {
      this.assertId('functionId', definition.functionId)
      state.functions.push({
        modulePath,
        functionId: definition.functionId,
        sortOrder: functionIndex,
        description: definition.description,
        paramsSchema: cloneRegistrationJsonObject(definition.paramsSchema, `${modulePath}.${definition.functionId}.paramsSchema`),
        ...(definition.resultSchema !== undefined ? {
          resultSchema: cloneRegistrationJsonObject(definition.resultSchema, `${modulePath}.${definition.functionId}.resultSchema`),
        } : {}),
        ...(definition.maxExecutionMs !== undefined ? { maxExecutionMs: definition.maxExecutionMs } : {}),
        ...(definition.scope !== undefined ? { scope: definition.scope } : {}),
      })
      definition.usageRules?.forEach((rule, ruleIndex) => {
        state.usageRules.push({
          modulePath,
          functionId: definition.functionId,
          sortOrder: ruleIndex,
          rule,
        })
      })
      definition.failureModes?.forEach((mode, modeIndex) => {
        state.failureModes.push({
          modulePath,
          functionId: definition.functionId,
          sortOrder: modeIndex,
          code: mode.code,
          when: mode.when,
          fix: mode.fix,
        })
      })
    })

    data.modules.forEach((child, childIndex) => {
      this.collectRegistrationStoreRows(child, modulePath, `${modulePath}/${child.moduleId}`, childIndex, state)
    })
  }

  private createRegistrationDataFromStoreSnapshot(snapshot: AiModuleRegistrationStoreSnapshot): AiModuleRegistrationData {
    assertRegistrationJsonValue(snapshot, `registrationStore.${snapshot.rootModulePath}`)
    const moduleRows = new Map<string, AiModuleRegistrationStoreModule>()
    const childRowsByParent = new Map<string, AiModuleRegistrationStoreModule[]>()
    const functionRowsByModule = new Map<string, AiFunctionRegistrationStoreFunction[]>()
    const usageRulesByFunction = new Map<string, AiFunctionRegistrationUsageRule[]>()
    const failureModesByFunction = new Map<string, AiFunctionRegistrationFailureMode[]>()

    for (const row of snapshot.modules) {
      if (moduleRows.has(row.modulePath)) {
        throw new Error(`Duplicate registration store module path: ${row.modulePath}`)
      }
      moduleRows.set(row.modulePath, row)
    }

    const root = moduleRows.get(snapshot.rootModulePath)
    if (root === undefined) {
      throw new Error(`Registration store root module not found: ${snapshot.rootModulePath}`)
    }
    if (root.parentModulePath !== undefined || root.modulePath !== root.moduleId) {
      throw new Error(`Registration store root module path must equal root moduleId: ${snapshot.rootModulePath}`)
    }

    for (const row of snapshot.modules) {
      if (row.modulePath === snapshot.rootModulePath) continue
      if (row.parentModulePath === undefined) {
        throw new Error(`Registration store module ${row.modulePath} must declare parentModulePath`)
      }
      if (!moduleRows.has(row.parentModulePath)) {
        throw new Error(`Registration store module ${row.modulePath} references unknown parent ${row.parentModulePath}`)
      }
      const expectedPath = `${row.parentModulePath}/${row.moduleId}`
      if (row.modulePath !== expectedPath) {
        throw new Error(`Registration store module path ${row.modulePath} must equal ${expectedPath}`)
      }
      const siblings = childRowsByParent.get(row.parentModulePath) ?? []
      siblings.push(row)
      childRowsByParent.set(row.parentModulePath, siblings)
    }

    const knownFunctions = new Set<string>()
    for (const row of snapshot.functions) {
      if (!moduleRows.has(row.modulePath)) {
        throw new Error(`Registration store function ${row.modulePath}.${row.functionId} references unknown module`)
      }
      const key = this.storeFunctionKey(row.modulePath, row.functionId)
      if (knownFunctions.has(key)) {
        throw new Error(`Duplicate registration store function: ${row.modulePath}.${row.functionId}`)
      }
      knownFunctions.add(key)
      const functions = functionRowsByModule.get(row.modulePath) ?? []
      functions.push(row)
      functionRowsByModule.set(row.modulePath, functions)
    }

    for (const row of snapshot.usageRules) {
      const key = this.storeFunctionKey(row.modulePath, row.functionId)
      if (!knownFunctions.has(key)) {
        throw new Error(`Registration store row references unknown function: ${row.modulePath}.${row.functionId}`)
      }
      const rules = usageRulesByFunction.get(key) ?? []
      rules.push(row)
      usageRulesByFunction.set(key, rules)
    }

    for (const row of snapshot.failureModes) {
      const key = this.storeFunctionKey(row.modulePath, row.functionId)
      if (!knownFunctions.has(key)) {
        throw new Error(`Registration store row references unknown function: ${row.modulePath}.${row.functionId}`)
      }
      const modes = failureModesByFunction.get(key) ?? []
      modes.push(row)
      failureModesByFunction.set(key, modes)
    }

    const buildModule = (row: AiModuleRegistrationStoreModule): AiModuleRegistrationData => {
      const modulePath = row.modulePath
      const functions = [...(functionRowsByModule.get(modulePath) ?? [])]
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((definition): AiFunctionRegistration => {
          const key = this.storeFunctionKey(modulePath, definition.functionId)
          const usageRules = [...(usageRulesByFunction.get(key) ?? [])]
            .sort((left, right) => left.sortOrder - right.sortOrder)
            .map((rule) => rule.rule)
          const failureModes = [...(failureModesByFunction.get(key) ?? [])]
            .sort((left, right) => left.sortOrder - right.sortOrder)
            .map((mode) => ({
              code: mode.code,
              when: mode.when,
              fix: mode.fix,
            }))
          return {
            functionId: definition.functionId,
            description: definition.description,
            paramsSchema: cloneRegistrationJsonObject(definition.paramsSchema, `${modulePath}.${definition.functionId}.paramsSchema`),
            ...(definition.resultSchema !== undefined ? {
              resultSchema: cloneRegistrationJsonObject(definition.resultSchema, `${modulePath}.${definition.functionId}.resultSchema`),
            } : {}),
            ...(definition.maxExecutionMs !== undefined ? { maxExecutionMs: definition.maxExecutionMs } : {}),
            ...(usageRules.length > 0 ? { usageRules } : {}),
            ...(failureModes.length > 0 ? { failureModes } : {}),
            ...(definition.scope !== undefined ? { scope: definition.scope } : {}),
          }
        })

      const modules = [...(childRowsByParent.get(modulePath) ?? [])]
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((child) => buildModule(child))

      if ((row.instanceParamName === undefined) !== (row.instanceParamDescription === undefined)) {
        throw new Error(`Registration store module ${row.modulePath} must store both instanceParamName and instanceParamDescription`)
      }
      return {
        moduleId: row.moduleId,
        name: row.name,
        description: row.description,
        ...(row.prompt !== undefined ? { prompt: row.prompt } : {}),
        ...(row.instanceParamName !== undefined ? {
          instanceParam: {
            name: row.instanceParamName,
            description: row.instanceParamDescription as string,
          },
        } : {}),
        functions,
        modules,
      }
    }

    return this.cloneRegistrationData(buildModule(root), snapshot.rootModulePath)
  }

  private storeFunctionKey(modulePath: string, functionId: string): string {
    return `${modulePath}\u0000${functionId}`
  }

  private isStoreSnapshot(source: unknown): source is AiModuleRegistrationStoreSnapshot {
    return isRecord(source)
      && typeof source['rootModulePath'] === 'string'
      && Array.isArray(source['modules'])
      && Array.isArray(source['functions'])
      && Array.isArray(source['usageRules'])
      && Array.isArray(source['failureModes'])
  }

  private isRuntimeRegistration(
    source: AiModuleRegistration | AiModuleRegistrationData | AiModuleRegistrationStoreSnapshot,
  ): source is AiModuleRegistration {
    return isRecord(source) && typeof source['getFunctions'] === 'function'
  }

  /** 动态 prompt provider 是运行时能力，不是可落库的注册内容。 */
  private staticRegistrationPrompt(prompt: AiModuleRegistration['prompt'], modulePath: string): string | undefined {
    if (typeof prompt === 'string') return prompt
    if (prompt === undefined) return undefined
    throw new Error(`Dynamic module prompt provider cannot be persisted as registration data: ${modulePath}.prompt`)
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
    const properties = cloned.properties === undefined ? {} : { ...cloned.properties }
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
    return {
      ...cloned,
      type: 'object',
      properties,
      required,
    } as LlmParameterSchemaRoot
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

// ── Business↔Module 投影转换：在不同命名约定之间转换字段名 ──

/** 识别 Business 源是否为运行时实例（有 getFunctions 方法）。 */
export function isBusinessRegistrationInstance(source: unknown): source is IBusinessRegistration {
  return aiBusinessRegistrationAdapter.isBusinessRegistrationInstance(source)
}

/** 判断是否为 BusinessData 格式。 */
export function isBusinessRegistrationDataFormat(source: unknown): source is IBusinessRegistrationData {
  return aiBusinessRegistrationAdapter.isBusinessRegistrationDataFormat(source)
}

/** 判断是否为 BusinessStoreSnapshot 格式。 */
export function isBusinessStoreSnapshotFormat(source: unknown): source is IBusinessRegistrationStoreSnapshot {
  return aiBusinessRegistrationAdapter.isBusinessStoreSnapshotFormat(source)
}

/** Business 源转为 Module 源（识别类型后路由到具体转换）。 */
export function moduleSourceFromBusiness(
  source: IBusinessRegistration | IBusinessRegistrationData | IBusinessRegistrationStoreSnapshot,
): AiModuleRegistration | AiModuleRegistrationData | AiModuleRegistrationStoreSnapshot {
  return aiBusinessRegistrationAdapter.moduleSourceFromBusiness(source)
}

/** Business 实例 → Module 实例（重命名字段 businessId→moduleId）。 */
export function businessToModuleRegistration(business: IBusinessRegistration): AiModuleRegistration {
  return aiBusinessRegistrationAdapter.businessToModuleRegistration(business)
}

/** Module 实例 → Business 实例（反向转换）。 */
export function moduleToBusinessRegistration(module: AiModuleRegistration): IBusinessRegistration {
  return aiBusinessRegistrationAdapter.moduleToBusinessRegistration(module)
}

/** BusinessData → ModuleData（字段重命名）。 */
export function businessDataToModuleData(data: IBusinessRegistrationData): AiModuleRegistrationData {
  return aiBusinessRegistrationAdapter.businessDataToModuleData(data)
}

/** ModuleData → BusinessData（字段重命名）。 */
export function moduleDataToBusinessData(data: AiModuleRegistrationData): IBusinessRegistrationData {
  return aiBusinessRegistrationAdapter.moduleDataToBusinessData(data)
}

/** Module 快照 → Business 快照（新增 rootBusinessPath 字段）。 */
export function moduleStoreToBusinessStoreSnapshot(snapshot: AiModuleRegistrationStoreSnapshot): IBusinessRegistrationStoreSnapshot {
  return aiBusinessRegistrationAdapter.moduleStoreToBusinessStoreSnapshot(snapshot)
}
