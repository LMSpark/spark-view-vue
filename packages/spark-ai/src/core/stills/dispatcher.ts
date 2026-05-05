/**
 * Stills Registry + Dispatcher
 *
 * 这个文件只做两件事：
 * 1. 维护 still action 注册表；
 * 2. 负责统一分发执行流程（查找 → guard → validate → execute → patchLog）。
 */

import type { StillDefinition, StillResult, IStillSession, PatchEntry } from './types'
import { clearKnowledgeRegistry } from '../knowledge/registry'

// ═══════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════

const _registry = new Map<string, StillDefinition<never, unknown>>()

export function registerStill(still: StillDefinition<never, unknown>): void {
  _registry.set(still.action, still)
}

export function registerAll(stills: ReadonlyArray<StillDefinition<never, unknown>>): void {
  for (const still of stills) {
    _registry.set(still.action, still)
  }
}

export function getStill(action: string): StillDefinition<never, unknown> | undefined {
  return _registry.get(action)
}

export function getAllStills(): ReadonlyMap<string, StillDefinition<never, unknown>> {
  return _registry
}

/** 用于测试：清空注册表 */
export function clearRegistry(): void {
  _registry.clear()
  clearKnowledgeRegistry()
}

// ═══════════════════════════════════════════════════════════
// Dispatcher helper
// ═══════════════════════════════════════════════════════════

function unknownActionResult(action: string): StillResult {
  const candidates = findCandidateActions(action)
  const correction = candidates.length > 0
    ? `候选动作: ${candidates.join(', ')}`
    : '若不确定，请先查看全部动作目录'
  return {
    ok: false,
    code: 'UNKNOWN_ACTION',
    msg: `未知动作: ${action}`,
    fix: `${correction}。请先调用 core_knowledge_queryTools 获取全部函数目录。`,
  }
}

function invalidParamsResult(action: string, validationError: string): StillResult {
  const still = _registry.get(action)
  return {
    ok: false,
    code: 'INVALID_PARAMS',
    msg: validationError,
    fix: still
      ? buildStillRetryFix(still, `参数错误：${validationError}`)
      : `请调用 core_knowledge_guideTool({"action":"${action}"}) 获取正确参数格式`,
  }
}

/**
 * 构建动作调用示例文本（协议无关）
 *
 * FC 模式：直接描述函数名 + 参数 JSON
 */
function buildActionCallExample(action: string, params: unknown): string {
  return `调用 ${action.replace(/\./g, '_')}(${JSON.stringify(params, null, 2)})`
}

function buildStillRetryFix(still: StillDefinition<never, unknown>, reason: string): string {
  const paramsSchema = still.paramsSchema ? JSON.stringify(still.paramsSchema, null, 2) : '{}'
  const example = still.example ?? {}
  const ruleText = still.usageRules && still.usageRules.length > 0
    ? ` 关键规则: ${still.usageRules.join('；')}`
    : ''
  return `${reason}。请重新${buildActionCallExample(still.action, example)}。参数结构: ${paramsSchema}.${ruleText}`
}

function buildGuardRetryFix(still: StillDefinition<never, unknown>, guardCode: string, guardMessage: string): string {
  const guardHint = still.guardDescription ?? `前置条件未满足（${guardCode}）`
  return `${guardMessage}。${guardHint}。${buildStillRetryFix(still, '请先满足前置条件后重试当前动作')}`
}

function tokenizeAction(action: string): string[] {
  return action.toLowerCase().split(/[@._-]+/u).filter((token) => token.length > 0)
}

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

export function findCandidateActions(action: string, max = 5): string[] {
  return Array.from(_registry.keys())
    .map((candidate) => ({ candidate, score: scoreCandidateAction(action, candidate) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.candidate.localeCompare(right.candidate))
    .slice(0, max)
    .map((item) => item.candidate)
}

function createPatchEntry(action: string, requestId: string, summary: string): PatchEntry {
  return {
    action,
    requestId,
    timestamp: Date.now(),
    summary,
  }
}

// ═══════════════════════════════════════════════════════════
// Dispatcher
// ═══════════════════════════════════════════════════════════

export function executeStill(
  action: string,
  params: unknown,
  session: IStillSession,
  requestId: string,
): StillResult {
  // 1. 查找动作定义
  const still = _registry.get(action)
  if (!still) {
    return unknownActionResult(action)
  }

  // 2. guard 负责检查当前会话上下文是否允许执行该动作；省略时视为直接可执行
  const guardResult = still.guard?.(session) ?? null
  if (guardResult !== null) {
    return {
      ok: false,
      code: guardResult.code,
      msg: guardResult.msg,
      fix: buildGuardRetryFix(still, guardResult.code, guardResult.msg),
    }
  }

  // 3. validate 只负责参数形状与最小领域约束，不做真正副作用
  const validationError = still.validate(params as never)
  if (validationError !== null) {
    return invalidParamsResult(action, validationError)
  }

  // 4. 执行动作；request/describe 都走同一个入口，差异只体现在 type 与 patchLog 写入规则
  const result: StillResult = still.execute(session, params as never)

  // 5. postValidate：execute 成功后运行跨实体一致性校验，warnings 附着到 result
  if (result.ok && still.postValidate) {
    const warnings = still.postValidate(session, params as never)
    if (warnings.length > 0) {
      result.warnings = warnings
    }
  }

  // 6. 只有成功的 request 动作才写 patchLog；describe 动作不产生变更日志
  if (result.ok && still.type === 'request') {
    session.patchLog.push(createPatchEntry(action, requestId, result.summary))
  }

  return result
}
