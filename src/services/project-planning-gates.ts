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

const PROJECT_ACTION_NAMES = [
  'readProjectPlanningInput',
  'readNavigationPlanningInputs',
  'replaceNavigationChildren',
] as const

const PROJECT_PARAM_TYPE_NAMES = [
  'ProjectNodeData',
] as const

/** Project Planning Gate Validation Result 的返回结果。 */
export type ProjectPlanningGateValidationResult = Readonly<{
  ok: boolean
  reason?: string
  fix?: string
}>

export function evaluateProjectPlanningToolGate(
  options: Pick<AiAgentBeforeFunctionCallOptions, 'toolName' | 'args'>,
): ProjectPlanningGateValidationResult {
  const toolName = normalizeToolName(options.toolName)
  const actionLookupGate = evaluateProjectActionLookupGate(toolName, options.args)
  if (!actionLookupGate.ok) return actionLookupGate
  if (toolName !== 'model_script') {
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
    reason: `projectPlanning: model_script 禁止调用 ${marker}；本阶段只处理 navigation 策划，不涉及四文件或 openPageDesign。`,
    fix: '改用 readProjectPlanningInput / readNavigationPlanningInputs / replaceNavigationChildren 等通用 ProjectRootModel action；完成概要后 agent_complete。',
  }
}

function evaluateProjectActionLookupGate(
  toolName: string,
  args: AiAgentBeforeFunctionCallOptions['args'],
): ProjectPlanningGateValidationResult {
  if (toolName !== 'model_attribute_guide') return { ok: true }
  const kind = readTextArg(args, 'kind')
  if (kind !== 'project') return { ok: true }
  const attributeName = readTextArg(args, 'attributeName')
  if (attributeName === undefined || !isProjectActionName(attributeName)) {
    if (attributeName !== undefined && isProjectParamTypeName(attributeName)) {
      return {
        ok: false,
        reason: `projectPlanning: ${attributeName} 是参数结构名，不是 project attribute。`,
        fix: '改用 model_action_guide({ kind: "project", actionName: "replaceNavigationChildren" }) 查看 paramsSchema.children，然后在 model_script 中构造 children 数组。',
      }
    }
    return { ok: true }
  }
  return {
    ok: false,
    reason: `projectPlanning: ${attributeName} 是 ProjectRootModel action，不是 attribute。`,
    fix: `改用 model_action_guide({ kind: "project", actionName: "${attributeName}" })，然后在 model_script 中通过 this.${attributeName}(...) 调用。`,
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

function readTextArg(args: AiAgentBeforeFunctionCallOptions['args'], key: string): string | undefined {
  const value = args[key]
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function isProjectActionName(value: string): value is typeof PROJECT_ACTION_NAMES[number] {
  return PROJECT_ACTION_NAMES.some(actionName => actionName === value)
}

function isProjectParamTypeName(value: string): value is typeof PROJECT_PARAM_TYPE_NAMES[number] {
  return PROJECT_PARAM_TYPE_NAMES.some(typeName => typeName === value)
}

function normalizeToolName(toolName: string): string {
  return toolName.trim().toLowerCase().replace(/[^a-z0-9_]/gu, '')
}
