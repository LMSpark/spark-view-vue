import type {
  AiJsonParams,
  AiJsonSchemaObject,
} from '../../json'
import {
  AiModuleRuntime,
  type AiModule,
  type AiModuleRuntimeInspectFinding,
  type AiModuleRuntimeInspectReport,
} from '../../modules'
import { DefaultAiAgentSessionStore } from '../session/default-session-store'
import type { AiAgentSessionStore } from '../session/session-types'
import { createAiAgentScope } from './business-scope'
import {
  createAiAgentRegistration,
  type AiAgentInputContract,
  type AiAgentOrchestrationPlan,
} from './business-task'
import type {
  AiAgentAfterFunctionCallOptions,
  AiAgentLifecycleDirective,
} from './lifecycle-types'
import type { AiAgentRegistration } from './registration-types'
import type { AiAgentRuntimeContext } from './scope-types'

export type AiBusinessIdOptions = Readonly<{
  businessId: string
}>

export type AiBusinessInputOptions<TInput extends AiJsonParams = AiJsonParams> = Readonly<{
  paramsSchema: AiJsonSchemaObject
  identityField: keyof TInput & string
  messageField: keyof TInput & string
  normalize?: (input: AiJsonParams) => TInput
  systemPrompt: string | ((input: TInput) => string)
  title?: string | ((input: TInput) => string | undefined)
  readonlySteps?: readonly string[] | ((input: TInput) => readonly string[] | undefined)
}>

export type CreateSimpleInputContractOptions<TInput extends AiJsonParams = AiJsonParams> =
  AiBusinessIdOptions & AiBusinessInputOptions<TInput>

export type AiBusinessLifecycleOptions = Readonly<{
  systemPrompt?: (context: AiAgentRuntimeContext) => string | undefined
  afterFunctionCall?: (
    options: AiAgentAfterFunctionCallOptions,
  ) => AiAgentLifecycleDirective | Promise<AiAgentLifecycleDirective>
  onStartSession?: (context: AiAgentRuntimeContext) => void | Promise<void>
  onEndBusinessInstance?: (
    context: AiAgentRuntimeContext,
    directive: AiAgentLifecycleDirective,
  ) => void | Promise<void>
  releaseModuleInstance?: (moduleInstanceId: string) => void
}>

export type CreateAiBusinessKitOptions<TInput extends AiJsonParams = AiJsonParams> =
  AiBusinessIdOptions & Readonly<{
    name: string
    description: string
    rootModule: AiModule
    modules?: readonly AiModule[]
    runtime?: AiModuleRuntime
    input: AiBusinessInputOptions<TInput>
    sessionStore?: AiAgentSessionStore
    lifecycle?: AiBusinessLifecycleOptions
  }>

export type AiBusinessKit<TInput extends AiJsonParams = AiJsonParams> = Readonly<{
  businessId: string
  runtime: AiModuleRuntime
  registration: AiAgentRegistration<TInput>
  inspectReport: AiModuleRuntimeInspectReport
}>

export function createSimpleInputContract<TInput extends AiJsonParams = AiJsonParams>(
  options: CreateSimpleInputContractOptions<TInput>,
): AiAgentInputContract<TInput> {
  const businessId = normalizeBusinessId(options)
  const identityField = normalizeInputField(options.identityField, 'identityField')
  const messageField = normalizeInputField(options.messageField, 'messageField')
  return {
    paramsSchema: options.paramsSchema,
    identityField,
    normalize: options.normalize ?? defaultNormalize,
    toScope: (input) => {
      const identity = readRequiredString(input, identityField, 'identityField')
      return createAiAgentScope(businessId, identity)
    },
    toOrchestration: (input) => {
      const userMessage = readRequiredString(input, messageField, 'messageField')
      const systemPrompt = resolveTextOption(options.systemPrompt, input, 'systemPrompt')
      const title = resolveOptionalTextOption(options.title, input)
      const readonlySteps = resolveOptionalTextListOption(options.readonlySteps, input)
      const plan: AiAgentOrchestrationPlan = {
        userMessage,
        systemPrompt,
        ...(title === undefined ? {} : { title }),
        ...(readonlySteps === undefined ? {} : { readonlySteps }),
      }
      return plan
    },
  }
}

export function createAiBusinessKit<TInput extends AiJsonParams = AiJsonParams>(
  options: CreateAiBusinessKitOptions<TInput>,
): AiBusinessKit<TInput> {
  const businessId = normalizeBusinessId(options)
  const runtime = options.runtime ?? new AiModuleRuntime()
  runtime.register(options.rootModule)
  for (const moduleKind of options.modules ?? []) {
    runtime.register(moduleKind)
  }
  const inspectReport = runtime.inspect()
  assertInspectableRuntime(inspectReport, businessId)
  const lifecycle = options.lifecycle
  const inputContract = createSimpleInputContract<TInput>({
    businessId,
    ...options.input,
  })
  const registration = createAiAgentRegistration<TInput>({
    kindID: businessId,
    name: options.name,
    description: options.description,
    runtime,
    inputContract,
    sessionStore: options.sessionStore ?? new DefaultAiAgentSessionStore(),
    ...(lifecycle?.systemPrompt === undefined ? {} : { systemPrompt: lifecycle.systemPrompt }),
    ...(lifecycle?.afterFunctionCall === undefined ? {} : { afterFunctionCall: lifecycle.afterFunctionCall }),
    ...(lifecycle?.onStartSession === undefined ? {} : { onStartSession: lifecycle.onStartSession }),
    ...(lifecycle?.onEndBusinessInstance === undefined ? {} : { onEndBusinessInstance: lifecycle.onEndBusinessInstance }),
    ...(lifecycle?.releaseModuleInstance === undefined ? {} : { releaseModuleInstance: lifecycle.releaseModuleInstance }),
  })
  return {
    businessId,
    runtime,
    registration,
    inspectReport,
  }
}

function normalizeBusinessId(options: AiBusinessIdOptions): string {
  return normalizeRequiredText(options.businessId, 'businessId')
}

function defaultNormalize<TInput extends AiJsonParams>(input: AiJsonParams): TInput {
  if (isSchemaValidatedInput<TInput>(input)) return input
  throw new Error('[AiBusinessKit] input must match paramsSchema before normalization.')
}

function isSchemaValidatedInput<TInput extends AiJsonParams>(input: AiJsonParams): input is TInput {
  void input
  return true
}

function normalizeInputField<TInput extends AiJsonParams>(
  field: keyof TInput & string,
  label: string,
): keyof TInput & string {
  normalizeRequiredText(field, label)
  return field
}

function assertInspectableRuntime(report: AiModuleRuntimeInspectReport, businessId: string): void {
  if (report.status === 'ok') return
  const finding = report.findings.find((item) => item.level === 'error')
    ?? report.findings.find((item) => item.level === 'warn')
  throw new Error(formatInspectFailure(report, businessId, finding))
}

function formatInspectFailure(
  report: AiModuleRuntimeInspectReport,
  businessId: string,
  finding: AiModuleRuntimeInspectFinding | undefined,
): string {
  const rootKinds = report.rootKinds.length === 0 ? '(none)' : report.rootKinds.join(', ')
  const summary = `AiBusinessKit runtime inspect failed for "${businessId}": status=${report.status}; moduleCount=${report.moduleCount}; rootKinds=[${rootKinds}]`
  if (finding === undefined) return summary
  const fix = finding.fix === undefined ? '' : `; fix=${finding.fix}`
  return `${summary}; firstFinding=${finding.level}/${finding.code}: ${finding.message}${fix}`
}

function normalizeRequiredText(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`[AiBusinessKit] ${field} must be a non-empty string.`)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`[AiBusinessKit] ${field} must not be empty.`)
  }
  return trimmed
}

function readRequiredString<TInput extends AiJsonParams>(
  input: TInput,
  field: keyof TInput & string,
  label: string,
): string {
  const value = input[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`[AiBusinessKit] ${label} "${field}" must be a non-empty string.`)
  }
  return value.trim()
}

function resolveTextOption<TInput extends AiJsonParams>(
  value: string | ((input: TInput) => string),
  input: TInput,
  label: string,
): string {
  const resolved = typeof value === 'function' ? value(input) : value
  return normalizeRequiredText(resolved, label)
}

function resolveOptionalTextOption<TInput extends AiJsonParams>(
  value: string | ((input: TInput) => string | undefined) | undefined,
  input: TInput,
): string | undefined {
  if (value === undefined) return undefined
  const resolved = typeof value === 'function' ? value(input) : value
  if (resolved === undefined) return undefined
  return normalizeRequiredText(resolved, 'title')
}

function resolveOptionalTextListOption<TInput extends AiJsonParams>(
  value: readonly string[] | ((input: TInput) => readonly string[] | undefined) | undefined,
  input: TInput,
): readonly string[] | undefined {
  if (value === undefined) return undefined
  const resolved = typeof value === 'function' ? value(input) : value
  if (resolved === undefined) return undefined
  const out = resolved.map((item) => normalizeRequiredText(item, 'readonlySteps'))
  return out.length === 0 ? undefined : out
}
