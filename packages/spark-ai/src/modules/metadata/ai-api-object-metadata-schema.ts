/**
 * modules · VCM API 对象元数据
 *
 * VCM/LLM 语义：一个 API 对象描述 LLM 可调用的业务 action，以及 action 返回值中
 * 继续可操作的 API-bearing 对象位置。@ai-visible
 */

import type { AiJsonSchema, AiJsonSchemaObject } from '../../json'
import type { AiModuleFunctionFailureMode } from '../protocol/module-metadata'

/** API 对象元数据（根对象或 action 返回的嵌套对象）。 */
export type AiApiObjectMetadata = Readonly<{
  kind: string
  name: string
  description: string
  constructorSignature?: AiApiConstructorMetadata
  actions: readonly AiApiActionMetadata[]
  attributes?: readonly AiApiAttributeMetadata[]
}>

/** API 对象构造函数元数据。 */
export type AiApiConstructorMetadata = Readonly<{
  description: string
  paramsSchema: AiJsonSchemaObject
}>

/** API 属性元数据。 */
export type AiApiAttributeMetadata = Readonly<{
  name: string
  description: string
  schema: AiJsonSchema
  readable: boolean
  writable: boolean
  api?: AiApiObjectMetadata
}>

/** API action 元数据。 */
export type AiApiActionMetadata = Readonly<{
  name: string
  methodName: string
  description: string
  paramsSchema: AiJsonSchemaObject
  takesContext?: boolean
  resultSchema?: AiJsonSchema
  resultApis?: readonly AiApiResultApiRef[]
  usageRules?: readonly string[]
  failureModes?: readonly AiModuleFunctionFailureMode[]
}>

/** action 返回值中的 API-bearing 对象引用（runtime 紧凑格式用 $ref，解析后为 api）。 */
export type AiApiResultApiRef = Readonly<{
  /** 从 result.data 到 API 对象实例的路径；空数组表示 result.data 本身。 */
  resultPath: readonly string[]
  api?: AiApiObjectMetadata
  /** 紧凑 runtime JSON：指向 apiRegistry 中的 module kind。 */
  $ref?: string
}>

/** VCM 生成的完整业务模块元数据。 */
export type AiModuleMetadataJson = Readonly<{
  schemaVersion: 1 | 2
  rootApi: AiApiObjectMetadata
  /** schemaVersion=2 时：按 kind 去重后的 action 返回 API 注册表。 */
  apiRegistry?: Readonly<Record<string, AiApiObjectMetadata>>
}>
