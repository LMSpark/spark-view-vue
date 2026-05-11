import type { FunctionFailureMode, LlmJsonObject, LlmParameterSchemaRoot } from '../../../core'

export type PageDesignFunctionKind = 'describe' | 'request'
export type PageDesignCapabilityIntegrationStatus = 'catalog-only' | 'runtime-wired'
export type PageDesignFunctionRegistrationStatus = 'registered' | 'catalog-only'
export type PageDesignTextModelFileKey = 'script' | 'style'
export type PageDesignJsonDocOperation = 'read' | 'list' | 'get' | 'set' | 'delete' | 'append' | 'setMultiple' | 'query'
export type PageDesignServiceRuntimeBinding =
  | {
    readonly kind: 'page-design-service'
    readonly method: 'bootstrap' | 'describeProgress'
  }
  | {
    readonly kind: 'page-design-service'
    readonly method: 'readTextModel' | 'writeTextModel'
    readonly fileKey: PageDesignTextModelFileKey
  }
  | {
    readonly kind: 'page-design-service'
    readonly method: 'useNodeTreeMethod' | 'useDatasetMethod'
    readonly targetMethod: string
  }
  | {
    readonly kind: 'page-design-service'
    readonly method: 'useJsonDocOperation'
    readonly jsonDocOperation: PageDesignJsonDocOperation
  }
export type PageDesignKnowledgeRuntimeBinding = {
  readonly kind: 'page-design-knowledge'
  readonly method: 'queryFunctions' | 'queryModules' | 'guideFunction' | 'queryPayloads' | 'guidePayload'
}
export type PageDesignFunctionRuntimeBinding = PageDesignServiceRuntimeBinding | PageDesignKnowledgeRuntimeBinding

export interface PageDesignFunctionCatalogRow {
  /**
   * 模块内函数 ID，只描述当前模块声明了哪个函数。
   * LLM 可调用 action 由 core 在会话投影时生成，目录元数据不承载调用路径。
   */
  functionId: string
  type: PageDesignFunctionKind
  target: string
  description: string
  paramsSchema: LlmParameterSchemaRoot
  resultSchema: LlmJsonObject
  example: LlmJsonObject
  usageRules: readonly string[]
  failureModes: readonly FunctionFailureMode[]
  runtimeBinding: PageDesignFunctionRuntimeBinding
  runtimeRegistration: PageDesignFunctionRegistrationStatus
}

export interface PageDesignCapabilityRow {
  /** 模块内函数 ID，不是 LLM action 路径。 */
  functionId: string
  type: PageDesignFunctionKind
  target: string
  description: string
  integrationStatus: PageDesignCapabilityIntegrationStatus
  paramsRef: string
  rules?: readonly string[]
  failureCodes?: readonly string[]
  params?: LlmParameterSchemaRoot
  example?: LlmJsonObject
}

export type PageDesignCapabilityExtras = LlmJsonObject

export function createPageDesignCapabilityRow<
  TRow extends PageDesignFunctionCatalogRow,
  TCapability extends PageDesignCapabilityRow,
>(
  row: TRow,
  integrationStatus: PageDesignCapabilityIntegrationStatus,
  extras: PageDesignCapabilityExtras = {},
): TCapability {
  const capability = {
    functionId: row.functionId,
    type: row.type,
    target: row.target,
    description: row.description,
    integrationStatus,
    paramsRef: row.functionId,
    ...extras,
    ...(row.usageRules.length > 0 ? { rules: row.usageRules } : {}),
    ...(row.failureModes.length > 0 ? { failureCodes: row.failureModes.map((item) => item.code) } : {}),
    ...(Object.keys(row.paramsSchema).length > 0 ? { params: row.paramsSchema } : {}),
    ...(Object.keys(row.example).length > 0 ? { example: row.example } : {}),
  }
  return capability as unknown as TCapability
}

export abstract class PageDesignToolCatalog<
  TRow extends PageDesignFunctionCatalogRow,
  TCapability extends PageDesignCapabilityRow,
> {
  readonly parameterTable: readonly TRow[]

  readonly capabilityTable: readonly TCapability[]

  private readonly parameterIndex: ReadonlyMap<string, TRow>

  private readonly capabilityIndex: ReadonlyMap<string, TCapability>

  protected constructor(parameterTable: readonly TRow[], capabilityTable: readonly TCapability[]) {
    this.parameterTable = parameterTable
    this.capabilityTable = capabilityTable
    this.parameterIndex = new Map(this.parameterTable.map((row) => [row.functionId, row]))
    this.capabilityIndex = new Map(this.capabilityTable.map((row) => [row.functionId, row]))
  }

  getParameterRow(functionId: string): TRow | undefined {
    return this.parameterIndex.get(functionId)
  }

  getCapabilityRow(functionId: string): TCapability | undefined {
    return this.capabilityIndex.get(functionId)
  }

  abstract validateParams(functionId: string, params: unknown): string | null
}
