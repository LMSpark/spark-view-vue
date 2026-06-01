/**
 * modules · VCM API 对象元数据
 *
 * VCM/LLM 语义：一个 API 对象描述 LLM 可调用的业务 action，以及 action 返回值中
 * 继续可操作的 API-bearing 对象位置。@ai-visible
 */

import type { AiJsonSchema, AiJsonSchemaObject } from '../../json'
import type {
  AiModuleAttributeMetadata,
  AiModuleFunctionFailureMode,
} from '../protocol/module-metadata'

/** API 对象元数据（根对象或 action 返回的嵌套对象）。 */
export type AiApiObjectMetadata = Readonly<{
  kind: string
  name: string
  description: string
  actions: readonly AiApiActionMetadata[]
  /** v1 adapter 不消费 attributes；保留给后续属性 accessor 设计。 */
  attributes?: readonly AiModuleAttributeMetadata[]
}>

/** API action 元数据。 */
export type AiApiActionMetadata = Readonly<{
  name: string
  methodName: string
  description: string
  paramsSchema: AiJsonSchemaObject
  resultSchema?: AiJsonSchema
  resultApis?: readonly AiApiResultApiRef[]
  usageRules?: readonly string[]
  failureModes?: readonly AiModuleFunctionFailureMode[]
}>

/** action 返回值中的 API-bearing 对象引用。 */
export type AiApiResultApiRef = Readonly<{
  /** 从 result.data 到 API 对象实例的路径；空数组表示 result.data 本身。 */
  resultPath: readonly string[]
  api: AiApiObjectMetadata
}>

/** VCM 生成的完整业务模块元数据。 */
export type AiModuleMetadataJson = Readonly<{
  schemaVersion: 1
  rootApi: AiApiObjectMetadata
}>
