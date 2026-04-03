/**
 * Stills Registry + Dispatcher
 *
 * 这个文件只做两件事：
 * 1. 维护 still action 注册表；
 * 2. 负责统一分发执行流程（查找 → guard → validate → execute → patchLog）。
 */

import type { StillDefinition, StillResult, IStillSession, PatchEntry } from './types'

// ═══════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════

type AnyStill = StillDefinition<unknown, unknown>

const _registry = new Map<string, AnyStill>()

export function registerStill(still: AnyStill): void {
  _registry.set(still.action, still)
}

export function registerAll(stills: AnyStill[]): void {
  for (const still of stills) {
    _registry.set(still.action, still)
  }
}

export function getStill(action: string): AnyStill | undefined {
  return _registry.get(action)
}

export function getAllStills(): ReadonlyMap<string, AnyStill> {
  return _registry
}

/** 用于测试：清空注册表 */
export function clearRegistry(): void {
  _registry.clear()
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
    fix: `${correction}。先执行以下协议块获取动作目录：${buildProtocolTemplate('describe', 'stills.capabilities', 'retry-capabilities', {})}`,
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
      : `请查 stills.actionSpec {"action":"${action}"} 获取正确参数格式`,
  }
}

function buildProtocolTemplate(
  type: 'request' | 'describe',
  action: string,
  requestId: string,
  params: unknown,
): string {
  return `@@${type}:${action}#${requestId}\n${JSON.stringify(params, null, 2)}\n@@end`
}

function buildStillRetryFix(still: AnyStill, reason: string): string {
  const paramsSchema = still.paramsSchema ? JSON.stringify(still.paramsSchema, null, 2) : '{}'
  const example = still.example ?? {}
  const ruleText = still.usageRules && still.usageRules.length > 0
    ? ` 关键规则: ${still.usageRules.join('；')}`
    : ''
  return `${reason}。请改用正确协议块：${buildProtocolTemplate(still.type, still.action, 'retry-correct', example)} 参数结构: ${paramsSchema}.${ruleText}`
}

function buildGuardPrerequisiteFix(still: AnyStill, guardCode: string): string | null {
  switch (guardCode) {
    case 'NO_BLUEPRINT':
      return `前置条件缺失。请先查看 blueprint.create 规格：${buildProtocolTemplate('describe', 'stills.actionSpec', 'retry-blueprint-spec', { action: 'blueprint.create' })}`
    case 'NO_DATASET':
      return `前置条件缺失。请先初始化 DataSet：${buildProtocolTemplate('request', 'dataset.init', 'retry-dataset-init', { dataSetName: 'MyDataSet' })}`
    case 'SCHEMA_LOCKED':
      return `当前动作属于结构修改阶段，请先解锁 schema：${buildProtocolTemplate('request', 'schema.unlock', 'retry-schema-unlock', { reason: `需要继续执行 ${still.action}` })}`
    case 'SCHEMA_NOT_LOCKED':
      return `当前动作属于配置阶段，请先锁定 schema：${buildProtocolTemplate('request', 'schema.lock', 'retry-schema-lock', {})}`
    default:
      return null
  }
}

function buildGuardRetryFix(still: AnyStill, guardCode: string, guardMessage: string): string {
  const prerequisiteFix = buildGuardPrerequisiteFix(still, guardCode)
  const retryFix = buildStillRetryFix(still, '前置条件满足后再执行当前动作')

  if (prerequisiteFix === null) {
    return buildStillRetryFix(still, still.guardDescription ?? guardMessage)
  }

  return `${guardMessage}。${prerequisiteFix} ${retryFix}`
}

function tokenizeAction(action: string): string[] {
  return action.toLowerCase().split(/[._-]+/u).filter((token) => token.length > 0)
}

function scoreCandidateAction(requestedAction: string, candidateAction: string): number {
  const requestedTokens = tokenizeAction(requestedAction)
  const candidateTokens = tokenizeAction(candidateAction)
  let score = 0

  if (candidateAction.startsWith(requestedAction) || requestedAction.startsWith(candidateAction)) {
    score += 20
  }

  const [requestedNamespace] = requestedTokens
  const [candidateNamespace] = candidateTokens
  if (requestedNamespace && candidateNamespace && requestedNamespace === candidateNamespace) {
    score += 10
  }

  for (const token of requestedTokens) {
    if (candidateTokens.includes(token)) {
      score += 3
    }
  }

  return score
}

function findCandidateActions(action: string, max = 5): string[] {
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

  // 2. guard 负责检查当前会话上下文是否允许执行该动作
  const guardResult = still.guard(session)
  if (guardResult !== null) {
    return {
      ok: false,
      code: guardResult.code,
      msg: guardResult.msg,
      fix: buildGuardRetryFix(still, guardResult.code, guardResult.msg),
    }
  }

  // 3. validate 只负责参数形状与最小业务约束，不做真正副作用
  const validationError = still.validate(params)
  if (validationError !== null) {
    return invalidParamsResult(action, validationError)
  }

  // 4. 执行动作；request/describe 都走同一个入口，差异只体现在 type 与 patchLog 写入规则
  const result: StillResult = still.execute(session, params)

  // 5. 只有成功的 request 动作才写 patchLog；describe 动作不产生变更日志
  if (result.ok && still.type === 'request') {
    session.patchLog.push(createPatchEntry(action, requestId, result.summary))
  }

  return result
}
