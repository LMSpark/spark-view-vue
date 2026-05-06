import type {
  FunctionAfterExecuteEvent,
  FunctionAction,
  FunctionCarrierContract,
  FunctionResult,
  FunctionRuntimeContext,
  FunctionTraceEntry,
  RegisteredFunctionDefinition,
} from '../protocol/function-contracts'
import { toErrorMessage, actionToCarrierKey } from '../protocol/invocation-helpers'
import { getFunctionCarrierByAction } from '../registry/function-carrier-registry'
import { getAllFunctionDefinitions, getFunctionDefinition } from '../registry/function-registry'

/**
 * 未知函数错误结果生成器
 * 当函数不存在时，尝试查找相似的函数作为建议
 */
function unknownFunctionResult(action: string): FunctionResult {
  const candidates = findCandidateActions(action)
  const correction = candidates.length > 0
    ? `候选函数: ${candidates.join(', ')}`
    : '若不确定，请先查看全部函数目录'
  return {
    ok: false,
    code: 'UNKNOWN_ACTION',
    msg: `未知函数: ${action}`,
    fix: `${correction}。请先调用 core@knowledge@queryTools 获取全部函数目录。`,
  }
}

/**
 * 无效参数错误结果生成器
 * 当参数不符合函数要求时，提供修复建议
 */
function invalidParamsResult(action: string, validationError: string): FunctionResult {
  const definition = getFunctionDefinition(action)
  return {
    ok: false,
    code: 'INVALID_PARAMS',
    msg: validationError,
    fix: definition
      ? buildFunctionRetryFix(definition, `参数错误：${validationError}`)
      : `请调用 core@knowledge@guideTool({"action":"${action}"}) 获取正确参数格式`,
  }
}

/**
 * 构建函数调用示例
 */
function buildFunctionCallExample(action: string, params: unknown): string {
  return `调用 ${action}(${JSON.stringify(params, null, 2)})`
}

/**
 * 构建函数重试修复建议
 */
function buildFunctionRetryFix(definition: RegisteredFunctionDefinition<unknown, unknown>, reason: string): string {
  const paramsSchema = definition.paramsSchema ? JSON.stringify(definition.paramsSchema, null, 2) : '{}'
  const example = definition.example ?? {}
  const ruleText = definition.usageRules && definition.usageRules.length > 0
    ? ` 关键规则: ${definition.usageRules.join('；')}`
    : ''
  return `${reason}。请重新${buildFunctionCallExample(definition.action, example)}。参数结构: ${paramsSchema}.${ruleText}`
}

/**
 * 构建前置条件失败修复建议
 */
function buildGuardRetryFix(
  definition: RegisteredFunctionDefinition<unknown, unknown>,
  guardCode: string,
  guardMessage: string,
): string {
  const guardHint = definition.guardDescription ?? `前置条件未满足（${guardCode}）`
  return `${guardMessage}。${guardHint}。${buildFunctionRetryFix(definition, '请先满足前置条件后重试当前函数')}`
}

function definitionRequiresCarrier(definition: RegisteredFunctionDefinition<unknown, unknown>): boolean {
  return definition.guardWithCarrier !== undefined
    || definition.validateWithCarrier !== undefined
    || definition.executeWithCarrier !== undefined
}

function missingCarrierResult(
  action: string,
  definition: RegisteredFunctionDefinition<unknown, unknown>,
): FunctionResult {
  const carrierKey = actionToCarrierKey(action)
  return {
    ok: false,
    code: 'MISSING_CARRIER',
    msg: `${action} 缺少运行载体注入`,
    fix: `请先为 ${carrierKey} 注册 FunctionCarrierContract。${buildFunctionRetryFix(definition, '当前函数依赖模块实例注入')}`,
  }
}

function resolveDefinitionCarrier(
  action: string,
): {
  definition: RegisteredFunctionDefinition<unknown, unknown> | undefined
  carrier: FunctionCarrierContract<unknown> | undefined
  missingCarrier: FunctionResult | null
} {
  const definition = getFunctionDefinition(action)
  if (!definition) {
    return { definition: undefined, carrier: undefined, missingCarrier: null }
  }

  const carrier = getFunctionCarrierByAction(action)
  if (definitionRequiresCarrier(definition) && carrier === undefined) {
    return {
      definition,
      carrier: undefined,
      missingCarrier: missingCarrierResult(action, definition),
    }
  }

  return { definition, carrier, missingCarrier: null }
}

function runGuardChecks(
  definition: RegisteredFunctionDefinition<unknown, unknown>,
  context: FunctionRuntimeContext,
  carrier: FunctionCarrierContract<unknown> | undefined,
): { code: string; msg: string } | null {
  const baseGuard = definition.guard?.(context) ?? null
  if (baseGuard !== null) {
    return baseGuard
  }

  if (carrier !== undefined && definition.guardWithCarrier !== undefined) {
    return definition.guardWithCarrier(context, carrier.instance)
  }

  return null
}

function runValidationChecks(
  action: string,
  definition: RegisteredFunctionDefinition<unknown, unknown>,
  params: unknown,
  context: FunctionRuntimeContext,
  carrier: FunctionCarrierContract<unknown> | undefined,
): FunctionResult | null {
  const validationError = definition.validate(params)
  if (validationError !== null) {
    return invalidParamsResult(action, validationError)
  }

  if (carrier !== undefined && definition.validateWithCarrier !== undefined) {
    const carrierValidationError = definition.validateWithCarrier(params, carrier.instance, context)
    if (carrierValidationError !== null) {
      return invalidParamsResult(action, carrierValidationError)
    }
  }

  return null
}

function appendPostValidationWarnings(
  definition: RegisteredFunctionDefinition<unknown, unknown>,
  context: FunctionRuntimeContext,
  params: unknown,
  result: FunctionResult,
): void {
  if (!result.ok || !definition.postValidate) {
    return
  }

  const warnings = definition.postValidate(context, params)
  if (warnings.length > 0) {
    result.warnings = warnings
  }
}

function appendRequestTrace(
  context: FunctionRuntimeContext,
  action: FunctionAction,
  requestId: string,
  result: FunctionResult,
): void {
  if (result.ok) {
    context.patchLog.push(createTraceEntry(action, requestId, result.summary))
  }
}

function runExecution(
  action: FunctionAction,
  definition: RegisteredFunctionDefinition<unknown, unknown>,
  params: unknown,
  context: FunctionRuntimeContext,
  requestId: string,
  carrier: FunctionCarrierContract<unknown> | undefined,
): FunctionResult {
  const guardResult = runGuardChecks(definition, context, carrier)
  if (guardResult !== null) {
    return {
      ok: false,
      code: guardResult.code,
      msg: guardResult.msg,
      fix: buildGuardRetryFix(definition, guardResult.code, guardResult.msg),
    }
  }

  const validationResult = runValidationChecks(action, definition, params, context, carrier)
  if (validationResult !== null) {
    return validationResult
  }

  const result = carrier !== undefined && definition.executeWithCarrier !== undefined
    ? definition.executeWithCarrier(context, carrier.instance, params)
    : definition.execute(context, params)

  appendPostValidationWarnings(definition, context, params, result)
  appendRequestTrace(context, action, requestId, result)
  return result
}

function cancelledBeforeExecuteResult(
  definition: RegisteredFunctionDefinition<unknown, unknown>,
  carrier: FunctionCarrierContract<unknown>,
  action: FunctionAction,
  decision: { cancelled: true; code?: string; msg?: string; fix?: string },
): FunctionResult {
  return {
    ok: false,
    code: decision.code ?? 'EXECUTE_CANCELLED',
    msg: decision.msg ?? `运行载体 ${carrier.carrierKey} 取消了 ${action}`,
    fix: decision.fix ?? buildFunctionRetryFix(definition, `请检查运行载体 ${carrier.carrierKey} 的 beforeExecute 决策`),
  }
}

function beforeHookErrorResult(
  definition: RegisteredFunctionDefinition<unknown, unknown>,
  carrier: FunctionCarrierContract<unknown>,
  error: unknown,
): FunctionResult {
  return {
    ok: false,
    code: 'BEFORE_EXECUTE_ERROR',
    msg: `运行载体 ${carrier.carrierKey} 的 beforeExecute 失败: ${toErrorMessage(error)}`,
    fix: buildFunctionRetryFix(definition, `请检查运行载体 ${carrier.carrierKey} 的 beforeExecute 钩子实现`),
  }
}

function appendAfterHookWarning(
  result: FunctionResult,
  carrier: FunctionCarrierContract<unknown>,
  error: unknown,
): void {
  if (!result.ok) {
    return
  }

  result.warnings = [
    ...(result.warnings ?? []),
    {
      rule: 'carrier.afterExecute',
      detail: `运行载体 ${carrier.carrierKey} 的 afterExecute 失败: ${toErrorMessage(error)}`,
      fix: `请检查运行载体 ${carrier.carrierKey} 的 afterExecute 钩子实现。`,
    },
  ]
}

/**
 * 将函数动作分解为小写单词，用于相似度匹配
 */
function tokenizeAction(action: string): string[] {
  return action.toLowerCase().split(/[@._-]+/u).filter((token) => token.length > 0)
}

/**
 * 计算候选函数与请求函数的匹配分数
 * 分数越高表示越可能为用户想要调用的函数
 */
export function scoreCandidateAction(requestedAction: string, candidateAction: string): number {
  const requestedTokens = tokenizeAction(requestedAction)
  const candidateTokens = tokenizeAction(candidateAction)
  let score = 0

  if (candidateAction.startsWith(requestedAction) || requestedAction.startsWith(candidateAction)) {
    score += 20
  }

  const [requestedBusiness] = requestedTokens
  const [candidateBusiness] = candidateTokens
  if (requestedBusiness && candidateBusiness && requestedBusiness === candidateBusiness) {
    score += 10
  }

  for (const token of requestedTokens) {
    if (candidateTokens.includes(token)) {
      score += 3
    }
  }

  return score
}

/**
 * 查找最相似的候选函数
 * 用于在找不到指定函数时提供替代建议
 */
export function findCandidateActions(action: string, max = 5): string[] {
  return Array.from(getAllFunctionDefinitions().keys())
    .map((candidate) => ({ candidate, score: scoreCandidateAction(action, candidate) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.candidate.localeCompare(right.candidate))
    .slice(0, max)
    .map((item) => item.candidate)
}

/**
 * 创建函数执行跟踪条目
 */
function createTraceEntry(action: FunctionAction, requestId: string, summary: string): FunctionTraceEntry {
  return {
    action,
    requestId,
    timestamp: Date.now(),
    summary,
  }
}

/**
 * 执行函数的核心实现
 * 包括前置条件检查、参数验证、函数执行和后置处理
 */
export function executeFunction(
  action: string,
  params: unknown,
  context: FunctionRuntimeContext,
  requestId: string,
): FunctionResult {
  const { definition, carrier, missingCarrier } = resolveDefinitionCarrier(action)
  if (!definition) {
    return unknownFunctionResult(action)
  }
  if (missingCarrier !== null) {
    return missingCarrier
  }

  const executionAction = definition.action
  return runExecution(executionAction, definition, params, context, requestId, carrier)
}

export async function executeFunctionAsync(
  action: string,
  params: unknown,
  context: FunctionRuntimeContext,
  requestId: string,
): Promise<FunctionResult> {
  const { definition, carrier, missingCarrier } = resolveDefinitionCarrier(action)
  if (!definition) {
    return unknownFunctionResult(action)
  }
  if (missingCarrier !== null) {
    return missingCarrier
  }

  if (carrier !== undefined) {
    try {
      const executionAction = definition.action
      const decision = await context.emitBeforeExecute(carrier, {
        action: executionAction,
        carrierKey: carrier.carrierKey,
        params,
      }, context)
      if (decision?.cancelled === true) {
        return cancelledBeforeExecuteResult(definition, carrier, executionAction, decision)
      }
    } catch (error) {
      return beforeHookErrorResult(definition, carrier, error)
    }
  }

  const executionAction = definition.action
  const result = runExecution(executionAction, definition, params, context, requestId, carrier)

  if (carrier !== undefined) {
    const afterEvent: FunctionAfterExecuteEvent = {
      action: executionAction,
      carrierKey: carrier.carrierKey,
      params,
      result,
    }
    try {
      await context.emitAfterExecute(carrier, afterEvent, context)
    } catch (error) {
      appendAfterHookWarning(result, carrier, error)
    }
  }

  return result
}