/**
 * 页面设计编辑会话核心类型与契约。
 *
 * 包含 PageDesignEditSession、编辑宿主类型以及 Service 层契约类型。
 * PageDesignService 已迁移至 page-design-service.ts。
 * PageConfigEditWorkspace / PageConfigFileLifecycle 已迁移至 page-edit-workspace.ts。
 */

import type { DataSetCrudTool } from '@spark-view/spark-data'
import type { ModuleParameterPayloadGuide } from '@spark-view/spark-ai/module-semantic'

import type {
  SparkNodeTree,
  SparkNodeTreeMethodKey,
} from '@spark-view/spark-data'

import type {
  NavigationNodeDraft,
  NavigationContextDraft,
} from '../navigation'

export type { SparkNodeTreeMethodKey } from '@spark-view/spark-data'

// ── 编辑会话核心契约 ───────────────────────────────────────

export type PageDesignEditPhase = 'idle' | 'editing' | 'saved'

export type PageDesignNodeTree = Pick<SparkNodeTree, SparkNodeTreeMethodKey | 'toJSON'>

/**
 * PageDesign live edit 宿主能力。
 *
 * AI 工具只通过这些函数访问四文件模型；宿主负责把 node-tree、dataset、
 * script.js、style.css 映射到当前页面，并在变更回调里更新工作区 dirty 状态。
 */
export type PageDesignEditHost = {
  getNodeTree?: () => PageDesignNodeTree | null
  onNodeTreeChanged?: (nodeTree: PageDesignNodeTree) => void
  getDataSetTool?: () => DataSetCrudTool | null
  onDataSetChanged?: (tool: DataSetCrudTool) => void
  readScript?: () => string
  writeScript?: (content: string) => void
  readStyle?: () => string
  writeStyle?: (content: string) => void
  getNavDraft?: () => NavigationNodeDraft | null
  onNavDraftChanged?: (patch: Partial<NavigationNodeDraft>) => void
  getNavContext?: () => NavigationContextDraft | null
  onNavContextChanged?: (patch: Partial<NavigationContextDraft>) => void
}

/**
 * 单个 pageId 的 live edit 会话状态。
 *
 * 该对象只保存编辑态和已显式查询过的组件 payload guide；AI Host 会话历史、
 * turn stream 状态和后端 session 持久化均不在这里维护。
 */
export class PageDesignEditSession {
  phase: PageDesignEditPhase = 'idle'

  host: PageDesignEditHost | null = null

  private readonly guidedNodePayloads = new Map<string, ModuleParameterPayloadGuide>()

  bindHost(host: PageDesignEditHost): void {
    this.host = host
  }

  getActiveNodeTree(): PageDesignNodeTree | null {
    return this.host?.getNodeTree?.() ?? null
  }

  notifyNodeTreeChanged(nodeTree: PageDesignNodeTree): void {
    this.host?.onNodeTreeChanged?.(nodeTree)
  }

  getActiveDataSetTool(): DataSetCrudTool | null {
    return this.host?.getDataSetTool?.() ?? null
  }

  notifyDataSetChanged(tool: DataSetCrudTool): void {
    this.host?.onDataSetChanged?.(tool)
  }

  markNodePayloadGuided(key: string, guide: ModuleParameterPayloadGuide): void {
    const normalized = key.trim()
    if (normalized.length > 0) this.guidedNodePayloads.set(normalized, guide)
  }

  hasGuidedNodePayload(key: string): boolean {
    return this.guidedNodePayloads.has(key.trim())
  }

  getGuidedNodePayload(key: string): ModuleParameterPayloadGuide | null {
    return this.guidedNodePayloads.get(key.trim()) ?? null
  }

  listGuidedNodePayloads(): readonly string[] {
    return [...this.guidedNodePayloads.keys()].sort()
  }
}

// ── 服务层契约与结果类型 ─────────────────────────────────

export type PageDesignServiceContext = {
  requestId: string
  pageId: string
}

export type PageDesignServiceOptions = {
  getEditHost: (context: PageDesignServiceContext) => PageDesignEditHost
}

export type PageDesignServiceResult<TResult> =
  | { ok: true; data: TResult; summary: string }
  | { ok: false; code: string; msg: string; fix: string }

export type PageDesignTextFileKey = 'script' | 'style'

export type PageDesignServiceActionBinding<TTarget> = {
  serviceLabel: string
  run: (target: TTarget, args: unknown) => unknown
  mutates: boolean
  fixHint?: string
}

// ── Service Result 守卫 ───────────────────────────────────

export function pageDesignServiceSuccess<TResult>(
  data: TResult,
  summary: string,
): PageDesignServiceResult<TResult> {
  return { ok: true, data, summary }
}

export function pageDesignServiceFailure(
  code: string,
  msg: string,
  fix: string,
): PageDesignServiceResult<never> {
  return { ok: false, code, msg, fix }
}

function getProp(value: object, key: string): unknown {
  const desc = Object.getOwnPropertyDescriptor(value, key)
  return desc?.value
}

export function isPageDesignServiceResult(value: unknown): value is PageDesignServiceResult<unknown> {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return false
  const okValue = getProp(value, 'ok')
  if (okValue === true) {
    return 'data' in value && typeof getProp(value, 'summary') === 'string'
  }
  if (okValue === false) {
    return typeof getProp(value, 'code') === 'string'
      && typeof getProp(value, 'msg') === 'string'
      && typeof getProp(value, 'fix') === 'string'
  }
  return false
}
