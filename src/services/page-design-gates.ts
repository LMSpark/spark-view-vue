/**
 * @module app:services/page-design-gates
 * 职责：提供应用运行时 service 层的 page design gates 能力，连接项目模型、AI Host、租户上下文或页面设计流程。
 * 边界：负责 src 应用侧编排，不修改底层包协议，也不绕过已注册的 capability/data 管线。
 * AI用途：排查应用侧服务如何调用 spark-ai 或项目模型时，用本模块确认运行时接线。
 */
/**
 * pageDesign 人工闸门：从 readPlanningProjection 读取 planningStatus / implGate，fail-fast 拒绝未放行页面。
 */
import type { ProjectPageNodeSummary } from '@spark-appworks/spark-project-model'

/** Page Design Run Mode 的语义模型。 */
export type PageDesignRunMode = 'create' | 'update' | 'fix'

/** Page Design Planning Status 的语义模型。 */
export type PageDesignPlanningStatus = 'planning_draft' | 'planning_confirmed'

/** Page Design Impl Gate 的语义模型。 */
export type PageDesignImplGate = 'closed' | 'open'

/** Page Design Gate State 的运行状态。 */
export type PageDesignGateState = Readonly<{
  pageId: string
  planningStatus: PageDesignPlanningStatus
  implGate: PageDesignImplGate
  upstreamContractsSatisfied: boolean
}>

/** Read Page Design Gate State Options 的调用配置。 */
export type ReadPageDesignGateStateOptions = Readonly<{
  /** 未声明 implGate 时是否视为 closed；默认 false（过渡兼容）。 */
  strictImplGate?: boolean
}>

/** Page Design Gate Validation Result 的返回结果。 */
export type PageDesignGateValidationResult = Readonly<{
  ok: boolean
  code?: string
  reason?: string
  fix?: string
}>

const MUTATION_TOOL_NAMES = new Set([
  'model_script',
  'writepagefile',
  'openpagedesign',
])

export function readPageDesignGateState(
  summary: ProjectPageNodeSummary,
  options: ReadPageDesignGateStateOptions = {},
): PageDesignGateState {
  const explicitPlanningStatus = readPlanningStatus(summary)
  const effectiveDescription = summary.effectiveDescription.trim()
  const planningStatus = explicitPlanningStatus ?? (
    effectiveDescription.length > 0 ? 'planning_confirmed' : 'planning_draft'
  )
  const implGate = readImplGate(summary, options.strictImplGate === true)
  const upstreamContractsSatisfied = readUpstreamContractsSatisfied(summary)

  return {
    pageId: summary.pageId,
    planningStatus,
    implGate,
    upstreamContractsSatisfied,
  }
}

export function validatePageDesignRunGate(
  state: PageDesignGateState,
  _mode: PageDesignRunMode = 'update',
): PageDesignGateValidationResult {
  if (state.planningStatus === 'planning_draft') {
    return {
      ok: false,
      code: 'PLANNING_DRAFT',
      reason: `page "${state.pageId}" planningStatus=planning_draft，策划尚未定稿。`,
      fix: '补全 navigation description / descriptionContext，使 effectiveDescription 非空，并将 planningStatus 设为 planning_confirmed。',
    }
  }

  if (state.implGate !== 'open') {
    return {
      ok: false,
      code: 'IMPL_GATE_CLOSED',
      reason: `page "${state.pageId}" implGate=closed，实现闸门未放行。`,
      fix: '人工确认数据流与上游契约后，将 navigation meta.implGate 设为 open，再运行 pageDesign。',
    }
  }

  if (!state.upstreamContractsSatisfied) {
    return {
      ok: false,
      code: 'UPSTREAM_CONTRACTS_UNSATISFIED',
      reason: `page "${state.pageId}" upstreamContractsSatisfied=false，上游数据契约未就绪。`,
      fix: '补齐 iPaaS / pagedata 契约或等待联调通过，再将 upstreamContractsSatisfied 设为 true。',
    }
  }

  return { ok: true }
}

export function assertPageDesignRunGateAllowed(
  summary: ProjectPageNodeSummary,
  mode: PageDesignRunMode = 'update',
  options: ReadPageDesignGateStateOptions = {},
): void {
  const state = readPageDesignGateState(summary, options)
  const result = validatePageDesignRunGate(state, mode)
  if (result.ok) return
  throw new Error(formatPageDesignGateFailure(result))
}

/** Evaluate Page Design Mutation Tool Gate Options 的调用配置。 */
export type EvaluatePageDesignMutationToolGateOptions = Readonly<{
  toolName: string
  summary: ProjectPageNodeSummary
  mode?: PageDesignRunMode
  gateOptions?: ReadPageDesignGateStateOptions
}>

export function evaluatePageDesignMutationToolGate(
  options: EvaluatePageDesignMutationToolGateOptions,
): PageDesignGateValidationResult {
  if (!isPageDesignMutationTool(options.toolName)) {
    return { ok: true }
  }
  const state = readPageDesignGateState(options.summary, options.gateOptions)
  return validatePageDesignRunGate(state, options.mode ?? 'update')
}

export function isPageDesignMutationTool(toolName: string): boolean {
  return MUTATION_TOOL_NAMES.has(normalizeToolName(toolName))
}

function readPlanningStatus(summary: ProjectPageNodeSummary): PageDesignPlanningStatus | undefined {
  const value = summary.planningStatus
  if (value === 'planning_draft' || value === 'planning_confirmed') {
    return value
  }
  return undefined
}

function readImplGate(summary: ProjectPageNodeSummary, strictImplGate: boolean): PageDesignImplGate {
  if (summary.implGate === 'closed' || summary.implGate === 'open') {
    return summary.implGate
  }
  return strictImplGate ? 'closed' : 'open'
}

function readUpstreamContractsSatisfied(summary: ProjectPageNodeSummary): boolean {
  const value = summary.upstreamContractsSatisfied
  if (typeof value === 'boolean') return value
  return true
}

function normalizeToolName(toolName: string): string {
  return toolName.trim().toLowerCase().replace(/[^a-z0-9_]/gu, '')
}

function formatPageDesignGateFailure(result: PageDesignGateValidationResult): string {
  const reason = result.reason ?? 'pageDesign gate rejected.'
  const fix = result.fix === undefined ? '' : ` ${result.fix}`
  return `${reason}${fix}`
}
