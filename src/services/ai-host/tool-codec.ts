import type {
  AiRuntimeFunctionExposure,
  AiRuntimeKnowledgeProjection,
  LlmParameterSchemaRoot,
} from '@spark-view/spark-ai'
import type { AppAiTransportToolSpec } from './types'

export interface AppAiToolCodec {
  readonly tools: readonly AppAiTransportToolSpec[]
  actionOf(toolName: string): string | null
}

function sanitizeToolNamePart(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  return normalized.length > 0 ? normalized : 'tool'
}

function schemaToParameters(schema: LlmParameterSchemaRoot): Record<string, unknown> {
  if (schema['type'] === 'object') return schema as Record<string, unknown>
  if (schema['kind'] === 'object') return schema as Record<string, unknown>
  if (Object.keys(schema).length === 0) {
    return {
      type: 'object',
      properties: {},
    }
  }
  return {
    type: 'object',
    properties: schema,
  }
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

export function createAppAiToolCodec(projection: AiRuntimeKnowledgeProjection): AppAiToolCodec {
  const actionByToolName = new Map<string, string>()
  const tools = projection.availableFunctions.map((exposure, index): AppAiTransportToolSpec => {
    let toolName = toolNameForExposure(exposure, index)
    if (actionByToolName.has(toolName)) toolName = `ai_${index}_${toolName}`.slice(0, 64)
    actionByToolName.set(toolName, exposure.action)
    return {
      type: 'function',
      function: {
        name: toolName,
        description: buildToolDescription(exposure),
        parameters: schemaToParameters(exposure.paramsSchema),
      },
    }
  })

  return {
    tools,
    actionOf(toolName: string): string | null {
      return actionByToolName.get(toolName) ?? null
    },
  }
}
