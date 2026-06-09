/**
 * projectPlanning 工具闸门：策划阶段禁止进入 pageDesign 四文件链。
 */
import type { AiAgentBeforeFunctionCallOptions } from '@spark-appworks/spark-ai/agent'

const FORBIDDEN_SCRIPT_MARKERS = [
  'openPageDesign',
  'writePageFile',
  'setFileText',
  'getFileText',
  'editNodeTree',
  'editDataSet',
  'getNodeTree',
  'getDataSetTool',
] as const

export type ProjectPlanningGateValidationResult = Readonly<{
  ok: boolean
  reason?: string
  fix?: string
}>

export function evaluateProjectPlanningToolGate(
  options: Pick<AiAgentBeforeFunctionCallOptions, 'toolName' | 'args'>,
): ProjectPlanningGateValidationResult {
  const toolName = normalizeToolName(options.toolName)
  if (toolName !== 'vcm_script') {
    return { ok: true }
  }
  const script = readVcmScriptBody(options.args)
  if (script === undefined) {
    return { ok: true }
  }
  const marker = findForbiddenScriptMarker(script)
  if (marker === undefined) {
    return { ok: true }
  }
  return {
    ok: false,
    reason: `projectPlanning: vcm_script 禁止调用 ${marker}；本阶段只处理 navigation 策划，不涉及四文件或 openPageDesign。`,
    fix: '改用 readProjectPlanningInput / readNavigationPlanningInputs / applyNavigationNodeEdit 等策划 action；完成概要后 agent_complete。',
  }
}

function readVcmScriptBody(args: AiAgentBeforeFunctionCallOptions['args']): string | undefined {
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
