import type { AiModule } from '../protocol'
import { isProtocolToolName } from '../internal/protocol-tool-generator'

export type AiModuleRuntimeInspectStatus = 'ok' | 'warning' | 'error'

export type AiModuleRuntimeInspectLevel = 'error' | 'warn' | 'info'

export type AiModuleRuntimeInspectFinding = Readonly<{
  level: AiModuleRuntimeInspectLevel
  code: string
  message: string
  kind?: string
  functionName?: string
  childKind?: string
  payloadRef?: string
  fix?: string
}>

export type AiModuleRuntimeInspectModule = Readonly<{
  kind: string
  name: string
  status: AiModuleRuntimeInspectStatus
  parentKind?: string
  attributeCount: number
  functionCount: number
  payloadCount: number
  children: readonly string[]
}>

export type AiModuleRuntimeInspectReport = Readonly<{
  ok: boolean
  status: AiModuleRuntimeInspectStatus
  moduleCount: number
  rootKinds: readonly string[]
  modules: readonly AiModuleRuntimeInspectModule[]
  findings: readonly AiModuleRuntimeInspectFinding[]
  errorCount: number
  warningCount: number
}>

const PAYLOAD_QUERY_FUNCTION_NAME = 'queryPayloads'
const PAYLOAD_GUIDE_FUNCTION_NAME = 'guidePayload'

const HIGH_RISK_FUNCTION_PATTERN = /archive|cancel|clear|close|delete|destroy|drop|remove|replace|reset|set|submit|update|write/iu
const OPENAI_FUNCTION_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export function inspectAiModuleRuntime(modules: readonly AiModule[]): AiModuleRuntimeInspectReport {
  const byKind = new Map(modules.map((moduleKind) => [moduleKind.kind, moduleKind]))
  const findings: AiModuleRuntimeInspectFinding[] = []
  const rootKinds = modules
    .filter((moduleKind) => moduleKind.parentKind === undefined)
    .map((moduleKind) => moduleKind.kind)

  if (modules.length === 0) {
    findings.push({
      level: 'error',
      code: 'NO_MODULES_REGISTERED',
      message: 'AiModuleRuntime 未注册任何 AiModule。',
      fix: '创建至少一个根 AiModule，并通过 runtime.register(module) 注册。',
    })
  } else if (rootKinds.length === 0) {
    findings.push({
      level: 'error',
      code: 'NO_ROOT_MODULE',
      message: 'AiModuleRuntime 没有根模块。',
      fix: '至少注册一个 parentKind 为空的根 AiModule，供 module_find({ path: "/" }) 发现。',
    })
  }

  const hasPayloadCatalog = modules.some((moduleKind) =>
    moduleKind.functions.some((fn) => fn.name === PAYLOAD_QUERY_FUNCTION_NAME)
    && moduleKind.functions.some((fn) => fn.name === PAYLOAD_GUIDE_FUNCTION_NAME),
  )

  for (const moduleKind of modules) {
    inspectParentRelation(moduleKind, byKind, findings)
    inspectChildren(moduleKind, byKind, findings)
    inspectFunctions(moduleKind, findings)
    inspectPayloads(moduleKind, hasPayloadCatalog, findings)
  }
  inspectDirectFunctionTools(modules, findings)

  const errorCount = findings.filter((finding) => finding.level === 'error').length
  const warningCount = findings.filter((finding) => finding.level === 'warn').length
  const status = errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'ok'
  return {
    ok: errorCount === 0,
    status,
    moduleCount: modules.length,
    rootKinds,
    modules: modules.map((moduleKind) => ({
      kind: moduleKind.kind,
      name: moduleKind.name,
      status: statusForKind(moduleKind.kind, findings),
      ...(moduleKind.parentKind === undefined ? {} : { parentKind: moduleKind.parentKind }),
      attributeCount: moduleKind.attributes.length,
      functionCount: moduleKind.functions.length,
      payloadCount: moduleKind.payloads.length,
      children: [...moduleKind.children],
    })),
    findings,
    errorCount,
    warningCount,
  }
}

function inspectDirectFunctionTools(
  modules: readonly AiModule[],
  findings: AiModuleRuntimeInspectFinding[],
): void {
  const directNameUsages = new Map<string, Array<Readonly<{ kind: string }>>>()
  for (const moduleKind of modules) {
    for (const fn of moduleKind.functions) {
      if (isProtocolToolName(fn.name)) {
        findings.push({
          level: 'info',
          code: 'DIRECT_FUNCTION_TOOL_NAME_RESERVED',
          kind: moduleKind.kind,
          functionName: fn.name,
          message: `函数 "${moduleKind.kind}.${fn.name}" 与 spark-ai 协议工具同名，不会生成 OpenAI direct business tool。`,
          fix: '如需直连 OpenAI functionName({ path, args })，请改成非 module_* / human_question / agent_complete 的唯一业务动作名；否则继续使用 module_call 兼容路由。',
        })
        continue
      }
      if (!OPENAI_FUNCTION_NAME_PATTERN.test(fn.name)) {
        findings.push({
          level: 'info',
          code: 'DIRECT_FUNCTION_TOOL_NAME_INVALID',
          kind: moduleKind.kind,
          functionName: fn.name,
          message: `函数 "${moduleKind.kind}.${fn.name}" 不符合 OpenAI function name 规则，不会生成 direct business tool。`,
          fix: '函数名需匹配 /^[A-Za-z0-9_-]{1,64}$/；否则继续使用 module_call 兼容路由。',
        })
        continue
      }
      directNameUsages.set(fn.name, [
        ...(directNameUsages.get(fn.name) ?? []),
        { kind: moduleKind.kind },
      ])
    }
  }

  for (const [functionName, usages] of directNameUsages.entries()) {
    if (usages.length <= 1) continue
    const locations = usages.map((usage) => `${usage.kind}.${functionName}`).join(', ')
    for (const usage of usages) {
      findings.push({
        level: 'info',
        code: 'DIRECT_FUNCTION_TOOL_NAME_CONFLICT',
        kind: usage.kind,
        functionName,
        message: `业务函数名 "${functionName}" 在 runtime 中不唯一，OpenAI direct business tool 不会生成。冲突位置：${locations}。`,
        fix: '为需要直连的业务函数使用唯一动作名；保留重名时仍可通过 module_call({ path, functionName, args }) 调用。',
      })
    }
  }
}

function inspectParentRelation(
  moduleKind: AiModule,
  byKind: ReadonlyMap<string, AiModule>,
  findings: AiModuleRuntimeInspectFinding[],
): void {
  const parentKind = moduleKind.parentKind
  if (parentKind === undefined) return
  const parent = byKind.get(parentKind)
  if (parent === undefined) {
    findings.push({
      level: 'error',
      code: 'PARENT_KIND_NOT_REGISTERED',
      kind: moduleKind.kind,
      childKind: moduleKind.kind,
      message: `kind "${moduleKind.kind}" 声明了 parentKind "${parentKind}"，但父 kind 未注册。`,
      fix: `先注册父 AiModule "${parentKind}"，或修正 "${moduleKind.kind}" 的 parentKind。`,
    })
    return
  }
  if (!parent.children.includes(moduleKind.kind)) {
    findings.push({
      level: 'error',
      code: 'PARENT_MISSING_CHILD_DECLARATION',
      kind: parent.kind,
      childKind: moduleKind.kind,
      message: `kind "${moduleKind.kind}" 声明父 kind 为 "${parent.kind}"，但父模块 children 未声明该子 kind。`,
      fix: `在 "${parent.kind}" 的 children 中加入 "${moduleKind.kind}"。`,
    })
  }
}

function inspectChildren(
  moduleKind: AiModule,
  byKind: ReadonlyMap<string, AiModule>,
  findings: AiModuleRuntimeInspectFinding[],
): void {
  for (const childKind of moduleKind.children) {
    const child = byKind.get(childKind)
    if (child === undefined) {
      findings.push({
        level: 'error',
        code: 'CHILD_KIND_NOT_REGISTERED',
        kind: moduleKind.kind,
        childKind,
        message: `kind "${moduleKind.kind}" 声明了 child kind "${childKind}"，但该子模块未注册。`,
        fix: `创建并注册 kind="${childKind}" 的 AiModule，或从 "${moduleKind.kind}".children 中移除该声明。`,
      })
      continue
    }
    if (child.parentKind !== moduleKind.kind) {
      findings.push({
        level: 'error',
        code: 'CHILD_PARENT_KIND_MISMATCH',
        kind: moduleKind.kind,
        childKind,
        message: `父模块 "${moduleKind.kind}" 声明子 kind "${childKind}"，但子模块 parentKind 是 "${child.parentKind ?? 'root'}"。`,
        fix: `把 "${childKind}" 的 parentKind 改为 "${moduleKind.kind}"，或修正父模块 children。`,
      })
    }
  }
}

function inspectFunctions(moduleKind: AiModule, findings: AiModuleRuntimeInspectFinding[]): void {
  for (const fn of moduleKind.functions) {
    if (!isObjectParamsSchema(fn.paramsSchema)) {
      findings.push({
        level: 'error',
        code: 'FUNCTION_PARAMS_SCHEMA_NOT_OBJECT',
        kind: moduleKind.kind,
        functionName: fn.name,
        message: `函数 "${moduleKind.kind}.${fn.name}" 的 paramsSchema 不是 type=object 的 JSON Schema 根。`,
        fix: '使用 paramsSchema(...) 或 noParamsSchema(...) 创建函数参数 schema。',
      })
    }
    if (!isHighRiskFunction(fn.name)) continue
    if ((fn.usageRules ?? []).length === 0) {
      findings.push({
        level: 'warn',
        code: 'HIGH_RISK_FUNCTION_WITHOUT_USAGE_RULES',
        kind: moduleKind.kind,
        functionName: fn.name,
        message: `高风险函数 "${moduleKind.kind}.${fn.name}" 未声明 usageRules。`,
        fix: '为会写入、提交、删除、关闭或替换状态的函数补充调用前置规则。',
      })
    }
    if ((fn.failureModes ?? []).length === 0) {
      findings.push({
        level: 'warn',
        code: 'HIGH_RISK_FUNCTION_WITHOUT_FAILURE_MODES',
        kind: moduleKind.kind,
        functionName: fn.name,
        message: `高风险函数 "${moduleKind.kind}.${fn.name}" 未声明 failureModes。`,
        fix: '为高风险函数补充稳定错误码、触发条件和修复建议。',
      })
    }
  }
}

function inspectPayloads(
  moduleKind: AiModule,
  hasPayloadCatalog: boolean,
  findings: AiModuleRuntimeInspectFinding[],
): void {
  if (moduleKind.payloads.length === 0 || hasPayloadCatalog) return
  for (const payload of moduleKind.payloads) {
    findings.push({
      level: 'warn',
      code: 'PAYLOAD_WITHOUT_CATALOG_MODULE',
      kind: moduleKind.kind,
      payloadRef: payload.payloadRef,
      message: `kind "${moduleKind.kind}" 声明 payloadRef "${payload.payloadRef}"，但 runtime 中未发现 payload catalog 模块。`,
      fix: `注册一个同时声明 ${PAYLOAD_QUERY_FUNCTION_NAME}/${PAYLOAD_GUIDE_FUNCTION_NAME} 的 AiModule，或移除该 payloadRef。`,
    })
  }
}

function statusForKind(
  kind: string,
  findings: readonly AiModuleRuntimeInspectFinding[],
): AiModuleRuntimeInspectStatus {
  const scoped = findings.filter((finding) => finding.kind === kind || finding.childKind === kind)
  if (scoped.some((finding) => finding.level === 'error')) return 'error'
  if (scoped.some((finding) => finding.level === 'warn')) return 'warning'
  return 'ok'
}

function isObjectParamsSchema(value: unknown): boolean {
  return isRecord(value) && value['type'] === 'object'
}

function isHighRiskFunction(functionName: string): boolean {
  return HIGH_RISK_FUNCTION_PATTERN.test(functionName)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
