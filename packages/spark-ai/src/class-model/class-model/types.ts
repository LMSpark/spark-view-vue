/**
 * @module @spark-appworks/spark-ai:class-model/class-model/types
 * 职责：维护 DTS ClassModel 知识链路中的 types 能力，围绕 ClassModelDocument、SourceProvenanceMeta、ComponentClassModelLevel 等 11 个公开契约 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不回退到 VCM，也不直接执行业务页面逻辑。
 * AI用途：当需要判断 ClassModel 在 class-model/class-model/types 这一段如何生成、加载或投影时，用本模块定位职责。
 */
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

/** Source Provenance Meta 的语义模型。 */
export type SourceProvenanceMeta = Readonly<{
  file: string
  line: number
  className: string
  memberName?: string
  typeEntryFile?: string
  componentName?: string
  componentType?: string
  componentLevel?: ComponentClassModelLevel
  componentLayer?: ComponentClassModelLayer
  componentDirectory?: string
  declarationKind?: 'class' | 'interface' | 'type' | 'enum' | 'function' | 'const' | 'component'
}>

/** Component Class Model Level 的语义模型。 */
export type ComponentClassModelLevel =
  | 'table-level'
  | 'container'
  | 'field-level'
  | 'display'
  | 'infrastructure'

/** Component Class Model Layer 的语义模型。 */
export type ComponentClassModelLayer =
  | 'data-view-container'
  | 'layout-container'
  | 'zone-container'
  | 'data-field'
  | 'field-support'
  | 'data-display'
  | 'static-display'
  | 'editor'
  | 'support'

/** Class Model Declaration Relation Kind 的语义模型。 */
export type ClassModelDeclarationRelationKind =
  | 'alias'
  | 'intersection'
  | 'union'
  | 'extends'
  | 'implements'

/** Class Model Declaration Relation 的语义模型。 */
export type ClassModelDeclarationRelation = Readonly<{
  kind: ClassModelDeclarationRelationKind
  typeText: string
  targetName?: string
}>

/** guide 投影时的 class 视图；DTS 生成线会直接持久化这个结构。 */
export type ClassModel = Readonly<{
  kind: string
  className: string
  jsdoc: JsDocMeta
  declarationTypeText?: string
  declarationRelations?: readonly ClassModelDeclarationRelation[]
  shapeKind?: 'class' | 'interface' | 'type' | 'enum' | 'function' | 'const' | 'component'
  provenance?: SourceProvenanceMeta
  constructorMeta?: ConstructorMeta
  attributes: readonly AttributeMeta[]
  methods: readonly MethodMeta[]
}>

/** Js Doc Meta 的语义模型。 */
export type JsDocMeta = string

/** Constructor Meta 的语义模型。 */
export type ConstructorMeta = Readonly<{
  signatureText?: string
  parameterStyle?: MethodParameterStyle
  parameters?: readonly MethodParameterMeta[]
  paramsSchema?: AiJsonSchemaObject
  jsdoc: JsDocMeta
  provenance?: SourceProvenanceMeta
}>

/** Attribute Meta 的语义模型。 */
export type AttributeMeta = Readonly<{
  name: string
  schema: AiJsonSchema
  readable: boolean
  writable: boolean
  jsdoc: JsDocMeta
  provenance?: SourceProvenanceMeta
}>

/**
 * Method Parameter Style 表达 .d.ts 签名的调用形态。
 * positional 表示调用方按参数位置传入实参；named 表示签名使用对象解构，调用方传入一个承载命名字段的对象。
 */
export type MethodParameterStyle = 'positional' | 'named'

/**
 * DTS Type Meta 按 TypeDoc JSONOutput 的 type discriminator 表达参数和返回值类型。
 * intrinsic/literal 可直接用于 FC 基础类型校验；reference 通过 sourcePath 和 typeArguments 递归定位声明；
 * array/union/intersection 保留组合结构，避免把 .d.ts 类型降级成不可验证的字符串。
 *
 * 改造清单（optional / reflection / tuple / rest）：[`docs/TYPEDOC-SIGNATURE-ALIGNMENT.zh-CN.md`](../../docs/TYPEDOC-SIGNATURE-ALIGNMENT.zh-CN.md)
 */
export type DtsTypeMeta =
  | Readonly<{ type: 'intrinsic'; name: string }>
  | Readonly<{ type: 'reference'; name: string; sourcePath?: string; refersToTypeParameter?: boolean; typeArguments?: readonly DtsTypeMeta[] }>
  | Readonly<{ type: 'array'; elementType: DtsTypeMeta }>
  | Readonly<{ type: 'union'; types: readonly DtsTypeMeta[] }>
  | Readonly<{ type: 'intersection'; types: readonly DtsTypeMeta[] }>
  | Readonly<{ type: 'literal'; value: string | number | boolean | null }>
  | Readonly<{ type: 'optional'; elementType: DtsTypeMeta }>
  | Readonly<{ type: 'rest'; elementType: DtsTypeMeta }>
  | Readonly<{ type: 'tuple'; elements: readonly DtsTypeMeta[] }>
  | DtsReflectionTypeMeta
  | Readonly<{ type: 'unknown'; name: string }>

/** TypeDoc `ReflectionType` 精简：函数/构造签名。 */
export type DtsReflectionSignature = Readonly<{
  parameters: readonly MethodParameterMeta[]
  type: DtsTypeMeta
}>

export type DtsReflectionTypeMeta = Readonly<{
  type: 'reflection'
  declaration: Readonly<{
    signatures: readonly DtsReflectionSignature[]
  }>
}>

/** Method Parameter Meta 按 TypeDoc JSONOutput.ParameterReflection 记录 DTS 参数。 */
export type MethodParameterMeta = Readonly<{
  name: string
  type: DtsTypeMeta
  flags?: Readonly<{ isOptional?: boolean }>
  defaultValue?: string | number | boolean | null
}>

/** Method Meta 的语义模型。 */
export type MethodMeta = Readonly<{
  name: string
  signatureText?: string
  parameterStyle?: MethodParameterStyle
  parameters?: readonly MethodParameterMeta[]
  /** TypeDoc SignatureReflection.type（返回类型 SSOT）。 */
  type?: DtsTypeMeta
  /** @deprecated 旧 bundle 读侧兼容 alias；新 bundle 只写 `type`。 */
  returnType?: DtsTypeMeta
  paramsSchema?: AiJsonSchemaObject
  returnSchema?: AiJsonSchema
  returnTypeText?: string
  takesContext?: boolean
  jsdoc: JsDocMeta
  paramsTypeText?: string
  provenance?: SourceProvenanceMeta
}>
