import type { FunctionFailureMode } from '../../../core'

export type PageDesignFunctionKind = 'describe' | 'request'
export type PageDesignCapabilityIntegrationStatus = 'catalog-only' | 'runtime-wired'

export interface PageDesignFunctionCatalogRow {
  action: string
  type: PageDesignFunctionKind
  target: string
  description: string
  paramsSchema: Record<string, unknown>
  resultSchema: Record<string, unknown>
  example: Record<string, unknown>
  usageRules: readonly string[]
  failureModes: readonly FunctionFailureMode[]
}

export interface PageDesignCapabilityRow {
  action: string
  type: PageDesignFunctionKind
  target: string
  description: string
  integrationStatus: PageDesignCapabilityIntegrationStatus
  paramsRef: string
  rules?: readonly string[]
  failureCodes?: readonly string[]
  params?: Record<string, unknown>
  example?: Record<string, unknown>
}

export type PageDesignCapabilityExtras = Record<string, unknown>

export function createPageDesignCapabilityRow<
  TRow extends PageDesignFunctionCatalogRow,
  TCapability extends PageDesignCapabilityRow,
>(
  row: TRow,
  integrationStatus: PageDesignCapabilityIntegrationStatus,
  extras: PageDesignCapabilityExtras = {},
): TCapability {
  return {
    action: row.action,
    type: row.type,
    target: row.target,
    description: row.description,
    integrationStatus,
    paramsRef: row.action,
    ...extras,
    ...(row.usageRules.length > 0 ? { rules: row.usageRules } : {}),
    ...(row.failureModes.length > 0 ? { failureCodes: row.failureModes.map((item) => item.code) } : {}),
    ...(Object.keys(row.paramsSchema).length > 0 ? { params: row.paramsSchema } : {}),
    ...(Object.keys(row.example).length > 0 ? { example: row.example } : {}),
  } as TCapability
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
    this.parameterIndex = new Map(parameterTable.map((row) => [row.action, row]))
    this.capabilityIndex = new Map(capabilityTable.map((row) => [row.action, row]))
  }

  getParameterRow(action: string): TRow | undefined {
    return this.parameterIndex.get(action)
  }

  getCapabilityRow(action: string): TCapability | undefined {
    return this.capabilityIndex.get(action)
  }

  abstract validateParams(action: string, params: unknown): string | null
}
