/**
 * AI 知识投射缓存。
 *
 * 职责：缓存已投影的模块知识，提供查询/导航函数和模块的接口。
 * LLM 需要通过 queryFunctions 和 guideFunction 来动态探索可用能力。
 *
 * 使用流程：
 * ┌────────────────────────────────────────────────────────────┐
 * │ 1. updateProjection(snapshot) → 缓存新的投影快照            │
 * │    由 AiProjectionService.projectKnowledge() 调用           │
 * │                                                             │
 * │ 2. queryFunctions(scope, filter) → 查询可用函数摘要          │
 * │    支持按 modulePath、moduleId、keyword 过滤                 │
 * │    用于 LLM 通过 knowledge 模块动态探索可用工具               │
 * │                                                             │
 * │ 3. guideFunction(scope, action) → 获取指定 action 的完整信息 │
 * │    返回完整的 AiRuntimeFunctionExposure                      │
 * │    配合 addGuidedAiToolAction() 实现渐进式工具暴露            │
 * │                                                             │
 * │ 4. queryModules(scope) → 扁平化模块树 → 模块摘要列表         │
 * │    用于 LLM 了解有哪些模块可用                               │
 * │                                                             │
 * │ 5. guideModule(scope, modulePath) → 按路径查找模块摘要       │
 * │    用于 LLM 深入了解某个模块的功能                           │
 * └────────────────────────────────────────────────────────────┘
 *
 * 缓存策略：内存 Map，key 为 "moduleId::moduleInstanceId"。
 * 投影缺失时抛出异常，调用方需确保先调用 projectKnowledge()。
 */

import type {
  AiRuntimeFunctionExposure,
  AiRuntimeModuleExposure,
} from '../../protocol/runtime-contracts'

// ═══════════════════════════════════════════════════════
// 知识投影类型
// ═══════════════════════════════════════════════════════

/** 知识投影的作用域标识 */
export interface AiKnowledgeScope {
  /** 模块注册 ID */
  readonly moduleId: string
  /** 模块实例 ID */
  readonly moduleInstanceId: string
}

/** 函数摘要，用于 LLM 快速了解可用函数 */
export interface AiKnowledgeFunctionSummary {
  /** 完整 action 字符串 */
  readonly action: AiRuntimeFunctionExposure['action']
  /** 模块 ID */
  readonly moduleId: AiRuntimeFunctionExposure['moduleId']
  /** 模块路径 */
  readonly modulePath: AiRuntimeFunctionExposure['modulePath']
  /** 模块 ID 数组（层级路径） */
  readonly moduleIds: AiRuntimeFunctionExposure['moduleIds']
  /** 函数描述 */
  readonly description: string
  /** 参数名列表（可选） */
  readonly paramNames?: readonly string[] | undefined
  /** 必填参数名列表（可选） */
  readonly requiredParamNames?: readonly string[] | undefined
  /** 失败模式代码列表（可选） */
  readonly failureCodes?: readonly string[] | undefined
}

/** 模块摘要，用于 LLM 了解模块功能 */
export interface AiKnowledgeModuleSummary {
  /** 模块 ID */
  readonly moduleId: AiRuntimeModuleExposure['moduleId']
  /** 模块路径 */
  readonly modulePath: AiRuntimeModuleExposure['modulePath']
  /** 模块 ID 数组（层级路径） */
  readonly moduleIds: AiRuntimeModuleExposure['moduleIds']
  /** 模块名称 */
  readonly name: string
  /** 模块描述 */
  readonly description: string
  /** 函数数量 */
  readonly functionCount: number
  /** 子模块数量 */
  readonly childModuleCount: number
}

/** 运行时投影快照，用于内部缓存 */
interface RuntimeProjectionSnapshot {
  readonly scope: AiKnowledgeScope
  readonly availableFunctions: readonly AiRuntimeFunctionExposure[]
  readonly module: AiRuntimeModuleExposure
}

// ═══════════════════════════════════════════════════════
// AiKnowledgeProjector
// ═══════════════════════════════════════════════════════

/**
 * AI 知识投射缓存管理器。
 *
 * 提供函数和模块的查询/导航能力，供 LLM 在渐进式工具暴露策略中使用。
 * 内部通过 Map 缓存投影快照，key 格式为 "moduleId::moduleInstanceId"。
 */
export class AiKnowledgeProjector {
  /** 内部缓存：scopeKey → 投影快照 */
  private readonly projections = new Map<string, RuntimeProjectionSnapshot>()

  /**
   * 更新指定 scope 的投影缓存。
   * 由 AiProjectionService.projectKnowledge() 在每次知识投射后调用。
   */
  updateProjection(projection: RuntimeProjectionSnapshot): void {
    this.projections.set(AiKnowledgeProjector.scopeKey(projection.scope), projection)
  }

  /**
   * 查询可用函数摘要。
   *
   * 支持三种过滤方式（可组合使用）：
   * - modulePath: 模糊匹配模块路径
   * - moduleId: 精确匹配模块 ID
   * - keyword: 在 action、description、modulePath 中搜索关键词（不区分大小写）
   *
   * 用途：LLM 通过 knowledge 模块查询可用工具列表，
   * 根据返回结果决定下一步要调用哪个工具。
   */
  queryFunctions(
    scope: AiKnowledgeScope,
    filter?: { readonly modulePath?: string; readonly moduleId?: string; readonly keyword?: string },
  ): readonly AiKnowledgeFunctionSummary[] {
    const projection = this.requireProjection(scope)
    let functions = projection.availableFunctions
    const modulePath = filter?.modulePath?.trim()
    if (modulePath !== undefined && modulePath.length > 0) {
      functions = functions.filter((fn) => fn.modulePath.includes(modulePath))
    }
    const moduleId = filter?.moduleId?.trim()
    if (moduleId !== undefined && moduleId.length > 0) {
      functions = functions.filter((fn) => fn.moduleId === moduleId)
    }
    const keywordRaw = filter?.keyword?.trim()
    if (keywordRaw !== undefined && keywordRaw.length > 0) {
      const keyword = keywordRaw.toLowerCase()
      functions = functions.filter((fn) =>
        fn.action.toLowerCase().includes(keyword)
        || fn.description.toLowerCase().includes(keyword)
        || fn.modulePath.toLowerCase().includes(keyword),
      )
    }
    return functions.map((fn) => this.summarizeFunction(fn))
  }

  /**
   * 获取指定 action 的完整函数曝光信息。
   * 未找到返回 null。
   *
   * 用途：配合渐进式工具暴露，LLM 调用 guideFunction 查询
   * 某个工具的详细信息（参数 schema、使用规则、失败模式等），
   * 然后根据返回结果解锁并使用该工具。
   */
  guideFunction(scope: AiKnowledgeScope, action: string): AiRuntimeFunctionExposure | null {
    return this.requireProjection(scope).availableFunctions.find((fn) => fn.action === action) ?? null
  }

  /**
   * 扁平化模块树 → 模块摘要列表。
   * 递归遍历模块树，将所有模块（包括子模块）展平为列表。
   *
   * 用途：LLM 了解当前会话有哪些模块可用。
   */
  queryModules(scope: AiKnowledgeScope): readonly AiKnowledgeModuleSummary[] {
    return this.flattenModules(this.requireProjection(scope).module)
  }

  /**
   * 按 modulePath 在模块树中查找模块摘要。
   * 未找到返回 null。
   *
   * 用途：LLM 深入了解某个特定模块的功能和结构。
   */
  guideModule(scope: AiKnowledgeScope, modulePath: string): AiKnowledgeModuleSummary | null {
    const module = this.findModuleInTree(this.requireProjection(scope).module, modulePath)
    return module === null ? null : this.summarizeModule(module)
  }

  // ═══════════════════════════════════════════════════════
  // 内部辅助方法
  // ═══════════════════════════════════════════════════════

  /** 获取指定 scope 的投影缓存，不存在则抛出 */
  private requireProjection(scope: AiKnowledgeScope): RuntimeProjectionSnapshot {
    const projection = this.projections.get(AiKnowledgeProjector.scopeKey(scope))
    if (projection !== undefined) return projection
    throw new Error(
      `Knowledge projection missing for ${scope.moduleId}/${scope.moduleInstanceId}. ` +
      'Call moduleApi.projectKnowledge() or startSession() for this scope first.',
    )
  }

  /** 递归扁平化模块树 */
  private flattenModules(root: AiRuntimeModuleExposure): AiKnowledgeModuleSummary[] {
    const output: AiKnowledgeModuleSummary[] = []
    const visit = (node: AiRuntimeModuleExposure): void => {
      output.push(this.summarizeModule(node))
      for (const child of node.modules) visit(child)
    }
    visit(root)
    return output
  }

  /** 将函数曝光信息转换为摘要格式 */
  private summarizeFunction(fn: AiRuntimeFunctionExposure): AiKnowledgeFunctionSummary {
    const properties = fn.paramsSchema.properties
    const paramNames = properties === undefined ? [] : Object.keys(properties)
    const requiredParamNames = Array.isArray(fn.paramsSchema.required)
      ? fn.paramsSchema.required.filter((item): item is string => typeof item === 'string')
      : []
    const failureCodes = fn.failureModes?.map((mode) => mode.code) ?? []
    return {
      action: fn.action,
      moduleId: fn.moduleId,
      modulePath: fn.modulePath,
      moduleIds: fn.moduleIds,
      description: fn.description,
      ...(paramNames.length > 0 ? { paramNames } : {}),
      ...(requiredParamNames.length > 0 ? { requiredParamNames } : {}),
      ...(failureCodes.length > 0 ? { failureCodes } : {}),
    }
  }

  /** 将模块曝光信息转换为摘要格式 */
  private summarizeModule(module: AiRuntimeModuleExposure): AiKnowledgeModuleSummary {
    return {
      moduleId: module.moduleId,
      modulePath: module.modulePath,
      moduleIds: module.moduleIds,
      name: module.name,
      description: module.description,
      functionCount: module.functions.length,
      childModuleCount: module.modules.length,
    }
  }

  /** 在模块树中按 modulePath 递归查找 */
  private findModuleInTree(module: AiRuntimeModuleExposure, modulePath: string): AiRuntimeModuleExposure | null {
    if (module.modulePath === modulePath) return module
    for (const child of module.modules) {
      const found = this.findModuleInTree(child, modulePath)
      if (found !== null) return found
    }
    return null
  }

  /** 生成 scope 的唯一 key：moduleId::moduleInstanceId */
  private static scopeKey(scope: AiKnowledgeScope): string {
    return `${scope.moduleId}::${scope.moduleInstanceId}`
  }
}
