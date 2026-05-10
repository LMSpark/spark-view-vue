import type {
  KnowledgePayloadGuide,
  KnowledgePayloadQueryFilter,
  KnowledgePayloadSummary,
} from '../protocol/knowledge-payload-contracts'
import type {
  AiRuntimeFunctionExposure,
  AiRuntimeModuleExposure,
} from '../protocol/business-contracts'

export interface AiKnowledgeScope {
  readonly moduleId: string
  readonly moduleInstanceId: string
}

export interface AiKnowledgeProjection {
  queryPayloads(payloadRef: string, filter?: KnowledgePayloadQueryFilter): readonly KnowledgePayloadSummary[]
  guidePayload(payloadRef: string, key: string): KnowledgePayloadGuide | null
  queryFunctions(
    scope: AiKnowledgeScope,
    filter?: { readonly modulePath?: string; readonly moduleId?: string; readonly keyword?: string },
  ): readonly AiRuntimeFunctionExposure[]
  guideFunction(scope: AiKnowledgeScope, action: string): AiRuntimeFunctionExposure | null
  queryModules(scope: AiKnowledgeScope): readonly AiRuntimeModuleExposure[]
  guideModule(scope: AiKnowledgeScope, modulePath: string): AiRuntimeModuleExposure | null
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
      readonly queryPayloads: (ref: string, filter?: KnowledgePayloadQueryFilter) => readonly KnowledgePayloadSummary[]
      readonly guidePayload: (ref: string, key: string) => KnowledgePayloadGuide | null
    },
  ) {}

  updateProjection(projection: RuntimeProjectionSnapshot): void {
    this.projections.set(AiKnowledgeProjector.scopeKey(projection.scope), projection)
  }

  queryPayloads(payloadRef: string, filter?: KnowledgePayloadQueryFilter): readonly KnowledgePayloadSummary[] {
    return this.payloadRegistry.queryPayloads(payloadRef, filter)
  }

  guidePayload(payloadRef: string, key: string): KnowledgePayloadGuide | null {
    return this.payloadRegistry.guidePayload(payloadRef, key)
  }

  queryFunctions(
    scope: AiKnowledgeScope,
    filter?: { readonly modulePath?: string; readonly moduleId?: string; readonly keyword?: string },
  ): readonly AiRuntimeFunctionExposure[] {
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
        fn.functionId.toLowerCase().includes(keyword)
        || fn.description.toLowerCase().includes(keyword)
        || fn.modulePath.toLowerCase().includes(keyword),
      )
    }
    return functions
  }

  guideFunction(scope: AiKnowledgeScope, action: string): AiRuntimeFunctionExposure | null {
    return this.requireProjection(scope).availableFunctions.find((fn) => fn.action === action) ?? null
  }

  queryModules(scope: AiKnowledgeScope): readonly AiRuntimeModuleExposure[] {
    return this.flattenModules(this.requireProjection(scope).module)
  }

  guideModule(scope: AiKnowledgeScope, modulePath: string): AiRuntimeModuleExposure | null {
    return this.findModuleInTree(this.requireProjection(scope).module, modulePath) ?? null
  }

  private requireProjection(scope: AiKnowledgeScope): RuntimeProjectionSnapshot {
    const projection = this.projections.get(AiKnowledgeProjector.scopeKey(scope))
    if (projection !== undefined) return projection
    throw new Error(
      `Knowledge projection missing for ${scope.moduleId}/${scope.moduleInstanceId}. ` +
      'Call AiRuntime.projectModule() or startInstance() for this scope first.',
    )
  }

  private flattenModules(root: AiRuntimeModuleExposure): AiRuntimeModuleExposure[] {
    const output: AiRuntimeModuleExposure[] = []
    const visit = (node: AiRuntimeModuleExposure): void => {
      output.push({ ...node, modules: [] })
      for (const child of node.modules) visit(child)
    }
    visit(root)
    return output
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
