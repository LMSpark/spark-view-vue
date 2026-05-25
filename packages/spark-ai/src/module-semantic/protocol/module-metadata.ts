/**
 * module-semantic · 模块元数据（声明契约）
 *
 * 定义 ModuleKind 的所有声明式元数据类型。它们是纯数据契约，描述一个业务能力模块
 * "有什么"（属性、动作、荷载、子模块），不包含任何运行时行为。
 * 运行时行为由 module-context.ts 中的委托类型承载，通过 ModuleKindOptions 在构造时注入。
 *
 * 依赖顺序：基础标量 → 属性元数据 → 动作元数据 → 荷载元数据 → 构造选项
 */

import type { LlmJsonObject, LlmJsonSchema, LlmJsonSchemaObject, LlmJsonValue } from '../../schema'
import type {
  ModuleAttributeAccessor,
  ModuleChildrenLister,
  ModuleInstanceFinder,
  ModuleKindRunner,
} from './module-context'

export type { ModuleAttributeAccessor } from './module-context'

// ============================================================================
// 一、基础标量类型
// ============================================================================

/** 动作失败模式：告知 LLM 可能遇到的错误码、发生条件和修复建议 */
export type ModuleActionFailureMode = Readonly<{
  /** 错误码（LLM 可见，用于识别失败类型） */
  code: string
  /** 发生条件（自然语言描述何时触发此错误） */
  when: string
  /** 修复建议（LLM 在失败后可参考的恢复步骤） */
  fix: string
}>

/** 动作结果 schema：简单类型名或完整 JSON Schema object */
export type ModuleActionResultSchema = LlmJsonSchema | LlmJsonObject

// ============================================================================
// 二、属性元数据
//
// 描述 ModuleKind 暴露给 LLM 的一个可读写属性。
// 实际读写由 ModuleAttributeAccessor 委托完成。
// ============================================================================

export type ModuleAttributeMetadata = Readonly<{
  /** 属性名（在同一 kind 的 attributes 数组中唯一） */
  name: string
  /** 属性说明（LLM 可见） */
  description: string
  /** 属性值的 JSON Schema（用于 LLM 参数校验和序列化约束） */
  schema: LlmJsonSchema
  /** 是否可读 */
  readable: boolean
  /** 是否可写 */
  writable: boolean
  /** 示例值（可选，帮助 LLM 理解属性形状） */
  example?: LlmJsonValue
}>

/** 属性访问权限标记（从 ModuleAttributeMetadata 中提取 readable/writable） */
export type ModuleAttributeAccess = Pick<ModuleAttributeMetadata, 'readable' | 'writable'>

// ============================================================================
// 三、动作元数据
//
// 描述 ModuleKind 暴露给 LLM 的一个可调用动作。
// 实际执行由 ModuleKindRunner 委托完成。
// ============================================================================

export type ModuleActionMetadata = Readonly<{
  /** 动作名（在同一 kind 的 actions 数组中唯一） */
  name: string
  /** 动作说明（LLM 可见） */
  description: string
  /** 参数 schema（JSON Schema object root，用于 LLM 参数校验） */
  paramsSchema: LlmJsonSchemaObject
  /** 返回值 schema（可选，帮助 LLM 理解返回值结构） */
  resultSchema?: ModuleActionResultSchema
  /** 使用规则（多条，LLM 在调用前阅读） */
  usageRules?: readonly string[]
  /** 失败模式（多条，LLM 在调用失败后参考修复） */
  failureModes?: readonly ModuleActionFailureMode[]
  /** 调用示例（帮助 LLM 理解参数形状） */
  example?: LlmJsonValue
}>

// ============================================================================
// 四、参数荷载元数据
//
// 描述 ModuleKind 依赖的外部参数指南 provider（如 spark.component 组件目录清单）。
// ============================================================================

export type ModuleParameterPayloadMetadata = Readonly<{
  /** provider 唯一命名空间（如 "spark.component"） */
  payloadRef: string
  /** 该 payload 与当前模块的关系说明 */
  description: string
  /** 该 payload 服务的 action 名列表；空表示模块级通用 */
  requiredForActions?: readonly string[]
}>

// ============================================================================
// 五、构造选项 — ModuleKindOptions
//
// ModuleKind 构造函数的唯一入参，汇集所有元数据声明和运行时委托引用。
// ============================================================================

export type ModuleKindOptions = Readonly<{
  /** 模块类型标识（全小写，在注册表中唯一，如 "school"、"page-design"） */
  kind: string
  /** 模块显示名（LLM 可见） */
  name: string
  /** 模块说明（LLM 可见，描述业务能力） */
  description: string
  /** 父模块 kind（可选，表达模块层级关系） */
  parentKind?: string
  /** 属性表（可选，声明 LLM 可读写的一组属性） */
  attributes?: readonly ModuleAttributeMetadata[]
  /** 动作表（可选，声明 LLM 可调用的一组动作） */
  actions?: readonly ModuleActionMetadata[]
  /** 参数荷载引用（可选，声明依赖的外部参数指南 provider） */
  payloads?: readonly ModuleParameterPayloadMetadata[]
  /** 子模块 kind 列表（可选，声明允许包含的子模块类型） */
  children?: readonly string[]
  /** 属性读写委托（声明了 attributes 时必填） */
  attributeAccessor?: ModuleAttributeAccessor
  /** 动作执行委托（未提供时默认返回 ACTION_NOT_IMPLEMENTED） */
  runner?: ModuleKindRunner
  /** 子实例列表委托（未提供时默认返回空列表） */
  list?: ModuleChildrenLister
  /** 子实例查询委托（未提供时默认返回仅含当前实例的列表） */
  find?: ModuleInstanceFinder
}>
