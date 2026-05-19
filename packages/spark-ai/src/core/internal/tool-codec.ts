import type {
  AiRuntimeFunctionExposure,
  AiRuntimeKnowledgeProjection,
} from '../protocol/runtime-protocol'
import type { LlmParameterSchemaRoot } from '../protocol/parameter-schema'

export interface AiRuntimeToolSpec {
  readonly type: 'function'
  readonly function: {
    readonly name: string
    readonly description: string
    readonly parameters: Record<string, unknown>
  }
}

export type AiRuntimeToolCodecOptions = {
  readonly includeActions?: ReadonlySet<string> | ((exposure: AiRuntimeFunctionExposure) => boolean) | undefined
}

function sanitizeToolNamePart(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  return normalized.length > 0 ? normalized : 'tool'
}

function schemaToParameters(schema: LlmParameterSchemaRoot): Record<string, unknown> {
  if (schema.type !== 'object') {
    throw new Error('LLM tool parameters must be standard JSON Schema with root type=object')
  }
  return { ...schema }
}

function toolNameForExposure(exposure: AiRuntimeFunctionExposure, index: number): string {
  const modulePart = sanitizeToolNamePart(exposure.moduleId)
  const actionPart = sanitizeToolNamePart(exposure.action.split('@').at(-1) ?? `fn_${index}`)
  return `ai_${index}_${modulePart}_${actionPart}`.slice(0, 64)
}

function buildToolDescription(exposure: AiRuntimeFunctionExposure): string {
  const parts = [exposure.description]
  if (exposure.usageRules !== undefined && exposure.usageRules.length > 0) {
    parts.push(`使用规则:\n${exposure.usageRules.map((rule) => `- ${rule}`).join('\n')}`)
  }
  if (exposure.failureModes !== undefined && exposure.failureModes.length > 0) {
    parts.push(`失败处理:\n${exposure.failureModes.map((mode) => (
      `- ${mode.code}: ${mode.when}；修复: ${mode.fix}`
    )).join('\n')}`)
  }
  return parts.join('\n\n')
}

function shouldIncludeExposure(exposure: AiRuntimeFunctionExposure, options: AiRuntimeToolCodecOptions): boolean {
  const includeActions = options.includeActions
  if (includeActions === undefined) return true
  if (typeof includeActions === 'function') return includeActions(exposure)
  return includeActions.has(exposure.action)
}

export class AiRuntimeToolCodec {
  readonly tools: readonly AiRuntimeToolSpec[]

  private readonly actionByToolName = new Map<string, string>()

  constructor(
    projection: AiRuntimeKnowledgeProjection,
    options: AiRuntimeToolCodecOptions = {},
  ) {
    this.tools = projection.availableFunctions.flatMap((exposure, index): AiRuntimeToolSpec[] => {
      if (!shouldIncludeExposure(exposure, options)) return []
      let toolName = toolNameForExposure(exposure, index)
      if (this.actionByToolName.has(toolName)) toolName = `ai_${index}_${toolName}`.slice(0, 64)
      this.actionByToolName.set(toolName, exposure.action)
      return [{
        type: 'function',
        function: {
          name: toolName,
          description: buildToolDescription(exposure),
          parameters: schemaToParameters(exposure.paramsSchema),
        },
      }]
    })
  }

  actionOf(toolName: string): string | null {
    return this.actionByToolName.get(toolName) ?? null
  }
}
