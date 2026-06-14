/**
 * @module @spark-appworks/spark-ai:class-model/class-model/types
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 types 能力，围绕 ClassModelDocument、SourceProvenanceMeta、ComponentClassModelLevel 等 11 个公开契约 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/class-model/types 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import type { AiJsonSchema, AiJsonSchemaObject } from '../../json'
import type { AiRuntimeApiMetadataJson } from '../metadata'

/** DtsTypeDeclarationModel 投影版本；它独立于 runtime API metadata 的 schemaVersion。 */
export const CLASS_MODEL_DOCUMENT_VERSION = 1 as const

/**
 * DtsTypeDeclarationModel 文档：只保留 module 真源，不预存 models 索引。
 *
 * LLM 可见的 DtsTypeDeclarationModel 在 guide 投影时按 attribute 链从 module 按需派生；
 * 连通性由 auditClassModelReflectionConnectivity 验证。
 */
export type ClassModelDocument = Readonly<{
  /** 投影格式版本，与 runtime API metadata 的 schemaVersion 独立演进；bundle loader 据此判断是否需要迁移。 */
  schemaVersion: typeof CLASS_MODEL_DOCUMENT_VERSION
  /** 根节点语义标识；当前固定为 'module'，预留未来扩展为 'package' 等粒度。 */
  rootKind: string
  /** 知识链路真源：所有 DtsTypeDeclarationModel 按 attribute 链从此 module 按需派生，不预存 models 索引。 */
  module: AiRuntimeApiMetadataJson
  /** Draft 2020-12 共享定义；当 jsonSchema 使用 $ref 引用内部子 schema 时，被引用的片段存在此字典中以保证 bundle 自包含。 */
  $defs?: Readonly<Record<string, AiJsonSchemaObject>>
}>

/** Source Provenance Meta 的语义模型。 */
export type SourceProvenanceMeta = Readonly<{
  file: string
  line: number
  className: string
  /** 成员级溯源时为属性/方法名；类型级溯源（整个 class/interface）时为 undefined。 */
  memberName?: string
  /** 类型声明入口文件路径，与 file 可能不同（如 re-export 场景 file 是消费方，typeEntryFile 是声明方）。 */
  typeEntryFile?: string
  componentName?: string
  componentType?: string
  componentLevel?: ComponentClassModelLevel
  componentLayer?: ComponentClassModelLayer
  componentDirectory?: string
  declarationKind?: 'class' | 'interface' | 'typeAlias' | 'enum' | 'function' | 'const' | 'component'
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
  /** 原始类型文本，保留 extends/implements 后的完整类型表达式，供 LLM 在无法解析 targetName 时回退阅读。 */
  typeText: string
  /** 可解析的目标符号名；当 typeText 是复杂表达式（泛型、交叉）无法提取单一符号时为 undefined。 */
  targetName?: string
}>

/** DTS type-space declaration kind；对应官方 Declaration Files 中会创建 type name 的声明。 */
export type DtsTypeDeclarationKind =
  | 'class'
  | 'interface'
  | 'typeAlias'
  | 'enum'

/** DTS Type Declaration Base：所有 type-space 声明共享的最小身份和文档字段。 */
export type DtsTypeDeclarationBase<TDeclarationKind extends DtsTypeDeclarationKind> = Readonly<{
  /** 声明模型的唯一名称：class/interface/type/enum 的导出符号名。 */
  name: string
  jsdoc: JsDocMeta
  declarationKind: TDeclarationKind
  /** bundle shard 持久化的 Draft 2020-12 独立校验文档。 */
  jsonSchema?: AiJsonSchemaObject
  provenance?: SourceProvenanceMeta
}>

/** Class Declaration Members 的语义模型。 */
export type ClassDeclarationMembers = Readonly<{
  attributes: readonly AttributeMeta[]
  methods: readonly MethodMeta[]
}>

/** Interface Declaration Members 的语义模型。 */
export type InterfaceDeclarationMembers = Readonly<{
  attributes: readonly AttributeMeta[]
  methods: readonly MethodMeta[]
}>

/** Type Alias Declaration Members 的语义模型。 */
export type TypeAliasDeclarationMembers = Readonly<{
  attributes: readonly AttributeMeta[]
  methods: readonly MethodMeta[]
}>

/** Class Declaration Payload 的语义模型。 */
export type ClassDeclarationPayload = Readonly<{
  constructorMeta: ConstructorMeta
  declarationRelations?: readonly ClassModelDeclarationRelation[]
  members: ClassDeclarationMembers
}>

/** Interface Declaration Payload 的语义模型。 */
export type InterfaceDeclarationPayload = Readonly<{
  declarationRelations?: readonly ClassModelDeclarationRelation[]
  members: InterfaceDeclarationMembers
}>

/** Type Alias Declaration Payload 的语义模型。 */
export type TypeAliasDeclarationPayload = Readonly<{
  declarationTypeText: string
  declarationRelations?: readonly ClassModelDeclarationRelation[]
  members: TypeAliasDeclarationMembers
}>

/** Enum Declaration Payload 的语义模型。 */
export type EnumDeclarationPayload = Readonly<{
  members: readonly AttributeMeta[]
}>

/** Class Declaration Model 的语义模型。 */
export type ClassDeclarationModel =
  & DtsTypeDeclarationBase<'class'>
  & Readonly<{
    classDecl: ClassDeclarationPayload
  }>

/** Interface Declaration Model 的语义模型。 */
export type InterfaceDeclarationModel =
  & DtsTypeDeclarationBase<'interface'>
  & Readonly<{
    interfaceDecl: InterfaceDeclarationPayload
  }>

/** Type Alias Declaration Model 的语义模型。 */
export type TypeAliasDeclarationModel =
  & DtsTypeDeclarationBase<'typeAlias'>
  & Readonly<{
    typeAlias: TypeAliasDeclarationPayload
  }>

/** Enum Declaration Model 的语义模型。 */
export type EnumDeclarationModel =
  & DtsTypeDeclarationBase<'enum'>
  & Readonly<{
    enumDecl: EnumDeclarationPayload
  }>

/** guide 投影时的 type-space 声明视图；按 declarationKind 判别，不承载 value/namespace 声明。 */
export type DtsTypeDeclarationModel =
  | ClassDeclarationModel
  | InterfaceDeclarationModel
  | TypeAliasDeclarationModel
  | EnumDeclarationModel

/** Js Doc Meta 的语义模型。 */
export type JsDocMeta = string

/** Constructor Meta 的语义模型。 */
export type ConstructorMeta = Readonly<{
  signatureText?: string
  /** 调用约定：positional = 按位置传参，named = 对象解构传参（影响 paramsSchema 的结构：positional 是 tuple，named 是 object）。 */
  parameterStyle?: MethodParameterStyle
  parameters?: readonly MethodParameterMeta[]
  /** 参数 JSON Schema；positional 风格为 tuple schema，named 风格为 object schema，用于 LLM 工具调用时的参数校验。 */
  paramsSchema?: AiJsonSchemaObject
  jsdoc: JsDocMeta
  provenance?: SourceProvenanceMeta
}>

/** Attribute Meta 的语义模型。 */
export type AttributeMeta = Readonly<{
  name: string
  schema?: AiJsonSchema
  /** 可读性标记；getter 或 public 属性为 true，write-only setter 为 false。 */
  readable: boolean
  /** 可写性标记；setter 或 public mutable 属性为 true，readonly/getter-only 为 false。 */
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
 * 改造清单（optional / reflection / tuple / rest）：[`docs/typedoc-signature-alignment.md`](../../docs/typedoc-signature-alignment.md)
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
  /** 签名返回类型；与 MethodMeta.type 不同，此处是 reflection 内嵌的返回类型，用于回调/内联函数场景。 */
  type: DtsTypeMeta
}>

/** DTS reflection 类型：承载函数或对象字面量中的签名树，用于回调参数和内联函数类型的递归寻址。 */
export type DtsReflectionTypeMeta = Readonly<{
  type: 'reflection'
  /** 反射声明容器；signatures 数组至少一个元素，空数组表示 TypeDoc 解析异常。 */
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
  paramsSchema?: AiJsonSchemaObject
  /** 返回值 JSON Schema；仅在返回类型可完整映射为 JSON Schema 时存在，复杂类型（泛型/回调）可能缺失。 */
  returnSchema?: AiJsonSchema
  /** 方法首参是否为上下文对象（如 SparkScriptContext）；标记为 true 时 LLM 在工具调用中应跳过该参数。 */
  takesContext?: boolean
  jsdoc: JsDocMeta
  provenance?: SourceProvenanceMeta
}>
