/**
 * Stills 类型系统
 *
 * 这个文件只定义 still 引擎的公共协议，不承载任何具体 domain 的业务逻辑：
 * 1. StillDefinition 描述一个原子动作；
 * 2. IStillSession 描述跨 domain 共享的会话容器；
 * 3. DomainProvider 描述一个 domain 如何挂接到 still 引擎。
 */

import type { IDataSetMetadata, TableRelation, ViewDependency } from '@spark-view/spark-data'

// ═══════════════════════════════════════════════════════════
// Guard / Result
// ═══════════════════════════════════════════════════════════

/** Guard 检查函数，返回 null 表示通过，返回对象表示被拒原因 */
export type StillGuard = (session: IStillSession) => { code: string; msg: string } | null

/** 后置校验产生的警告（不阻断执行，但需要 LLM 关注修复）。 */
export interface PostValidationWarning {
  /** 校验规则标识 */
  rule: string
  /** 人类可读的问题描述 */
  detail: string
  /** 建议修复动作（可直接拼入 fix 提示） */
  fix?: string
}

/** still 动作统一返回值。ok=true 产出数据，ok=false 产出结构化修复提示。 */
export type StillResult<T = unknown> =
  | { ok: true; data: T; summary: string; warnings?: PostValidationWarning[] }
  | { ok: false; code: string; msg: string; fix: string }

/** still 已知失败模式，用于把 fail-fast 边界显式暴露给 LLM。 */
export interface StillFailureMode {
  code: string
  when: string
  fix: string
}

// ═══════════════════════════════════════════════════════════
// Still Definition
// ═══════════════════════════════════════════════════════════

export interface StillDefinition<TParams = unknown, TResult = unknown> {
  /** action 名，如 'datatable.create' */
  action: string
  /** 块类型 */
  type: 'request' | 'describe'
  /** 供 AI 查询的说明 */
  description: string
  /** 函数式准入条件 */
  guard: StillGuard
  /** 人类可读的 guard 描述（供 stills.capabilities / stills.actionSpec 返回给 AI） */
  guardDescription?: string
  /** 使用约束 / 关键规则（供 stills.actionSpec 返回，减少 AI 猜测） */
  usageRules?: string[]
  /** 参数结构说明（供 stills.actionSpec 返回） */
  paramsSchema?: Record<string, unknown>
  /** 返回结构说明 */
  resultSchema?: Record<string, unknown>
  /** 最小参数示例 */
  example?: Record<string, unknown>
  /** 常见失败模式（供 stills.actionSpec 返回） */
  failureModes?: StillFailureMode[]
  /** 参数校验，返回 null 表示通过，否则返回错误消息 */
  validate: (params: TParams) => string | null
  /** 纯函数执行，可直接修改 session（dispatcher 负责持久化） */
  execute: (session: IStillSession, params: TParams) => StillResult<TResult>
  /**
   * 后置校验钩子（可选）。
   *
   * dispatcher 在 execute 返回 ok=true 后调用，返回的 warnings 附着到 result。
   * 用于跨实体一致性校验（如 FK 覆盖、options 视图完整性、聚合列交叉验证），
   * 这些校验依赖 execute 的副作用结果，无法在 validate（纯参数校验）阶段运行。
   */
  postValidate?: (session: IStillSession, params: TParams) => PostValidationWarning[]
}

// ═══════════════════════════════════════════════════════════
// Blueprint
// ═══════════════════════════════════════════════════════════

export type BlueprintExecutionMode = 'inline' | 'subagent'

export interface BlueprintPlanItem {
  id: string
  title: string
  action: string
  status: 'pending' | 'done'
  note?: string
  dependsOn?: string[]
  relatedPlanItemIds?: string[]
  executionMode?: BlueprintExecutionMode
  subagentGoal?: string
}

export interface BlueprintCheckpoint {
  id: string
  title: string
  plannedActions: string[]
  planItems: BlueprintPlanItem[]
  validation: string
  status: 'pending' | 'done'
  note?: string
  dependsOn?: string[]
  relatedCheckpointIds?: string[]
  executionMode?: BlueprintExecutionMode
  subagentGoal?: string
}

export interface ExecutionBlueprint {
  version: 1
  userGoal: string
  currentCheckpointId: string
  currentPlanItemId: string
  openQuestions: string[]
  checkpoints: BlueprintCheckpoint[]
  lastReflection?: string
}

// ═══════════════════════════════════════════════════════════
// Session State
// ═══════════════════════════════════════════════════════════

/**
 * DomainState — stills 会话层里“某个 domain 挂在 session.domains 下的状态对象”这一核心概念。
 *
 * 约束：
 * 1. 统一使用 `data` 表达该域当前承载的数据对象；
 * 2. 统一使用 `phase` 表达该域当前流程阶段；
 * 3. 具体 domain 应通过 extends + 泛型实参约束 data / phase 的具体类型，而不是重新发明同义字段名；
 * 4. `phase` 的基线约束是字符串标签；domain 可细化为 string literal union；
 * 5. 域特有属性（如 dataset 的 locked）由具体域状态接口 extends 添加，不污染泛型协议；
 * 6. IStillSession.domains / getDomainState / DomainProvider.createState 全部围绕它组织。
 */
export interface DomainState<TData = unknown, TPhase extends string = string> {
  data: TData
  phase: TPhase
}

/** 成功 request 动作写入的变更日志。 */
export interface PatchEntry {
  action: string
  requestId: string
  timestamp: number
  summary: string
}

export interface IStillSession {
  /** 蓝图（域无关，所有域共享编排） */
  blueprint: ExecutionBlueprint | null
  /** 操作日志 */
  patchLog: PatchEntry[]
  /** 各域 state 的通用容器，key = 域名 */
  domains: Record<string, DomainState<unknown, string>>
}

/** 从 session.domains 中按域名读取强类型 state。 */
export function getDomainState<TState extends DomainState<unknown, string>>(session: IStillSession, domainName: string): TState {
  return session.domains[domainName] as TState
}

// ═══════════════════════════════════════════════════════════
// Domain Contract
// ═══════════════════════════════════════════════════════════

export interface DomainProvider<TState extends DomainState<unknown, string> = DomainState<unknown, string>> {
  /** 域名（作为 session.domains 的 key） */
  name: string
  /** AI 角色描述（session.describe 返回给 AI 的角色定义） */
  roleHint: string
  /** 该域提供的全部 stills */
  stills: StillDefinition[]
  /** 创建域 state 初始值 */
  createState(): TState
}

// ═══════════════════════════════════════════════════════════
// Guard Helper
// ═══════════════════════════════════════════════════════════

/** 无准入条件 */
export const noGuard: StillGuard = () => null

/** 仅要求 blueprint 已创建 */
export function requireBlueprint(session: IStillSession): { code: string; msg: string } | null {
  if (session.blueprint === null) return { code: 'NO_BLUEPRINT', msg: 'Blueprint 尚未创建，请先执行 blueprint.create' }
  return null
}

// ═══════════════════════════════════════════════════════════
// Re-exported Data Types
// ═══════════════════════════════════════════════════════════

export type { IDataSetMetadata, TableRelation, ViewDependency }
