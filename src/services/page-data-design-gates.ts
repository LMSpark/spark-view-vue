/**
 * @module app:services/page-data-design-gates
 * 职责：pageDataDesign 工具闸门，只允许 DataSet / pagedata.json 变更，禁止 nodeTree / rule / script / style。
 * 边界：只校验 mutation tool 与 model_script 内容，不执行 AI 会话或落盘。
 * AI用途：排查 pageDataDesign 为何拒绝 editNodeTree 或四文件写入时，用本模块定位脚本级门禁。
 */
import type { AiAgentBeforeFunctionCallOptions } from '@spark-appworks/spark-ai/agent'
import type { ProjectPageNodeSummary } from '@spark-appworks/spark-project-model'
import {
  evaluatePageDesignMutationToolGate,
  type PageDesignGateValidationResult,
  type PageDesignRunMode,
  validatePageDesignRunGate,
  readPageDesignGateState,
} from '@/services/page-design-gates'

const FORBIDDEN_SCRIPT_MARKERS = [
  'editNodeTree',
  'getNodeTree',
  'setFileText',
  'getFileText',
  'writePageFile',
] as const

/** Evaluate Page Data Design Tool Gate Options 的调用配置。 */
export type EvaluatePageDataDesignToolGateOptions = Readonly<{
  toolName: string
  args: AiAgentBeforeFunctionCallOptions['args']
  summary: ProjectPageNodeSummary
  mode?: PageDesignRunMode
}>

export function evaluatePageDataDesignToolGate(
  options: EvaluatePageDataDesignToolGateOptions,
): PageDesignGateValidationResult {
  const runGate = evaluatePageDesignMutationToolGate({
    toolName: options.toolName,
    summary: options.summary,
    ...(options.mode === undefined ? {} : { mode: options.mode }),
  })
  if (!runGate.ok) return runGate

  const toolName = normalizeToolName(options.toolName)
  if (toolName !== 'model_script') {
    return { ok: true }
  }
  const script = readModelScriptBody(options.args)
  if (script === undefined) {
    return { ok: true }
  }
  const marker = findForbiddenScriptMarker(script)
  if (marker === undefined) {
    return { ok: true }
  }
  return {
    ok: false,
    reason: `pageDataDesign: model_script 禁止调用 ${marker}；本能力只处理 pagedata.json / editDataSet。`,
    fix: '通过 await this.openPageDesign({ pageId }).editDataSet(tool => …) 修改 DataSet；不要 editNodeTree 或直接读写 rule/script/style。',
  }
}

export function validatePageDataDesignRunGate(
  summary: ProjectPageNodeSummary,
  mode: PageDesignRunMode = 'update',
): PageDesignGateValidationResult {
  const state = readPageDesignGateState(summary)
  return validatePageDesignRunGate(state, mode)
}

function readModelScriptBody(args: AiAgentBeforeFunctionCallOptions['args']): string | undefined {
  const script = args['script']
  if (typeof script !== 'string') return undefined
  const trimmed = script.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function findForbiddenScriptMarker(script: string): string | undefined {
  for (const marker of FORBIDDEN_SCRIPT_MARKERS) {
    if (script.includes(marker)) return marker
  }
  return undefined
}

function normalizeToolName(toolName: string): string {
  return toolName.trim().toLowerCase().replace(/[^a-z0-9_]/gu, '')
}
