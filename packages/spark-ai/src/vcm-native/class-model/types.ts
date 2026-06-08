import type { AiJsonSchema, AiJsonSchemaObject } from '../../json'
import type { AiApiActionFailureMode } from '../metadata'

/** ClassModel 投影版本；它独立于旧 runtime metadata 的 schemaVersion。 */
export const CLASS_MODEL_DOCUMENT_VERSION = 1 as const

export type ClassModelDocument = Readonly<{
  schemaVersion: typeof CLASS_MODEL_DOCUMENT_VERSION
  rootKind: string
  models: Readonly<Record<string, ClassModel>>
  /** 复用旧生成物中的 $defs 池化结果，继续交给 JSON Schema 标准化链路处理。 */
  $defs?: Readonly<Record<string, AiJsonSchemaObject>>
  diagnostics: readonly ClassModelDiagnostic[]
}>

export type ClassModelDiagnostic = Readonly<{
  level: 'info' | 'warning'
  code: string
  target: string
  message: string
}>

export type SourceProvenanceMeta = Readonly<{
  /** 源码声明文件；这是 JSDoc/VCM 语义 SSOT。 */
  file: string
  line: number
  className: string
  memberName?: string
  /** 类型入口曾经来自 .d.ts 时记录；它不作为语义真源。 */
  typeEntryFile?: string
}>

/**
 * ClassModel 是源码 class 的反射图，不是 OpenAI tool。
 *
 * OpenAI 层看到的是 tools/tool_calls；这里的 methods 只是 class public
 * methods 的稳定描述，后续 guide 会把它渲染成 LLM 更容易读的 d.ts-like 文本。
 */
export type ClassModel = Readonly<{
  kind: string
  className: string
  name: string
  declaration: string
  jsdoc: JsDocMeta
  provenance?: SourceProvenanceMeta
  constructor?: ConstructorMeta
  attributes: readonly AttributeMeta[]
  methods: readonly MethodMeta[]
}>

export type JsDocMeta = Readonly<{
  raw?: string
  summary: string
  tags: readonly JsDocTagMeta[]
}>

export type JsDocTagMeta = Readonly<{
  name: string
  text: string
  paramName?: string
}>

export type ConstructorMeta = Readonly<{
  signature: string
  declaration: string
  paramsSchema: AiJsonSchemaObject
  jsdoc: JsDocMeta
  provenance?: SourceProvenanceMeta
}>

export type AttributeMeta = Readonly<{
  name: string
  declaration: string
  typeText: string
  schema: AiJsonSchema
  readable: boolean
  writable: boolean
  jsdoc: JsDocMeta
  provenance?: SourceProvenanceMeta
  childModels: readonly ChildModelLink[]
}>

export type MethodMeta = Readonly<{
  name: string
  methodName: string
  signature: string
  declaration: string
  paramsSchema: AiJsonSchemaObject
  returnTypeText: string
  returnSchema?: AiJsonSchema
  takesContext?: boolean
  jsdoc: JsDocMeta
  provenance?: SourceProvenanceMeta
  /**
   * methods 是 class 方法，不等于 OpenAI function tool。
   * childModels 描述“调用/读取之后还能进入哪些 class model”。
   */
  childModels: readonly ChildModelLink[]
  requiredBeforeCall: readonly string[]
  usageRules: readonly string[]
  failureModes: readonly AiApiActionFailureMode[]
}>

/**
 * callback-param 表示模型经回调参数进入，例如 editNodeTree(run)
 * 调用 run(tree) 时交给调用方的 tree。它不是方法返回值。
 */
export type ChildModelLink =
  | Readonly<{
      source: 'attribute'
      targetKind: string
      path?: readonly string[]
    }>
  | Readonly<{
      source: 'return'
      targetKind: string
      path: readonly string[]
    }>
  | Readonly<{
      source: 'callback-param'
      targetKind: string
      methodParamName: string
      methodParamIndex: number
      callbackParamName: string
      callbackParamIndex: number
    }>
