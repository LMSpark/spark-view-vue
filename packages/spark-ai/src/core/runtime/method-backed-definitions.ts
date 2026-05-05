import type {
  FunctionCatalogRow,
  FunctionResult,
  RegisteredFunctionDefinition,
} from '../protocol/function-contracts'
import { actionToCarrierKey } from '../registry/function-carrier-registry'
import { invokeNamedMethod, toErrorMessage } from './function-dispatcher'

/**
 * 核心方法背书定义构建器。
 *
 * 这个文件把“目录行 + 目标解析 + 命名方法调用”组装成统一的可执行函数定义：
 * 1. 业务层继续声明自己的目录行、目标解析和业务错误文案
 * 2. core 统一负责命名方法调用、默认 METHOD_NOT_FOUND 和默认 EXECUTE_ERROR
 * 3. request 成功后的副作用钩子也在这里收敛执行时机
 */

/**
 * 功能分区一：构建输入与装配边界
 * 时序说明：
 * 1. 业务层先提供状态、目录行和目标解析规则
 * 2. 再补充校验、错误覆写、摘要和副作用钩子
 * 3. 最后交给公共 builder 生成 RegisteredFunctionDefinition 列表
 */

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

/**
 * 功能分区二：默认修复提示拼装
 * 时序说明：
 * 1. 当业务层没有覆写错误结果时，先从目录行提取 schema、示例和规则
 * 2. 再拼成统一的 fix 文案，供默认 METHOD_NOT_FOUND 和 EXECUTE_ERROR 复用
 */

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

/**
 * 功能分区三：公共方法背书定义构建入口
 * 时序说明：
 * 1. 先读取构建参数并准备默认错误处理器
 * 2. 再把每条目录行映射成标准 RegisteredFunctionDefinition
 * 3. 执行时按固定顺序完成目标解析、方法调用、副作用钩子和成功结果拼装
 * 4. 若方法缺失或执行异常，则回落到默认错误处理或业务覆写错误处理
 */

/**
 * 把目录行批量装配为“方法背书”的可执行函数定义。
 * 输入语义：接收运行时状态、目录行列表、目标解析规则、命名方法提取规则，以及可选的错误覆写和副作用钩子。
 * 输出语义：返回可直接注册到函数 registry 的 RegisteredFunctionDefinition 数组。
 * 调用时机：业务层已经拥有稳定 catalog row，且目标对象的实际执行逻辑已经存在于某个运行时实例方法上时调用。
 */
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
    type: row.type,
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

        if (row.type === 'request') {
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