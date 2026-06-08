/**
 * vcm-native/metadata · VCM API 对象元数据。
 *
 * VCM/LLM 语义：一个 API 对象描述 LLM 可调用的业务 action，以及 action 返回值中
 * 继续可操作的 API-bearing 对象位置。@ai-visible
 */

import type { AiJsonSchema, AiJsonSchemaObject, AiJsonValue } from '../../json'

export type AiApiActionFailureMode = Readonly<{
  /** 错误码（LLM 可见，用于识别失败类型）。 */
  code: string
  /** 发生条件（自然语言描述何时触发此错误）。 */
  when: string
  /** 修复建议（LLM 在失败后可参考的恢复步骤）。 */
  fix: string
}>

export type AiApiActionExample = Readonly<{
  /** 用户输入示例，可用于判断触发条件。 */
  user?: string
  /** 示例意图说明。 */
  intent?: string
  /** 业务 action 参数示例。 */
  args?: AiJsonValue
  /** 完整调用示例，通常展示 vcm_script 对象链或 tool arguments。 */
  call?: AiJsonValue
}>

export type AiApiActionAntiExample = Readonly<{
  /** 用户输入或场景示例。 */
  user?: string
  /** 不应调用该 action 的原因。 */
  reason: string
  /** 容易误传的参数示例。 */
  args?: AiJsonValue
}>

/** VCM 从源码 JSDoc 派生的语义块；源码 JSDoc 是 SSOT，generated JSON 只是缓存快照。 */
export type AiApiJsDocMetadata = Readonly<{
  raw?: string
  /** compact runtime JSON 会省略与同级 description 重复的 summary。 */
  summary?: string
  /** compact runtime JSON 会省略空 tags。 */
  tags?: readonly AiApiJsDocTagMetadata[]
}>

export type AiApiJsDocTagMetadata = Readonly<{
  name: string
  text: string
  paramName?: string
}>

/** VCM 反射来源；file/line 指向源码声明，typeEntryFile 仅记录可能的 .d.ts 类型入口。 */
export type AiApiSourceProvenanceMetadata = Readonly<{
  file: string
  line: number
  className: string
  memberName?: string
  typeEntryFile?: string
}>

/** API 对象元数据（根对象或 action 返回的嵌套对象）。 */
export type AiApiObjectMetadata = Readonly<{
  kind: string
  name: string
  description: string
  jsdoc?: AiApiJsDocMetadata
  provenance?: AiApiSourceProvenanceMetadata
  constructorSignature?: AiApiConstructorMetadata
  actions: readonly AiApiActionMetadata[]
  attributes?: readonly AiApiAttributeMetadata[]
}>

/** API 对象构造函数元数据。 */
export type AiApiConstructorMetadata = Readonly<{
  description: string
  jsdoc?: AiApiJsDocMetadata
  provenance?: AiApiSourceProvenanceMetadata
  paramsSchema: AiJsonSchemaObject
}>

/** API 属性元数据。 */
export type AiApiAttributeMetadata = Readonly<{
  name: string
  description: string
  jsdoc?: AiApiJsDocMetadata
  provenance?: AiApiSourceProvenanceMetadata
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
  jsdoc?: AiApiJsDocMetadata
  provenance?: AiApiSourceProvenanceMetadata
  paramsSchema: AiJsonSchemaObject
  takesContext?: boolean
  resultSchema?: AiJsonSchema
  resultApis?: readonly AiApiResultApiRef[]
  usageRules?: readonly string[]
  requiredBeforeCall?: readonly string[]
  failureModes?: readonly AiApiActionFailureMode[]
  /** 旧版单参数示例；新代码优先 examples。 */
  example?: AiJsonValue
  examples?: readonly AiApiActionExample[]
  antiExamples?: readonly AiApiActionAntiExample[]
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
