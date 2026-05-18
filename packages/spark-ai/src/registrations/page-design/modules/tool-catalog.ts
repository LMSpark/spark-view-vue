import { LlmParamsValidator, type AiFunctionRegistration } from '../../../core'

export abstract class PageDesignToolCatalog<TRow extends AiFunctionRegistration> {
  readonly parameterTable: readonly TRow[]

  private readonly parameterIndex: ReadonlyMap<string, TRow>

  protected constructor(parameterTable: readonly TRow[]) {
    this.parameterTable = parameterTable
    this.parameterIndex = new Map(this.parameterTable.map((row) => [row.functionId, row]))
  }

  getParameterRow(functionId: string): TRow | undefined {
    return this.parameterIndex.get(functionId)
  }

  validateParams(functionId: string, params: unknown): string | null {
    const row = this.getParameterRow(functionId)
    if (row === undefined) return `未知 ${functionId} 函数`
    const result = LlmParamsValidator.validateLlmDeserializedParams(params ?? {}, row.paramsSchema)
    return result.ok ? null : LlmParamsValidator.formatLlmParamValidationIssues(result.issues)
  }
}
