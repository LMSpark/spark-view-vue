/**
 * AI 知识投射缓存。
 *
 * 职责：缓存已投影的模块知识，提供查询/导航函数和模块的接口。
 * LLM 需要通过 queryFunctions 和 guideFunction 来动态探索可用能力。
 *
 * ┌────────────────────────────────────────────────────────┐
 * │                 AiKnowledgeProjector                    │
 * │                                                         │
 * │  updateProjection()  → 缓存新的投影快照                  │
 * │                                                         │
 * │  queryFunctions()   → 按 modulePath/moduleId/keyword 过滤 │
 * │  guideFunction()    → 获取指定 action 的完整曝光信息      │
 * │  queryModules()     → 扁平化模块树 → 模块摘要列表         │
 * │  guideModule()      → 按 modulePath 查找模块摘要          │
 * └────────────────────────────────────────────────────────┘
 */

import type {
  AiRuntimeFunctionExposure,
  AiRuntimeModuleExposure,
} from '../../protocol/runtime-contracts'

export interface AiKnowledgeScope {
  readonly moduleId: string
  readonly moduleInstanceId: string
}

export interface AiKnowledgeFunctionSummary {
  readonly action: AiRuntimeFunctionExposure['action']
  readonly moduleId: AiRuntimeFunctionExposure['moduleId']
  readonly modulePath: AiRuntimeFunctionExposure['modulePath']
  readonly moduleIds: AiRuntimeFunctionExposure['moduleIds']
  readonly description: string
  readonly paramNames?: readonly string[] | undefined
  readonly requiredParamNames?: readonly string[] | undefined
  readonly failureCodes?: readonly string[] | undefined
}

export interface AiKnowledgeModuleSummary {
  readonly moduleId: AiRuntimeModuleExposure['moduleId']
  readonly modulePath: AiRuntimeModuleExposure['modulePath']
  readonly moduleIds: AiRuntimeModuleExposure['moduleIds']
  readonly name: string
  readonly description: string
  readonly functionCount: number
  readonly childModuleCount: number
}

interface RuntimeProjectionSnapshot {
  readonly scope: AiKnowledgeScope
  readonly availableFunctions: readonly AiRuntimeFunctionExposure[]
  readonly module: AiRuntimeModuleExposure
}

export class AiKnowledgeProjector {
  private readonly projections = new Map<string, RuntimeProjectionSnapshot>()

  /** 更新指定 scope 的投影缓存 */
  updateProjection(projection: RuntimeProjectionSnapshot): void {
    this.projections.set(AiKnowledgeProjector.scopeKey(projection.scope), projection)
  }

  /**
   * 查询可用函数摘要。
   * 支持按 modulePath、moduleId、keyword 过滤。
   * 用于 LLM 通过 knowledge 模块动态探索可用工具。
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

  /** 获取指定 action 的完整函数曝光信息 */
  guideFunction(scope: AiKnowledgeScope, action: string): AiRuntimeFunctionExposure | null {
    return this.requireProjection(scope).availableFunctions.find((fn) => fn.action === action) ?? null
  }

  /** 扁平化模块树 → 模块摘要列表（用于 LLM 模块导航） */
  queryModules(scope: AiKnowledgeScope): readonly AiKnowledgeModuleSummary[] {
    return this.flattenModules(this.requireProjection(scope).module)
  }

  /** 按 modulePath 在模块树中查找模块摘要 */
  guideModule(scope: AiKnowledgeScope, modulePath: string): AiKnowledgeModuleSummary | null {
    const module = this.findModuleInTree(this.requireProjection(scope).module, modulePath)
    return module === null ? null : this.summarizeModule(module)
  }

  /** 获取指定 scope 的投影缓存，不存在则抛出 */
  private requireProjection(scope: AiKnowledgeScope): RuntimeProjectionSnapshot {
    const projection = this.projections.get(AiKnowledgeProjector.scopeKey(scope))
    if (projection !== undefined) return projection
    throw new Error(
      `Knowledge projection missing for ${scope.moduleId}/${scope.moduleInstanceId}. ` +
      'Call moduleApi.projectKnowledge() or startSession() for this scope first.',
    )
  }

  private flattenModules(root: AiRuntimeModuleExposure): AiKnowledgeModuleSummary[] {
    const output: AiKnowledgeModuleSummary[] = []
    const visit = (node: AiRuntimeModuleExposure): void => {
      output.push(this.summarizeModule(node))
      for (const child of node.modules) visit(child)
    }
    visit(root)
    return output
  }

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

  private findModuleInTree(module: AiRuntimeModuleExposure, modulePath: string): AiRuntimeModuleExposure | null {
    if (module.modulePath === modulePath) return module
    for (const child of module.modules) {
      const found = this.findModuleInTree(child, modulePath)
      if (found !== null) return found
    }
    return null
  }

  private static scopeKey(scope: AiKnowledgeScope): string {
    return `${scope.moduleId}::${scope.moduleInstanceId}`
  }
}
