/**
 * VCM API 对象元数据 → AiModule 声明契约的桥接映射。
 *
 * 生成器产出 AiApiObjectMetadata；协议层消费 AiModuleFunctionMetadata 等。
 * 业务注册（AiModuleAdapter、guide-only companion）统一经此转换，避免字段遗漏。
 */

import type {
  AiModuleAttributeMetadata,
  AiModuleFunctionMetadata,
  AiModuleNestedApiMetadata,
} from '../protocol/module-metadata'
import type {
  AiApiActionMetadata,
  AiApiAttributeMetadata,
  AiApiObjectMetadata,
} from './ai-api-object-metadata-schema'
import { toModuleFunctionResultApiMetadata } from './function-result-api-metadata'

export type ToModuleFunctionMetadataOptions = Readonly<{
  directCallable?: boolean
}>

export function toModuleNestedApiMetadata(api: AiApiObjectMetadata): AiModuleNestedApiMetadata {
  return {
    kind: api.kind,
    name: api.name,
    description: api.description,
    actions: api.actions.map(action => ({
      name: action.name,
      description: action.description,
      paramNames: paramNamesFromSchema(action.paramsSchema.properties),
    })),
  }
}

export function toModuleAttributeMetadata(attribute: AiApiAttributeMetadata): AiModuleAttributeMetadata {
  return {
    name: attribute.name,
    description: attribute.description,
    schema: attribute.schema,
    readable: attribute.readable,
    writable: attribute.writable,
    ...(attribute.api === undefined ? {} : { api: toModuleNestedApiMetadata(attribute.api) }),
  }
}

export function toModuleFunctionMetadata(
  action: AiApiActionMetadata,
  options: ToModuleFunctionMetadataOptions = {},
): AiModuleFunctionMetadata {
  return {
    name: action.name,
    description: action.description,
    paramsSchema: action.paramsSchema,
    ...(action.resultSchema === undefined ? {} : { resultSchema: action.resultSchema }),
    ...(action.resultApis === undefined
      ? {}
      : { resultApis: action.resultApis.map(toModuleFunctionResultApiMetadata) }),
    ...(action.usageRules === undefined ? {} : { usageRules: [...action.usageRules] }),
    ...(action.requiredBeforeCall === undefined ? {} : { requiredBeforeCall: [...action.requiredBeforeCall] }),
    ...(action.failureModes === undefined
      ? {}
      : { failureModes: action.failureModes.map(mode => ({ ...mode })) }),
    ...(options.directCallable === undefined ? {} : { directCallable: options.directCallable }),
    ...(action.example === undefined ? {} : { example: action.example }),
    ...(action.examples === undefined ? {} : { examples: action.examples.map(example => ({ ...example })) }),
    ...(action.antiExamples === undefined
      ? {}
      : { antiExamples: action.antiExamples.map(example => ({ ...example })) }),
  }
}

function paramNamesFromSchema(properties: unknown): readonly string[] {
  if (!isIndexableObject(properties)) return []
  return Object.keys(properties)
}

function isIndexableObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object'
}
