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

/** still 动作统一返回值。ok=true 产出数据，ok=false 产出结构化修复提示。 */
export type StillResult<T = unknown> =
  | { ok: true; data: T; summary: string }
  | { ok: false; code: string; msg: string; fix: string }

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
  /** 参数结构说明（供 stills.actionSpec 返回） */
  paramsSchema?: Record<string, unknown>
  /** 返回结构说明 */
  resultSchema?: Record<string, unknown>
  /** 最小参数示例 */
  example?: Record<string, unknown>
  /** 参数校验，返回 null 表示通过，否则返回错误消息 */
  validate: (params: TParams) => string | null
  /** 纯函数执行，可直接修改 session（dispatcher 负责持久化） */
  execute: (session: IStillSession, params: TParams) => StillResult<TResult>
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
  /** 各域 slot 的通用容器，key = 域名 */
  domains: Record<string, unknown>
}

// ═══════════════════════════════════════════════════════════
// Domain Contract
// ═══════════════════════════════════════════════════════════

export interface DomainProvider {
  /** 域名（作为 session.domains 的 key） */
  name: string
  /** AI 角色描述（session.describe 返回给 AI 的角色定义） */
  roleHint: string
  /** 该域提供的全部 stills */
  stills: StillDefinition[]
  /** 创建域 slot 初始值 */
  createSlot(): unknown
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
