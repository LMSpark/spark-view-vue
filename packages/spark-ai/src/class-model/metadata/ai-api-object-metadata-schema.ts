/**
 * @module @spark-appworks/spark-ai:class-model/metadata/ai-api-object-metadata-schema
 * 职责：维护 @spark-appworks/spark-ai 中 class-model/metadata/ai-api-object-metadata-schema 的 AiApiActionFailureMode、AiApiActionExample、AiApiActionAntiExample 等 11 个公开类型语义。
 * 边界：只服务 spark-ai 包内部的 Agent/DtsTypeDeclarationModel 能力，不直接耦合应用页面或 Vue 组件。
 * AI用途：定位 spark-ai 公共 API、运行时协议或知识索引字段时，用本模块作为语义入口。
 */

import type { AiJsonSchema, AiJsonSchemaObject, AiJsonValue } from '../../json'

/** Ai Api Action Failure Mode 的语义模型。 */
export type AiApiActionFailureMode = Readonly<{
  /** 错误码（LLM 可见，用于识别失败类型）。 */
  code: string
  /** 发生条件（自然语言描述何时触发此错误）。 */
  when: string
  /** 修复建议（LLM 在失败后可参考的恢复步骤）。 */
  fix: string
}>

/** Ai Api Action Example 的语义模型。 */
export type AiApiActionExample = Readonly<{
  /** 用户输入示例，可用于判断触发条件。 */
  user?: string
  /** 示例意图说明。 */
  intent?: string
  /** 业务 action 参数示例。 */
  args?: AiJsonValue
  /** 完整调用示例，通常展示 model_script 对象链或 tool arguments。 */
  call?: AiJsonValue
}>

/** Ai Api Action Anti Example 的语义模型。 */
export type AiApiActionAntiExample = Readonly<{
  /** 用户输入或场景示例。 */
  user?: string
  /** 不应调用该 action 的原因。 */
  reason: string
  /** 容易误传的参数示例。 */
  args?: AiJsonValue
}>

/** 从源码 JSDoc 原样拷贝的语义块；源码 JSDoc 是 SSOT，generated JSON 只是缓存快照。 */
export type AiApiJsDocMetadata = string

/** 反射来源；file/line 指向源码声明，typeEntryFile 仅记录可能的 .d.ts 类型入口。 */
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
  /** 子 API kind；标量对象与集合属性均指向元素/值类型的 API（schema.type=array 表示集合）。 */
  api?: AiApiObjectMetadata
}>

/** API action 元数据。 */
export type AiApiActionMetadata = Readonly<{
  name: string
  methodName: string
  signatureText?: string
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
  /** 单参数示例；多示例场景优先 examples。 */
  example?: AiJsonValue
  examples?: readonly AiApiActionExample[]
  antiExamples?: readonly AiApiActionAntiExample[]
}>

/** action 返回值中的 API-bearing 对象引用（runtime 紧凑格式用 $ref，解析后为 api）。 */
export type AiApiResultApiRef = Readonly<{
  /** 从 result.data 到 API 对象实例的路径；空数组表示 result.data 本身。 */
  resultPath: readonly string[]
  api?: AiApiObjectMetadata
  /** 紧凑 runtime JSON：指向 apiRegistry 中的 API kind。 */
  $ref?: string
}>

/** 运行时 API 元数据：由 DTS DtsTypeDeclarationModel 或显式注册入口投影出脚本可执行的 API surface。 */
export type AiRuntimeApiMetadataJson = Readonly<{
  schemaVersion: 1 | 2
  rootApi: AiApiObjectMetadata
  /** schemaVersion=2 时：按 kind 去重后的 action 返回 API 注册表。 */
  apiRegistry?: Readonly<Record<string, AiApiObjectMetadata>>
}>
