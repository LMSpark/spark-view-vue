import type { AiJsonSchema, AiJsonSchemaObject } from '../../json'
import type { AiModuleMetadataJson } from '../metadata'

/** ClassModel 投影版本；它独立于旧 runtime metadata 的 schemaVersion。 */
export const CLASS_MODEL_DOCUMENT_VERSION = 1 as const

/**
 * ClassModel 文档：只保留 module 真源，不预存 models 索引。
 *
 * LLM 可见的 ClassModel 在 guide 投影时按 attribute 链从 module 按需派生；
 * 连通性由 auditClassModelReflectionConnectivity 验证。
 */
export type ClassModelDocument = Readonly<{
  schemaVersion: typeof CLASS_MODEL_DOCUMENT_VERSION
  rootKind: string
  module: AiModuleMetadataJson
  $defs?: Readonly<Record<string, AiJsonSchemaObject>>
}>

export type SourceProvenanceMeta = Readonly<{
  file: string
  line: number
  className: string
  memberName?: string
  typeEntryFile?: string
  componentName?: string
  declarationKind?: 'class' | 'interface' | 'type' | 'enum' | 'function' | 'const' | 'component'
}>

/** guide 投影时的 class 视图；DTS 生成线会直接持久化这个结构。 */
export type ClassModel = Readonly<{
  kind: string
  className: string
  jsdoc: JsDocMeta
  declarationTypeText?: string
  shapeKind?: 'class' | 'interface' | 'type' | 'enum' | 'function' | 'const' | 'component'
  provenance?: SourceProvenanceMeta
  constructorMeta?: ConstructorMeta
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
  provenance?: SourceProvenanceMeta
}>

export type MethodMeta = Readonly<{
  name: string
  paramsSchema: AiJsonSchemaObject
  returnSchema?: AiJsonSchema
  returnTypeText?: string
  takesContext?: boolean
  jsdoc: JsDocMeta
  paramsTypeText?: string
  provenance?: SourceProvenanceMeta
}>
