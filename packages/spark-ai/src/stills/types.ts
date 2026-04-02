/**
 * Stills 类型系统 — Dataset Memory 渐进式构建引擎
 *
 * IStillSession = 通用会话容器（域对象以 key-value 挂载在 domains 中）
 * StillDefinition = 一个原子动作的完整描述（描述、守卫、校验、执行）
 * DomainProvider = 域注册契约
 */

import type { IDataSetMetadata, TableRelation, ViewDependency } from '@spark-view/spark-data'

// ─── StillGuard（函数式准入条件）────────────────────────────

/** Guard 检查函数，返回 null 表示通过，返回对象表示被拒原因 */
export type StillGuard = (session: IStillSession) => { code: string; msg: string } | null

// ─── StillResult（动作执行结果）─────────────────────────────

export type StillResult<T = unknown> =
  | { ok: true; data: T; summary: string }
  | { ok: false; code: string; msg: string; fix: string }

// ─── StillDefinition（动作定义）─────────────────────────────

export interface StillDefinition<TParams = unknown, TResult = unknown> {
  /** action 名，如 'datatable.create' */
  action: string
  /** 块类型 */
  type: 'request' | 'describe'
  /** 供 AI 查询的说明 */
  description: string
  /** 函数式准入条件 */
  guard: StillGuard
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

// ─── ExecutionBlueprint（蓝图，域无关）──────────────────────

export interface BlueprintCheckpoint {
  id: string
  title: string
  plannedActions: string[]
  validation: string
  status: 'pending' | 'done'
  note?: string
}

export interface ExecutionBlueprint {
  version: 1
  userGoal: string
  currentCheckpointId: string
  openQuestions: string[]
  checkpoints: BlueprintCheckpoint[]
  lastReflection?: string
}

// ─── PatchEntry（操作日志）──────────────────────────────────

export interface PatchEntry {
  action: string
  requestId: string
  timestamp: number
  summary: string
}

// ─── IStillSession（通用会话容器）───────────────────────────

export interface IStillSession {
  /** 蓝图（域无关，所有域共享编排） */
  blueprint: ExecutionBlueprint | null
  /** 操作日志 */
  patchLog: PatchEntry[]
  /** 各域 slot 的通用容器，key = 域名 */
  domains: Record<string, unknown>
}

// ─── DomainProvider（域注册契约）────────────────────────────

export interface DomainProvider {
  /** 域名（作为 session.domains 的 key） */
  name: string
  /** 该域提供的全部 stills */
  stills: StillDefinition[]
  /** 创建域 slot 初始值 */
  createSlot(): unknown
}

// ─── Guard 工具函数 ─────────────────────────────────────────

/** 无准入条件 */
export const noGuard: StillGuard = () => null

/** 仅要求 blueprint 已创建 */
export function requireBlueprint(session: IStillSession): { code: string; msg: string } | null {
  if (session.blueprint === null) return { code: 'NO_BLUEPRINT', msg: 'Blueprint 尚未创建，请先执行 blueprint.create' }
  return null
}

// ─── 辅助类型（导出给 methods 使用）────────────────────────

export type { IDataSetMetadata, TableRelation, ViewDependency }
