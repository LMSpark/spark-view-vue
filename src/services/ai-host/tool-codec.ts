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
        description: exposure.description,
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
