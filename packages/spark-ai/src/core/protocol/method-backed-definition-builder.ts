import type {
  FunctionCatalogRow,
  FunctionResult,
  RegisteredFunctionDefinition,
} from './function-contracts'
import { invokeNamedMethod, toErrorMessage, actionToCarrierKey } from './invocation-helpers'

interface MethodBackedBuildOptions<TCarrier, TRow extends FunctionCatalogRow, TTarget> {
  rows: readonly TRow[]
  modulePrompt?: string | undefined
  resolveTarget: (carrier: TCarrier, row: TRow) => TTarget | null
  methodName: (row: TRow) => string
  validate: (row: TRow, params: unknown) => string | null
  missingTarget: (row: TRow) => FunctionResult
  missingMethod?: ((row: TRow, methodName: string) => FunctionResult) | undefined
  executeError?: ((row: TRow, errorMessage: string) => FunctionResult) | undefined
  summary?: ((row: TRow) => string) | undefined
  afterRequest?: ((carrier: TCarrier, target: TTarget, row: TRow) => void) | undefined
}

function buildRowFixHint(row: FunctionCatalogRow): string {
  const parts: string[] = []
  if (row.paramsSchema !== undefined) {
    parts.push(`参数格式: ${JSON.stringify(row.paramsSchema)}`)
  }
  if (row.example !== undefined && Object.keys(row.example).length > 0) {
    parts.push(`示例: ${JSON.stringify(row.example)}`)
  }
  if (row.usageRules !== undefined && row.usageRules.length > 0) {
    parts.push(`关键规则: ${row.usageRules.join('；')}`)
  }
  return parts.join('；') || `请调用 core@knowledge@guideTool({"action":"${row.action}"}) 获取正确参数格式`
}

export function createMethodBackedDefinitions<TState, TRow extends FunctionCatalogRow, TTarget>(
  options: MethodBackedBuildOptions<TState, TRow, TTarget>,
): RegisteredFunctionDefinition[] {
  const {
    rows,
    modulePrompt,
    resolveTarget,
    methodName,
    validate,
    missingTarget,
    summary,
    afterRequest,
  } = options

  const resolveMissingMethod = options.missingMethod
    ?? ((row: TRow, name: string): FunctionResult => ({
      ok: false,
      code: 'METHOD_NOT_FOUND',
      msg: `${row.action}: method "${name}" not found on target`,
      fix: buildRowFixHint(row),
    }))

  const resolveExecuteError = options.executeError
    ?? ((row: TRow, errorMessage: string): FunctionResult => ({
      ok: false,
      code: 'EXECUTE_ERROR',
      msg: errorMessage,
      fix: buildRowFixHint(row),
    }))

  const buildMissingCarrierResult = (row: TRow): FunctionResult => ({
    ok: false,
    code: 'MISSING_CARRIER',
    msg: `${row.action} 缺少运行载体注入`,
    fix: `请先为 ${actionToCarrierKey(row.action)} 注册 FunctionCarrierContract。${buildRowFixHint(row)}`,
  })

  return rows.map((row) => ({
    action: row.action,
    description: row.description,
    ...(modulePrompt !== undefined ? { modulePrompt } : {}),
    ...(row.paramsSchema !== undefined ? { paramsSchema: row.paramsSchema } : {}),
    ...(row.resultSchema !== undefined ? { resultSchema: row.resultSchema } : {}),
    ...(row.example !== undefined ? { example: row.example } : {}),
    ...(row.usageRules !== undefined ? { usageRules: row.usageRules } : {}),
    ...(row.failureModes !== undefined ? { failureModes: row.failureModes } : {}),
    validate: (params: unknown) => validate(row, params),
    execute: (): FunctionResult => buildMissingCarrierResult(row),
    executeWithCarrier: (_context, carrier, params: unknown): FunctionResult => {
      const target = resolveTarget(carrier as TState, row)
      if (target === null) {
        return missingTarget(row)
      }

      try {
        const name = methodName(row)
        const invocation = invokeNamedMethod(target, name, params)
        if (!invocation.ok) {
          return resolveMissingMethod(row, name)
        }

        if ((row as { type?: string }).type === 'request') {
          afterRequest?.(carrier as TState, target, row)
        }

        return {
          ok: true,
          data: invocation.data,
          summary: summary ? summary(row) : `${row.action} 完成`,
        }
      } catch (err) {
        return resolveExecuteError(row, toErrorMessage(err))
      }
    },
  }))
}