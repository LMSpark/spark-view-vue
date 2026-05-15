import type {
  ParameterPayloadGuide,
  ParameterPayloadQueryFilter,
  ParameterPayloadSummary,
} from '../../protocol/parameter-payload-contracts'
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

export interface AiKnowledgeProjection {
  queryPayloads(payloadRef: string, filter?: ParameterPayloadQueryFilter): readonly ParameterPayloadSummary[]
  guidePayload(payloadRef: string, key: string): ParameterPayloadGuide | null
  queryFunctions(
    scope: AiKnowledgeScope,
    filter?: { readonly modulePath?: string; readonly moduleId?: string; readonly keyword?: string },
  ): readonly AiKnowledgeFunctionSummary[]
  guideFunction(scope: AiKnowledgeScope, action: string): AiRuntimeFunctionExposure | null
  queryModules(scope: AiKnowledgeScope): readonly AiKnowledgeModuleSummary[]
  guideModule(scope: AiKnowledgeScope, modulePath: string): AiKnowledgeModuleSummary | null
}

interface RuntimeProjectionSnapshot {
  readonly scope: AiKnowledgeScope
  readonly availableFunctions: readonly AiRuntimeFunctionExposure[]
  readonly module: AiRuntimeModuleExposure
}

export class AiKnowledgeProjector implements AiKnowledgeProjection {
  private readonly projections = new Map<string, RuntimeProjectionSnapshot>()

  constructor(
    private readonly payloadRegistry: {
      readonly queryPayloads: (ref: string, filter?: ParameterPayloadQueryFilter) => readonly ParameterPayloadSummary[]
      readonly guidePayload: (ref: string, key: string) => ParameterPayloadGuide | null
    },
  ) {}

  updateProjection(projection: RuntimeProjectionSnapshot): void {
    this.projections.set(AiKnowledgeProjector.scopeKey(projection.scope), projection)
  }

  queryPayloads(payloadRef: string, filter?: ParameterPayloadQueryFilter): readonly ParameterPayloadSummary[] {
    return this.payloadRegistry.queryPayloads(payloadRef, filter)
  }

  guidePayload(payloadRef: string, key: string): ParameterPayloadGuide | null {
    return this.payloadRegistry.guidePayload(payloadRef, key)
  }

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

  guideFunction(scope: AiKnowledgeScope, action: string): AiRuntimeFunctionExposure | null {
    return this.requireProjection(scope).availableFunctions.find((fn) => fn.action === action) ?? null
  }

  queryModules(scope: AiKnowledgeScope): readonly AiKnowledgeModuleSummary[] {
    return this.flattenModules(this.requireProjection(scope).module)
  }

  guideModule(scope: AiKnowledgeScope, modulePath: string): AiKnowledgeModuleSummary | null {
    const module = this.findModuleInTree(this.requireProjection(scope).module, modulePath)
    return module === null ? null : this.summarizeModule(module)
  }

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
