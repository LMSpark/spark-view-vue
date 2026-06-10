/**
 * FC 失败恢复提示：把 tool result 的 code/msg/fix 映射成 VCM-native
 * 查询、guide 和 vcm_script 重试步骤，回灌给 LLM 形成失败自修复闭环。
 */
import type { AiJsonParams } from '../../json'
import { VCM_NATIVE_TOOL_NAMES } from '../../vcm-native'
import type {
  AiAgentFunctionCallCheck,
  AiAgentFunctionCallFailure,
  AiAgentFunctionCallResult,
} from '../session/session-types'

const VCM_NATIVE_TOOL_NAME_SET = new Set<string>(Object.values(VCM_NATIVE_TOOL_NAMES))

const GLOBAL_ERROR_RECOVERY: Readonly<Record<string, readonly string[]>> = {
  FUNCTION_NOT_DECLARED: [
    '目录恢复：vcm_query({ kind: "<kind>", includeMembers: true }) 选择真实 actionName。',
    '契约恢复：vcm_action_guide({ kind: "<kind>", actionName: "<actionName>" }) 读取 paramsSchema / usageRules / failureModes。',
  ],
  ATTRIBUTE_NOT_DECLARED: [
    '目录恢复：vcm_model_guide({ kind: "<kind>" }) 查看 attributeName 目录。',
    '契约恢复：vcm_attribute_guide({ kind: "<kind>", attributeName: "<attributeName>" }) 读取 schema 与读写规则。',
  ],
  SCHEMA_VALIDATION_FAILED: [
    '契约恢复：vcm_action_guide({ kind: "<kind>", actionName: "<actionName>" }) 对照 paramsSchema 与 requiredBeforeCall。',
    '复杂参数恢复：先 vcm_action_guide/vcm_attribute_guide 对照 schema，再 vcm_script 重试。',
  ],
  SCRIPT_EXECUTION_FAILED: [
    '脚本恢复：vcm_action_guide({ kind: "<kind>", actionName: "<actionName>" }) 核对 usageRules 与 resultApis。',
    'vcm_script 参数名必须是 script；this 绑定当前业务根实例。',
  ],
  SCRIPT_ACTION_FAILED: [
    '脚本链式调用返回业务失败：按 tool result 原始 code 修正；必要时 vcm_action_guide 对照 paramsSchema。',
  ],
  AI_TOOL_REJECTED_BEFORE_EXECUTION: [
    '策略恢复：检查 implGate / planningStatus / upstreamContractsSatisfied，必要时 human_question。',
  ],
  TOOL_ARGS_INVALID_JSON: [
    '参数恢复：function.arguments 必须是 JSON object 字符串；先 vcm_action_guide 读取 paramsSchema 再构造 args。',
  ],
  TOOL_ARGS_NOT_OBJECT: [
    '参数恢复：function.arguments 根节点必须是 object；对照 vcm_action_guide.paramsSchema 重发 tool_calls。',
  ],
  INVALID_VCM_NATIVE_TOOL_ARGS: [
    '契约恢复：严格按当前工具 schema 重发；vcm_action_guide 使用 actionName，vcm_script 使用 script。',
  ],
  INVALID_TOOL_ARGS: [
    '契约恢复：vcm_action_guide({ kind: "<kind>", actionName: "<actionName>" }) 对照 paramsSchema 与 requiredBeforeCall。',
    'vcm_script 形状：{ script: "<js body>" }；参数名必须是 script。',
  ],
  FUNCTION_NOT_FOUND: [
    '目录恢复：vcm_query({ kind: "<kind>", includeMembers: true }) 列出真实 actionName。',
  ],
  INVALID_GUIDE_REQUEST: [
    'vcm_action_guide 需要 { kind, actionName }；actionName 必须是业务 action 名。',
  ],
  KIND_NOT_REGISTERED: [
    '目录恢复：vcm_query({}) 列出已注册 kind；勿猜 kind 名。',
  ],
  UNKNOWN_VCM_NATIVE_TOOL: [
    '工具恢复：只允许 vcm_query / vcm_model_guide / vcm_attribute_guide / vcm_action_guide / vcm_script / human_question / agent_complete。',
  ],
}

export type EnrichFunctionCallFailureCommand = Readonly<{
  protocolToolName: string
  args: AiJsonParams
  callResult: AiAgentFunctionCallFailure
  /** 当前业务实例 ID；app 层 recovery hook 可用来插值实例级提示。 */
  moduleInstanceId?: string
}>

export type EnrichFunctionCallResultOptions = Readonly<{
  enrichRecoveryHints?: (command: EnrichFunctionCallFailureCommand) => readonly string[]
}>

export function enrichFunctionCallResult(
  command: EnrichFunctionCallFailureCommand,
  options: EnrichFunctionCallResultOptions = {},
): AiAgentFunctionCallResult<unknown> {
  const hints = collectRecoveryHints(command, options)
  if (hints.length === 0) return command.callResult
  return {
    ...command.callResult,
    fix: appendGuideLookupToFix(command.callResult.fix, command),
    checks: mergeChecks(command.callResult.checks, hints.map(toRecoveryCheck)),
  }
}

function collectRecoveryHints(
  command: EnrichFunctionCallFailureCommand,
  options: EnrichFunctionCallResultOptions,
): readonly string[] {
  const context = resolveFailedFunctionContext(command)
  const hints: string[] = []

  appendProtocolRecoveryHints(hints, command)
  appendGlobalRecoveryHints(hints, command.callResult.code, context)
  appendBusinessRecoveryHints(hints, command, options.enrichRecoveryHints)

  return uniqueHints(hints)
}

function appendBusinessRecoveryHints(
  hints: string[],
  command: EnrichFunctionCallFailureCommand,
  enrichRecoveryHints: EnrichFunctionCallResultOptions['enrichRecoveryHints'],
): void {
  if (enrichRecoveryHints === undefined) return
  for (const hint of enrichRecoveryHints(command)) {
    hints.push(hint)
  }
}

function appendProtocolRecoveryHints(
  hints: string[],
  command: EnrichFunctionCallFailureCommand,
): void {
  const toolName = command.protocolToolName
  const code = command.callResult.code

  if (toolName === VCM_NATIVE_TOOL_NAMES.actionGuide) {
    const actionName = readStringArg(command.args, 'actionName')
    if (actionName !== undefined && VCM_NATIVE_TOOL_NAME_SET.has(actionName)) {
      hints.push(`"${actionName}" 是协议工具名，不是 actionName；请 vcm_query({ includeMembers: true }) 选择业务 action。`)
    }
    if (code === 'FUNCTION_NOT_FOUND') {
      hints.push('actionName 必须是业务 action（如 "<actionName>"），不能是 vcm_script 等协议工具。')
    }
    return
  }

  if (code === 'INVALID_VCM_NATIVE_TOOL_ARGS' && toolName === VCM_NATIVE_TOOL_NAMES.script) {
    hints.push('vcm_script 形状：{ script: "<js body>" }；不再接受 code/javascript/path 等旧字段。')
  }
}

function appendGlobalRecoveryHints(
  hints: string[],
  code: string,
  context: FailedFunctionContext,
): void {
  const templates = GLOBAL_ERROR_RECOVERY[code]
  if (templates === undefined) return
  for (const template of templates) {
    hints.push(substituteRecoveryTemplate(template, context))
  }
}

function resolveFailedFunctionContext(
  command: EnrichFunctionCallFailureCommand,
): FailedFunctionContext {
  if (command.protocolToolName === VCM_NATIVE_TOOL_NAMES.actionGuide) {
    const kind = readStringArg(command.args, 'kind')
    const actionName = readStringArg(command.args, 'actionName')
    return buildFailedFunctionContext({
      ...(kind === undefined ? {} : { kind }),
      ...(actionName === undefined ? {} : { actionName }),
    })
  }
  return {}
}

function buildFailedFunctionContext(
  input: Readonly<{
    kind?: string
    actionName?: string
    attributeName?: string
  }>,
): FailedFunctionContext {
  return {
    ...(input.kind === undefined ? {} : { kind: input.kind }),
    ...(input.actionName === undefined ? {} : { actionName: input.actionName }),
    ...(input.attributeName === undefined ? {} : { attributeName: input.attributeName }),
  }
}

type FailedFunctionContext = Readonly<{
  kind?: string
  actionName?: string
  attributeName?: string
}>

function readStringArg(args: AiJsonParams, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function substituteRecoveryTemplate(template: string, context: FailedFunctionContext): string {
  return template
    .replaceAll('<kind>', context.kind ?? '<kind>')
    .replaceAll('<actionName>', context.actionName ?? '<actionName>')
    .replaceAll('<attributeName>', context.attributeName ?? '<attributeName>')
}

function appendGuideLookupToFix(
  fix: string,
  command: EnrichFunctionCallFailureCommand,
): string {
  const context = resolveFailedFunctionContext(command)
  if (context.kind === undefined || context.actionName === undefined) return fix
  const lookup = `vcm_action_guide({ kind: "${context.kind}", actionName: "${context.actionName}" })`
  if (fix.includes('vcm_action_guide')) return fix
  return `${fix} 反查指南：${lookup}。`
}

function toRecoveryCheck(hint: string): AiAgentFunctionCallCheck {
  return {
    level: 'info',
    code: 'RECOVERY_HINT',
    message: hint,
    hint,
  }
}

function mergeChecks(
  existing: readonly AiAgentFunctionCallCheck[] | undefined,
  recoveryChecks: readonly AiAgentFunctionCallCheck[],
): readonly AiAgentFunctionCallCheck[] {
  const merged = [...(existing ?? [])]
  const seen = new Set(merged.map(check => check.message))
  for (const check of recoveryChecks) {
    if (seen.has(check.message)) continue
    seen.add(check.message)
    merged.push(check)
  }
  return merged
}

function uniqueHints(values: readonly string[]): readonly string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const normalized = value.trim()
    if (normalized.length === 0 || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}
