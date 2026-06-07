/**
 * FC 失败反推 enricher：把 tool result 的 code/msg/fix 反查到 VCM 指南与目录步骤，
 * 以 RECOVERY_HINT checks 回灌 LLM，形成 FC → 错误 → guide → catalog 闭环。
 */
import type { AiJsonParams } from '../../json'
import { parseAiModulePath } from '../../modules'
import { PROTOCOL_TOOL_NAMES } from '../../modules/internal/protocol-tool-generator'
import type { AiModuleRuntime } from '../../modules/runtime/ai-module-runtime'
import type {
  AiAgentFunctionCallCheck,
  AiAgentFunctionCallFailure,
  AiAgentFunctionCallResult,
} from '../session/session-types'

const PROTOCOL_TOOL_NAME_SET = new Set<string>(Object.values(PROTOCOL_TOOL_NAMES))

const GLOBAL_ERROR_RECOVERY: Readonly<Record<string, readonly string[]>> = {
  FUNCTION_NOT_DECLARED: [
    '目录恢复：module_query({ kind: "<kind>", includeFunctions: true }) 选择真实 functionName。',
    '契约恢复：module_function_guide({ kind: "<kind>", functionName: "<真实函数名>" }) 读取 paramsSchema / usageRules / failureModes。',
  ],
  ATTRIBUTE_NOT_DECLARED: [
    '目录恢复：module_guide({ kind: "<kind>" }) 查看 attrName 目录。',
    '契约恢复：module_attribute_guide({ kind: "<kind>", attrName: "<真实属性名>" }) 读取 schema 与读写规则。',
  ],
  SCHEMA_VALIDATION_FAILED: [
    '契约恢复：module_function_guide({ kind: "<kind>", functionName: "<functionName>" }) 对照 paramsSchema 与 requiredBeforeCall。',
    '复杂参数恢复：先 queryPayloads / guidePayload，再重试 function call 或 module_script。',
  ],
  SCRIPT_EXECUTION_FAILED: [
    '脚本恢复：module_function_guide({ kind: "<kind>", functionName: "<functionName>" }) 核对 usageRules 与 resultApis。',
    '若写 node-tree，必须先 queryPayloads({ moduleKind: "node-tree", payloadRef: "spark.component" }) 与 guidePayload({ key })',
    'module_script 参数名必须是 script；host.moduleId 不等于 kind 时 this 仍绑定 project 根模块。',
    'openPageDesign 返回 ConfigPageNode 链式对象：用 cp.editNodeTree()/editDataSet()，勿用 cp.call()。',
  ],
  SCRIPT_ACTION_FAILED: [
    '脚本链式调用返回业务失败：按 tool result 原始 code 修正；必要时 module_function_guide 对照 paramsSchema。',
  ],
  INVALID_PATH_PATH_EMPTY: [
    '路径恢复：module_find({ path: "/", childKind: "project", query: { id: "<projectId>" } }) 后再拼接子 path。',
  ],
  PATH_INVALID: [
    '路径恢复：module_find 重新定位父实例；project 根 id 通常是 projectId（如 homepage），不是 pageId。',
  ],
  AI_TOOL_REJECTED_BEFORE_EXECUTION: [
    '策略恢复：检查 implGate / planningStatus / upstreamContractsSatisfied，必要时 human_question。',
  ],
  TOOL_ARGS_INVALID_JSON: [
    '参数恢复：function.arguments 必须是 JSON object 字符串；先 module_function_guide 读取 paramsSchema 再构造 args。',
  ],
  TOOL_ARGS_NOT_OBJECT: [
    '参数恢复：function.arguments 根节点必须是 object；对照 module_function_guide.paramsSchema 重发 tool_calls。',
  ],
  INVALID_TOOL_ARGS: [
    '直接函数形状：{ "path": "/<kind>[<id>]/...", "args": { /* 业务参数 */ } }；勿把 pageId 等摊平在根级。',
    '契约恢复：module_function_guide({ kind: "<kind>", functionName: "<functionName>" }) 对照 paramsSchema 与 requiredBeforeCall。',
  ],
  ROOT_LIST_REQUIRES_FIND: [
    '根路径列举实例：module_find({ path: "/", childKind: "<kind>", query: { id: "<id>" } })，不要用 list 模式。',
    'spark-component 直接用 query: { id: "catalog" }；写 node-tree 时优先 queryPayloads，不必反复 module_find catalog。',
    '目录恢复：module_guide({ kind: "<kind>" }) 确认 kind 是否为根 kind。',
  ],
  DIRECT_CHILD_LIST_NOT_SUPPORTED: [
    '该 kind 仅 guide 目录：用 module_guide / module_function_guide，勿 module_find list。',
  ],
  FUNCTION_NOT_FOUND: [
    '目录恢复：module_query({ kind: "<kind>", includeFunctions: true }) 列出真实 functionName。',
    '勿把 module_find / module_call 等协议工具名当作 functionName。',
  ],
  INVALID_GUIDE_REQUEST: [
    'module_function_guide 需要 { kind, functionName }；functionName 必须是业务函数名。',
  ],
  KIND_NOT_REGISTERED: [
    '目录恢复：module_query({}) 或 module_find({ path: "/" }) 列出已注册 kind；勿猜 kind 名。',
  ],
  PAYLOAD_KEY_NOT_FOUND: [
    '目录恢复：先 queryPayloads({ moduleKind: "node-tree", payloadRef: "spark.component" }) 列出真实 key，再 guidePayload。',
    '禁止猜测 r-input 等 key；必须从 queryPayloads 返回条目选择 configurable key。',
  ],
}

export type EnrichFunctionCallFailureCommand = Readonly<{
  runtime: AiModuleRuntime
  protocolToolName: string
  args: AiJsonParams
  callResult: AiAgentFunctionCallFailure
}>

export function enrichFunctionCallResult(
  command: EnrichFunctionCallFailureCommand,
): AiAgentFunctionCallResult<unknown> {
  const hints = collectRecoveryHints(command)
  if (hints.length === 0) {
    return command.callResult
  }
  const recoveryChecks = hints.map(toRecoveryCheck)
  const matchedFix = pickFailureModeFix(command)
  return {
    ...command.callResult,
    fix: matchedFix ?? appendGuideLookupToFix(command.callResult.fix, command),
    checks: mergeChecks(command.callResult.checks, recoveryChecks),
  }
}

function collectRecoveryHints(command: EnrichFunctionCallFailureCommand): readonly string[] {
  const context = resolveFailedFunctionContext(command)
  const hints: string[] = []

  appendGuideRecoveryHints(hints, command, context)
  appendProtocolRecoveryHints(hints, command)
  appendGlobalRecoveryHints(hints, command.callResult.code, context)
  appendPayloadRecoveryHints(hints, command, context)

  return uniqueHints(hints)
}

function appendGuideRecoveryHints(
  hints: string[],
  command: EnrichFunctionCallFailureCommand,
  context: FailedFunctionContext,
): void {
  if (context.kind === undefined || context.functionName === undefined) return
  const guide = command.runtime.guideKnowledgeFunction({
    kind: context.kind,
    functionName: context.functionName,
  })
  if (!guide.ok || guide.data === undefined) return

  hints.push(`指南恢复：module_function_guide({ kind: "${context.kind}", functionName: "${context.functionName}" })`)
  hints.push(`目录恢复：${guide.data.directoryLookupStep}`)
  for (const step of guide.data.functionLookupSteps) {
    hints.push(`目录步骤：${step}`)
  }
  for (const recoveryHint of guide.data.recoveryHints) {
    hints.push(recoveryHint)
  }
  const matchedMode = guide.data.failureModes.find(mode => mode.code === command.callResult.code)
  if (matchedMode !== undefined) {
    hints.push(`VCM failureMode(${matchedMode.code})：${matchedMode.fix}`)
  }
}

function appendProtocolRecoveryHints(
  hints: string[],
  command: EnrichFunctionCallFailureCommand,
): void {
  const toolName = command.protocolToolName
  const code = command.callResult.code
  if (toolName === PROTOCOL_TOOL_NAMES.moduleFunctionGuide) {
    const fn = readStringArg(command.args, 'functionName')
    if (fn !== undefined && PROTOCOL_TOOL_NAME_SET.has(fn)) {
      hints.push(`"${fn}" 是协议工具名，不是 functionName；请 module_query({ includeFunctions: true }) 选择业务函数。`)
    }
    if (code === 'FUNCTION_NOT_FOUND') {
      hints.push('functionName 必须是 project.openPageDesign 等业务函数，不能是 module_find / module_script 等协议工具。')
    }
    return
  }
  if (code === 'PAYLOAD_KEY_NOT_FOUND') {
    hints.push('PAYLOAD_KEY_NOT_FOUND：先 queryPayloads 列出真实 key，勿猜测组件 type。')
  }
  if (code === 'SCHEMA_VALIDATION_FAILED' && (toolName === 'guidePayload' || toolName === 'queryPayloads')) {
    hints.push(`${toolName} 必填 args.key（可先 queryPayloads）；type/payloadKey/componentType 会归一化为 key。`)
    hints.push('形状：guidePayload({ path: "/spark-component[catalog]", args: { key: "<来自queryPayloads>", moduleKind: "node-tree", payloadRef: "spark.component" } })')
  }
  if (code === 'SCRIPT_EXECUTION_FAILED' && toolName === PROTOCOL_TOOL_NAMES.moduleScript) {
    if (command.callResult.msg.includes('toJSON')) {
      hints.push('脚本勿调 toJSON；用 openPageDesign → editDataSet/editNodeTree mutator 链式 API。')
    }
    if (command.callResult.msg.includes('.call is not a function')) {
      hints.push('ConfigPageNode 无 call()；改用 page.editNodeTree(async tree => ...) / page.editDataSet(async ds => ...)。')
    }
    if (command.callResult.msg.includes('editDataSet is not a function')
      || command.callResult.msg.includes('editNodeTree is not a function')) {
      hints.push('module_script 必须先 await this.openPageDesign({ pageId }) 得到 page，再 await page.editDataSet(async ds => ...)。')
    }
    if (command.callResult.msg.includes("reading 'includes'")) {
      hints.push('createTable 签名：createTable({ tableName: "<TableName>", columns: [{ name, type, label }] })；勿用 positional 参数。')
      hints.push('先 editDataSet 建表与 default 视图 currentRow，再 editNodeTree 用 guidePayload 返回的 type 绑表单。')
    }
    if (command.callResult.msg.includes('run is not a function')) {
      hints.push('editDataSet/editNodeTree 必须直接传函数：page.editDataSet(async ds => ...)；勿把 createTable 参数对象当成 run。')
    }
  }
  if (code !== 'INVALID_TOOL_ARGS' && code !== 'ROOT_LIST_REQUIRES_FIND') return
  if (toolName === PROTOCOL_TOOL_NAMES.moduleFind) {
    hints.push('module_find 形状：{ path: "/", childKind: "<kind>", query: { id: "<id>" } }；根查找可省略 path（默认 "/"）。')
    hints.push('spark-component 缺 query 时会归一化为 { id: "catalog" }；catalog 查询请直接用 queryPayloads。')
    return
  }
  if (toolName === PROTOCOL_TOOL_NAMES.moduleScript) {
    hints.push('module_script 形状：{ script: "<js body>" }；code 字段会归一化为 script。')
    return
  }
  if (toolName === 'queryPayloads' || toolName === 'guidePayload') {
    hints.push(`${toolName} 形状：{ path: "/spark-component[catalog]", args: { ... } }；扁平业务字段会归一化进 args。`)
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

function appendPayloadRecoveryHints(
  hints: string[],
  command: EnrichFunctionCallFailureCommand,
  context: FailedFunctionContext,
): void {
  if (command.callResult.code !== 'SCHEMA_VALIDATION_FAILED'
    && command.callResult.code !== 'SCRIPT_EXECUTION_FAILED') {
    return
  }
  const catalogTool = command.protocolToolName === 'guidePayload' || command.protocolToolName === 'queryPayloads'
  if (catalogTool) {
    hints.push('Payload 目录：先 queryPayloads({ moduleKind: "node-tree", payloadRef: "spark.component" })，再 guidePayload({ key })')
  }
  if (context.kind === undefined || context.functionName === undefined) return
  const summaries = command.runtime.queryKnowledgeFunctions({
    kind: context.kind,
    keyword: context.functionName,
  })
  const summary = summaries.find(item => item.functionName === context.functionName)
  if (summary?.requiresPayloadGuide !== true) return
  for (const step of summary.payloadLookupSteps) {
    hints.push(`Payload 目录：${step}`)
  }
}

function pickFailureModeFix(command: EnrichFunctionCallFailureCommand): string | undefined {
  const context = resolveFailedFunctionContext(command)
  if (context.kind === undefined || context.functionName === undefined) return undefined
  const guide = command.runtime.guideKnowledgeFunction({
    kind: context.kind,
    functionName: context.functionName,
  })
  if (!guide.ok || guide.data === undefined) return undefined
  const matchedMode = guide.data.failureModes.find(mode => mode.code === command.callResult.code)
  return matchedMode?.fix
}

function resolveFailedFunctionContext(
  command: EnrichFunctionCallFailureCommand,
): FailedFunctionContext {
  const { protocolToolName, args, runtime } = command
  if (protocolToolName === PROTOCOL_TOOL_NAMES.moduleCall) {
    const functionName = readStringArg(args, 'functionName')
    const path = readStringArg(args, 'path')
    return buildFailedFunctionContext({
      functionName,
      kind: kindFromPath(path) ?? findKindByFunctionName(runtime, functionName),
    })
  }
  if (protocolToolName === PROTOCOL_TOOL_NAMES.moduleScript) {
    const path = readStringArg(args, 'path')
    return buildFailedFunctionContext({ kind: kindFromPath(path) })
  }
  if (protocolToolName === PROTOCOL_TOOL_NAMES.moduleFind) {
    const childKind = readStringArg(args, 'childKind')
    return buildFailedFunctionContext({ kind: childKind })
  }
  if (protocolToolName === PROTOCOL_TOOL_NAMES.moduleFunctionGuide) {
    return buildFailedFunctionContext({
      kind: readStringArg(args, 'kind'),
      functionName: readStringArg(args, 'functionName'),
    })
  }
  if (PROTOCOL_TOOL_NAME_SET.has(protocolToolName)) {
    return {}
  }
  return buildFailedFunctionContext({
    functionName: protocolToolName,
    kind: findKindByFunctionName(runtime, protocolToolName),
  })
}

function buildFailedFunctionContext(
  input: Readonly<{ kind?: string | undefined; functionName?: string | undefined }>,
): FailedFunctionContext {
  return {
    ...(input.kind === undefined ? {} : { kind: input.kind }),
    ...(input.functionName === undefined ? {} : { functionName: input.functionName }),
  }
}

type FailedFunctionContext = Readonly<{
  kind?: string
  functionName?: string
}>

function findKindByFunctionName(runtime: AiModuleRuntime, functionName: string | undefined): string | undefined {
  if (functionName === undefined || functionName.trim().length === 0) return undefined
  const matches = runtime.queryKnowledgeFunctions({ keyword: functionName })
  const exact = matches.find(item => item.functionName === functionName)
  return exact?.kind
}

function kindFromPath(path: string | undefined): string | undefined {
  if (path === undefined || path.trim().length === 0) return undefined
  try {
    const segments = parseAiModulePath(path)
    if (segments.length === 0) return undefined
    return segments[segments.length - 1]?.kind
  } catch {
    return undefined
  }
}

function readStringArg(args: AiJsonParams, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function substituteRecoveryTemplate(template: string, context: FailedFunctionContext): string {
  return template
    .replaceAll('<kind>', context.kind ?? '<kind>')
    .replaceAll('<functionName>', context.functionName ?? '<functionName>')
}

function appendGuideLookupToFix(
  fix: string,
  command: EnrichFunctionCallFailureCommand,
): string {
  const context = resolveFailedFunctionContext(command)
  if (context.kind === undefined || context.functionName === undefined) return fix
  const lookup = `module_function_guide({ kind: "${context.kind}", functionName: "${context.functionName}" })`
  if (fix.includes('module_function_guide')) return fix
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
