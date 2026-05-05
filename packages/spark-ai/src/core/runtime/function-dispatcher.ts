import type {
  FunctionResult,
  FunctionRuntimeContext,
  FunctionTraceEntry,
  RegisteredFunctionDefinition,
} from '../protocol/function-contracts'
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
function createTraceEntry(action: string, requestId: string, summary: string): FunctionTraceEntry {
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
  const definition = getFunctionDefinition(action)
  if (!definition) {
    return unknownFunctionResult(action)
  }

  // 检查前置条件
  const guardResult = definition.guard?.(context) ?? null
  if (guardResult !== null) {
    return {
      ok: false,
      code: guardResult.code,
      msg: guardResult.msg,
      fix: buildGuardRetryFix(definition, guardResult.code, guardResult.msg),
    }
  }

  // 验证参数
  const validationError = definition.validate(params)
  if (validationError !== null) {
    return invalidParamsResult(action, validationError)
  }

  // 执行函数
  const result: FunctionResult = definition.execute(context, params)

  // 执行后置验证
  if (result.ok && definition.postValidate) {
    const warnings = definition.postValidate(context, params)
    if (warnings.length > 0) {
      result.warnings = warnings
    }
  }

  // 如果是写操作且成功，则记录到跟踪日志
  if (result.ok && definition.type === 'request') {
    context.patchLog.push(createTraceEntry(action, requestId, result.summary))
  }

  return result
}