import type { AiModuleFunctionMetadata } from '../protocol/module-metadata'
import type { AiApiResultApiRef } from './ai-api-object-metadata-schema'

export function toModuleFunctionResultApiMetadata(
  ref: AiApiResultApiRef,
): NonNullable<AiModuleFunctionMetadata['resultApis']>[number] {
  if (ref.api === undefined) {
    throw new Error(`resultApi "${ref.$ref ?? '(unknown)'}" must be resolved before AiModule registration.`)
  }
  return {
    resultPath: [...ref.resultPath],
    kind: ref.api.kind,
    name: ref.api.name,
    description: ref.api.description,
    actions: ref.api.actions.map(action => ({
      name: action.name,
      description: action.description,
      paramNames: isIndexableObject(action.paramsSchema.properties)
        ? Object.keys(action.paramsSchema.properties)
        : [],
    })),
  }
}

function isIndexableObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object'
}
