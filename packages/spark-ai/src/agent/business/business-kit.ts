/**
 * @module @spark-appworks/spark-ai:agent/business/business-kit
 * @spark-appworks/spark-ai 的 agent/business/business-kit 模块。
 * 导出 ClassModel symbol: AiBusinessIdOptions, AiBusinessInputOptions, CreateSimpleInputContractOptions（共 3 个 symbol）。
 */
import type {
  AiJsonParams,
  AiJsonSchemaObject,
} from '../../json'
import { createAiAgentScope } from './business-scope'
import type {
  AiAgentInputContract,
  AiAgentOrchestrationPlan,
} from './business-task'

/** Ai Business Id Options 的调用配置。 */
export type AiBusinessIdOptions = Readonly<{
  businessId: string
}>

/** Ai Business Input Options 的调用配置。 */
export type AiBusinessInputOptions<TInput extends AiJsonParams = AiJsonParams> = Readonly<{
  paramsSchema: AiJsonSchemaObject
  identityField: keyof TInput & string
  messageField: keyof TInput & string
  normalize?: (input: AiJsonParams) => TInput
  systemPrompt: string | ((input: TInput) => string)
  title?: string | ((input: TInput) => string | undefined)
  readonlySteps?: readonly string[] | ((input: TInput) => readonly string[] | undefined)
}>

/** Create Simple Input Contract Options 的调用配置。 */
export type CreateSimpleInputContractOptions<TInput extends AiJsonParams = AiJsonParams> =
  AiBusinessIdOptions & AiBusinessInputOptions<TInput>

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

function normalizeBusinessId(options: AiBusinessIdOptions): string {
  return normalizeRequiredText(options.businessId, 'businessId')
}

function defaultNormalize<TInput extends AiJsonParams>(input: AiJsonParams): TInput {
  if (isSchemaValidatedInput<TInput>(input)) return input
  throw new Error('[AiAgentInputContract] input must match paramsSchema before normalization.')
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

function normalizeRequiredText(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`[AiAgentInputContract] ${field} must be a non-empty string.`)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`[AiAgentInputContract] ${field} must not be empty.`)
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
    throw new Error(`[AiAgentInputContract] ${label} "${field}" must be a non-empty string.`)
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
