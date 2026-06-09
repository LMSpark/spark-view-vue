import type { AiJsonSchema, AiJsonSchemaObject } from '../../json'

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
  jsdoc: JsDocMeta
  provenance?: SourceProvenanceMeta
  constructor?: ConstructorMeta
  attributes: readonly AttributeMeta[]
  methods: readonly MethodMeta[]
}>

export type JsDocMeta = string

export type ConstructorMeta = Readonly<{
  paramsSchema: AiJsonSchemaObject
  jsdoc: JsDocMeta
  provenance?: SourceProvenanceMeta
}>

export type AttributeMeta = Readonly<{
  name: string
  schema: AiJsonSchema
  readable: boolean
  writable: boolean
  jsdoc: JsDocMeta
  /** 嵌套 VCM class kind；签名在投影层由 kind 解析为 className。 */
  valueKind?: string
  provenance?: SourceProvenanceMeta
}>

export type MethodMeta = Readonly<{
  name: string
  paramsSchema: AiJsonSchemaObject
  returnSchema?: AiJsonSchema
  /** 构建期 TS 反射返回类型；投影层优先于 returnSchema。 */
  returnTypeText?: string
  takesContext?: boolean
  jsdoc: JsDocMeta
  /** 直接返回的 VCM class kind；void/primitive 时省略。 */
  returnsKind?: string
  /** run(callback) 受控编辑时 callback 首参对应的 VCM class kind。 */
  callbackTargetKind?: string
  provenance?: SourceProvenanceMeta
}>
