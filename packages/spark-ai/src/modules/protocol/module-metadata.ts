/**
 * modules · 模块元数据（声明契约）
 *
 * 协议层级：第 4 层（依赖 module-context + schema）
 * 核心职责：定义 AiModule 的所有声明式元数据类型。它们是纯数据契约，描述一个业务能力模块
 *   "有什么"（属性、函数、荷载、子模块），不包含任何运行时行为。
 *   运行时行为由 module-context.ts 中的委托类型承载，通过 AiModuleOptions 在构造时注入。
 * 上游依赖：module-context（委托类型）、schema（AiJsonSchema 等）
 * 下游消费：module-kind（AiModule 构造函数 + 规范化函数）
 *
 * 文件结构（按概念从小到大：基础标量 → 属性 → 函数 → 荷载 → 构造选项）：
 *   一、基础标量类型          — AiModuleFunctionFailureMode / AiModuleFunctionResultSchema
 *   二、属性元数据            — AiModuleAttributeMetadata / AiModuleAttributeAccess
 *   三、函数元数据            — AiModuleFunctionMetadata
 *   四、参数荷载元数据        — AiModulePayloadMetadata
 *   五、构造选项              — AiModuleOptions（汇集所有元数据 + 委托引用）
 */

import type { AiJsonObject, AiJsonSchema, AiJsonSchemaObject, AiJsonValue } from '../../json'
import type {
  AiModuleAttributeAccessor,
  AiModuleChildrenLister,
  AiModuleInstanceFinder,
  AiModuleRunner,
} from './module-context'

export type { AiModuleAttributeAccessor } from './module-context'

// ============================================================================
// 一、基础标量类型
//
// 被属性、函数、荷载元数据共同引用的最小类型单元。
// ============================================================================

/**
 * 函数失败模式：告知 LLM 可能遇到的错误码、发生条件和修复建议。
 * 在 describeKind 中展示给 LLM，帮助其在调用失败后自主修复。
 *
 * 例：{ code: "TABLE_NOT_FOUND", when: "表格 ID 不存在", fix: "先调用 listChildren 获取有效 ID" }
 */
export type AiModuleFunctionFailureMode = Readonly<{
  /** 错误码（LLM 可见，用于识别失败类型） */
  code: string
  /** 发生条件（自然语言描述何时触发此错误） */
  when: string
  /** 修复建议（LLM 在失败后可参考的恢复步骤） */
  fix: string
}>

/** 函数结果 schema：简单类型名（如 "string"、"number"）或完整 JSON Schema object */
export type AiModuleFunctionResultSchema = AiJsonSchema | AiJsonObject

// ============================================================================
// 二、属性元数据
//
// 描述 AiModule 暴露给 LLM 的一个可读写属性。
// 声明式部分（name / description / schema / readable / writable）在此定义，
// 实际读写由 AiModuleAttributeAccessor 委托完成。
// ============================================================================

export type AiModuleAttributeMetadata = Readonly<{
  /** 属性名（在同一 kind 的 attributes 数组中唯一，如 "title"、"width"） */
  name: string
  /** 属性说明（LLM 可见，如 "表格标题文本"） */
  description: string
  /** 属性值的 JSON Schema（用于 LLM 参数校验和序列化约束） */
  schema: AiJsonSchema
  /** 是否可读（LLM 可调用 getAttribute） */
  readable: boolean
  /** 是否可写（LLM 可调用 setAttribute） */
  writable: boolean
  /** 示例值（可选，帮助 LLM 理解属性形状，如 "示例标题"） */
  example?: AiJsonValue
}>

/** 属性访问权限标记（从 AiModuleAttributeMetadata 中提取 readable/writable） */
export type AiModuleAttributeAccess = Pick<AiModuleAttributeMetadata, 'readable' | 'writable'>

// ============================================================================
// 三、函数元数据
//
// 描述 AiModule 暴露给 LLM 的一个可调用函数。
// 声明式部分（name / description / paramsSchema 等）在此定义，
// 实际执行由 AiModuleRunner 委托完成。
//
// LLM 调用流程：
//   1. describeKind 获取函数表 → 2. 阅读 description + usageRules
//   → 3. 按 paramsSchema 构造参数 → 4. invokeFunction 执行
//   → 5. 失败时参考 failureModes 修复 → 6. 按 resultSchema 解析返回值
// ============================================================================

export type AiModuleFunctionMetadata = Readonly<{
  /** 函数名（在同一 kind 的 functions 数组中唯一，如 "addRow"、"exportData"） */
  name: string
  /** 函数说明（LLM 可见，如 "向表格末尾追加一行空数据"） */
  description: string
  /** 参数 schema（JSON Schema object root，用于 LLM 参数校验） */
  paramsSchema: AiJsonSchemaObject
  /** 返回值 schema（可选，帮助 LLM 理解返回值结构） */
  resultSchema?: AiModuleFunctionResultSchema
  /** 使用规则（多条，LLM 在调用前阅读，如 "每次最多追加 100 行"） */
  usageRules?: readonly string[]
  /** 失败模式（多条，LLM 在调用失败后参考修复） */
  failureModes?: readonly AiModuleFunctionFailureMode[]
  /** 调用示例（帮助 LLM 理解参数形状和调用方式） */
  example?: AiJsonValue
}>

// ============================================================================
// 四、参数荷载元数据
//
// 描述 AiModule 依赖的外部参数指南 provider。
// Load（荷载）是独立于 attributes/functions 的第三类声明，
// 用于向 LLM 注入外部知识（如组件目录清单、数据源列表等）。
//
// 例：spark.component 荷载提供所有可用组件的目录，LLM 在添加组件时参考。
// ============================================================================

export type AiModulePayloadMetadata = Readonly<{
  /** provider 唯一命名空间（如 "spark.component"、"spark.datasource"） */
  payloadRef: string
  /** 该 payload 与当前模块的关系说明（LLM 可见，如 "可用组件目录"） */
  description: string
  /** 该 payload 服务的函数名列表；空表示模块级通用（对所有函数可见） */
  requiredForFunctions?: readonly string[]
}>

// ============================================================================
// 五、构造选项 — AiModuleOptions
//
// AiModule 构造函数的唯一入参，汇集所有元数据声明和运行时委托引用。
// 这是"声明什么"（元数据）与"如何执行"（委托）的装配点。
//
// 构造期三阶段处理（见 AiModule 构造函数）：
//   第一阶段：规范化元数据（trim + fail-fast 校验重复/空值/自引用）
//   第二阶段：属性委托必填校验（声明了 attributes 则必须提供 attributeAccessor）
//   第三阶段：填充默认委托（runner/list/find 未提供时使用安全默认值）
// ============================================================================

export type AiModuleOptions = Readonly<{
  /** 模块类型标识（全小写，在注册表中唯一，如 "school"、"page-design"） */
  kind: string
  /** 模块显示名（LLM 可见，如 "学校管理"、"页面设计器"） */
  name: string
  /** 模块说明（LLM 可见，描述业务能力，如 "管理学校基本信息和班级配置"） */
  description: string
  /** 父模块 kind（可选，表达模块层级关系，如 "page-design" 是 "table" 的 parentKind） */
  parentKind?: string
  /** 属性表（可选，声明 LLM 可读写的一组属性） */
  attributes?: readonly AiModuleAttributeMetadata[]
  /** 函数表（可选，声明 LLM 可调用的一组函数） */
  functions?: readonly AiModuleFunctionMetadata[]
  /** 参数荷载引用（可选，声明依赖的外部参数指南 provider） */
  payloads?: readonly AiModulePayloadMetadata[]
  /** 子模块 kind 列表（可选，声明允许包含的子模块类型） */
  children?: readonly string[]
  /** 属性读写委托（声明了 attributes 时必填，否则构造期抛错） */
  attributeAccessor?: AiModuleAttributeAccessor
  /** 函数执行委托（未提供时默认返回 FUNCTION_NOT_IMPLEMENTED） */
  runner?: AiModuleRunner
  /** 子实例列表委托（未提供时默认返回空列表） */
  list?: AiModuleChildrenLister
  /** 子实例查询委托（未提供时默认返回仅含当前实例的列表） */
  find?: AiModuleInstanceFinder
}>
