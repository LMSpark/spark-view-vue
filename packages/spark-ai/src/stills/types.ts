/**
 * Stills 类型系统 — Dataset Memory 渐进式构建引擎
 *
 * StillDefinition = 一个原子动作的完整描述（描述、守卫、校验、执行）
 * StillContext = 执行时的只读上下文（blueprint + dataset + 状态）
 * DesignSessionV2 = 替代 v1 的会话持久化结构
 */

import type { IDataSetMetadata, TableRelation, ViewDependency } from '@spark-view/spark-data'

// ─── 设计步骤 ───────────────────────────────────────────────

/** 6 步工作流步骤标识 */
export type DesignStep = '①' | '②' | '③' | '④' | '⑤' | '⑥'

// ─── StillGuard（声明式准入条件）────────────────────────────

export interface StillGuard {
  /** 是否需要 dataset 已初始化，默认 true */
  requireDataset?: boolean
  /** 是否需要 blueprint 已创建 */
  requireBlueprint?: boolean
  /** 是否需要 schema 未锁定 */
  requireSchemaUnlocked?: boolean
  /** 是否需要 schema 已锁定 */
  requireSchemaLocked?: boolean
}

// ─── StillResult（动作执行结果）─────────────────────────────

export type StillResult<T = unknown> =
  | { ok: true; data: T; summary: string }
  | { ok: false; code: string; msg: string; fix: string }

// ─── StillContext（执行上下文，传入 execute）────────────────

export interface StillContext {
  session: DesignSessionV2
}

// ─── StillDefinition（动作定义）─────────────────────────────

export interface StillDefinition<TParams = unknown, TResult = unknown> {
  /** SAP action 名，如 'datatable.create' */
  action: string
  /** SAP 块类型 */
  type: 'request' | 'describe'
  /** 供 AI 查询的说明 */
  description: string
  /** 声明式准入条件 */
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
  execute: (ctx: StillContext, params: TParams) => StillResult<TResult>
}

// ─── ExecutionBlueprint（蓝图）──────────────────────────────

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

// ─── DesignSessionV2（会话状态）─────────────────────────────

export interface DesignSessionV2 {
  version: 2
  currentStep: DesignStep
  schemaLocked: boolean
  blueprint: ExecutionBlueprint | null
  dataset: IDataSetMetadata | null
  patchLog: PatchEntry[]
}

// ─── 工厂函数 ──────────────────────────────────────────────

export function createSession(): DesignSessionV2 {
  return {
    version: 2,
    currentStep: '①',
    schemaLocked: false,
    blueprint: null,
    dataset: null,
    patchLog: [],
  }
}

export function createEmptyDataset(name: string): IDataSetMetadata {
  return {
    dataSetName: name,
    schemaVersion: 1,
    tables: {},
    tableRelations: [],
    viewDependencies: [],
    version: undefined,
    pageId: undefined,
  }
}

// ─── 辅助类型（导出给 methods 使用）────────────────────────

export type { IDataSetMetadata, TableRelation, ViewDependency }
