/**
 * @module app:services/page-design-gates
 * 职责：提供应用运行时 service 层的 page design gates 能力，连接项目模型、AI Host、租户上下文或页面设计流程。
 * 边界：负责 src 应用侧编排，不修改底层包协议，也不绕过已注册的 capability/data 管线。
 * AI用途：排查应用侧服务如何调用 spark-ai 或项目模型时，用本模块确认运行时接线。
 */
/**
 * pageDesign 人工闸门：从 readPlanningProjection 读取 effectiveDescription / implGate，fail-fast 拒绝未放行页面。
 * allowedOperations 非空时，对 model_script 做操作域 marker 硬拦截。
 */
import type { AiJsonParams } from '@spark-appworks/spark-ai/json'
import type { PageNodeFileName, ProjectPageNodeSummary } from '@spark-appworks/spark-project-model'

/** Page Design Allowed Operations 的语义模型。 */
export type PageDesignAllowedOperations = Readonly<{
  nodeTree?: boolean
  dataSet?: boolean
  script?: boolean
  style?: boolean
  navigation?: boolean
}>

/** Page Design Run Context 的运行上下文。 */
export type PageDesignRunContext = Readonly<{
  allowedOperations?: PageDesignAllowedOperations
  deliverySaveFileNames?: readonly PageNodeFileName[]
}>

export function isPageDesignDataSetOnlyMode(
  allowedOperations?: PageDesignAllowedOperations,
): boolean {
  if (allowedOperations === undefined) return false
  return allowedOperations.dataSet === true
    && allowedOperations.nodeTree === false
    && allowedOperations.script === false
    && allowedOperations.style === false
    && allowedOperations.navigation === false
}

const pageDesignRunContexts = new Map<string, PageDesignRunContext>()

export function bindPageDesignRunContext(pageId: string, context: PageDesignRunContext): void {
  const normalized = pageId.trim()
  if (normalized.length === 0) {
    throw new Error('pageDesign run context requires a non-empty pageId.')
  }
  pageDesignRunContexts.set(normalized, context)
}

export function clearPageDesignRunContext(pageId: string): void {
  pageDesignRunContexts.delete(pageId.trim())
}

export function readPageDesignRunContext(pageId: string): PageDesignRunContext | undefined {
  return pageDesignRunContexts.get(pageId.trim())
}

export function bindPageDesignRunContextFromHostArgs(
  pageId: string,
  args: Record<string, unknown>,
): void {
  const patch = readPageDesignRunContextFromHostArgs(args)
  if (patch === undefined) return
  const existing = readPageDesignRunContext(pageId)
  bindPageDesignRunContext(pageId, {
    ...(existing ?? {}),
    ...patch,
  })
}

function readPageDesignRunContextFromHostArgs(
  args: Record<string, unknown>,
): PageDesignRunContext | undefined {
  const allowedOperations = readAllowedOperationsFromHostArgs(args)
  const deliverySaveFileNames = readDeliverySaveFileNamesFromHostArgs(args)
  if (allowedOperations === undefined && deliverySaveFileNames === undefined) return undefined
  return {
    ...(allowedOperations === undefined ? {} : { allowedOperations }),
    ...(deliverySaveFileNames === undefined ? {} : { deliverySaveFileNames }),
  }
}

function readAllowedOperationsFromHostArgs(
  args: Record<string, unknown>,
): PageDesignAllowedOperations | undefined {
  const value = args['allowedOperations']
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const allowedOperations: {
    -readonly [K in keyof PageDesignAllowedOperations]?: boolean
  } = {}
  let hasExplicitField = false
  for (const key of ['nodeTree', 'dataSet', 'script', 'style', 'navigation'] as const) {
    const field = record[key]
    if (typeof field !== 'boolean') continue
    hasExplicitField = true
    allowedOperations[key] = field
  }
  return hasExplicitField ? allowedOperations : undefined
}

function readDeliverySaveFileNamesFromHostArgs(
  args: Record<string, unknown>,
): readonly PageNodeFileName[] | undefined {
  const value = args['deliverySaveFileNames']
  if (!Array.isArray(value)) return undefined
  const names = value.filter((item): item is PageNodeFileName => typeof item === 'string')
  return names.length > 0 ? names : undefined
}

/** Page Design Run Mode 的语义模型。 */
export type PageDesignRunMode = 'create' | 'update' | 'fix'

/** Page Design Impl Gate 的语义模型。 */
export type PageDesignImplGate = 'closed' | 'open'

/** Page Design Gate State 的运行状态。 */
export type PageDesignGateState = Readonly<{
  pageId: string
  /** effectiveDescription 非空即视为策划就绪。 */
  planningReady: boolean
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
  const planningReady = summary.effectiveDescription.trim().length > 0
  const implGate = readImplGate(summary, options.strictImplGate === true)
  const upstreamContractsSatisfied = readUpstreamContractsSatisfied(summary)

  return {
    pageId: summary.pageId,
    planningReady,
    implGate,
    upstreamContractsSatisfied,
  }
}

export function validatePageDesignRunGate(
  state: PageDesignGateState,
  _mode: PageDesignRunMode = 'update',
): PageDesignGateValidationResult {
  if (!state.planningReady) {
    return {
      ok: false,
      code: 'PLANNING_DRAFT',
      reason: `page "${state.pageId}" effectiveDescription 为空，策划尚未定稿。`,
      fix: '补全 navigation description / descriptionContext，使 effectiveDescription 非空后再运行 pageDesign。',
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

const OPERATION_FALSE_SCRIPT_MARKERS = {
  nodeTree: ['editNodeTree', 'getNodeTree'],
  dataSet: ['editDataSet', 'getDataSetTool'],
  script: ['setFileText', 'getFileText', 'writePageFile'],
  style: ['setFileText', 'getFileText', 'writePageFile'],
  navigation: [
    'replaceNavigationChildren',
    'readNavigationPlanningInputs',
    'readProjectPlanningInput',
  ],
} as const satisfies Record<keyof PageDesignAllowedOperations, readonly string[]>

/** Evaluate Page Design Mutation Tool Gate Options 的调用配置。 */
export type EvaluatePageDesignMutationToolGateOptions = Readonly<{
  toolName: string
  summary: ProjectPageNodeSummary
  mode?: PageDesignRunMode
  gateOptions?: ReadPageDesignGateStateOptions
  allowedOperations?: PageDesignAllowedOperations
  toolArgs?: AiJsonParams
}>

export function evaluatePageDesignMutationToolGate(
  options: EvaluatePageDesignMutationToolGateOptions,
): PageDesignGateValidationResult {
  if (!isPageDesignMutationTool(options.toolName)) {
    return { ok: true }
  }
  const state = readPageDesignGateState(options.summary, options.gateOptions)
  const runGate = validatePageDesignRunGate(state, options.mode ?? 'update')
  if (!runGate.ok) return runGate
  return evaluatePageDesignScriptOperationGate({
    toolName: options.toolName,
    ...(options.toolArgs === undefined ? {} : { args: options.toolArgs }),
    ...(options.allowedOperations === undefined ? {} : { allowedOperations: options.allowedOperations }),
  })
}

/** Evaluate Page Design Script Operation Gate Options 的调用配置。 */
export type EvaluatePageDesignScriptOperationGateOptions = Readonly<{
  toolName: string
  args?: AiJsonParams
  allowedOperations?: PageDesignAllowedOperations
}>

export function evaluatePageDesignScriptOperationGate(
  options: EvaluatePageDesignScriptOperationGateOptions,
): PageDesignGateValidationResult {
  if (options.allowedOperations === undefined) {
    return { ok: true }
  }
  if (normalizeToolName(options.toolName) !== 'model_script') {
    return { ok: true }
  }
  const script = readModelScriptBody(options.args)
  if (script === undefined) {
    return { ok: true }
  }
  const marker = findForbiddenScriptMarker(script, options.allowedOperations)
  if (marker === undefined) {
    return { ok: true }
  }
  return {
    ok: false,
    reason: `pageDesign: model_script 禁止调用 ${marker}；当前 allowedOperations 未放行该操作域。`,
    fix: '调整 allowedOperations，或改写 script 只调用已放行的 API（如 editDataSet / editNodeTree）。',
  }
}

export function isPageDesignMutationTool(toolName: string): boolean {
  return MUTATION_TOOL_NAMES.has(normalizeToolName(toolName))
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

function readModelScriptBody(args: AiJsonParams | undefined): string | undefined {
  if (args === undefined) return undefined
  const script = args['script']
  if (typeof script !== 'string') return undefined
  const trimmed = script.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function findForbiddenScriptMarker(
  script: string,
  allowedOperations: PageDesignAllowedOperations,
): string | undefined {
  for (const operation of Object.keys(OPERATION_FALSE_SCRIPT_MARKERS) as Array<keyof PageDesignAllowedOperations>) {
    if (allowedOperations[operation] !== false) continue
    for (const marker of OPERATION_FALSE_SCRIPT_MARKERS[operation]) {
      if (script.includes(marker)) return marker
    }
  }
  return undefined
}

function normalizeToolName(toolName: string): string {
  return toolName.trim().toLowerCase().replace(/[^a-z0-9_]/gu, '')
}

function formatPageDesignGateFailure(result: PageDesignGateValidationResult): string {
  const reason = result.reason ?? 'pageDesign gate rejected.'
  const fix = result.fix === undefined ? '' : ` ${result.fix}`
  return `${reason}${fix}`
}
