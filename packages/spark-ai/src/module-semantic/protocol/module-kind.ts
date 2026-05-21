/**
 * @packageDocumentation
 *
 * 模块语义协议 — 模块类型定义。
 *
 * ModuleKind 描述一种业务模块的形状,纯元数据,不持有状态。
 * 进程内每种 kind 一份,启动后冻结。
 *
 * 三类声明:
 * - attributes: 模块开放给 LLM 的属性表(getAttribute / setAttribute 派生源)
 * - actions:    模块开放给 LLM 的动作表(invokeAction 派生源)
 * - children:   模块下可挂的子 ModuleKind 名单(声明拓扑边,不预占实例)
 *
 * 业务方继承 ModuleKindBase 声明自己的模块类型,
 * 协议层从 ModuleKindRegistry 收集所有 kind 后派生 LLM 工具集。
 */

import type { LlmJsonObject, LlmJsonSchema, LlmJsonValue, LlmParameterSchemaRoot } from '../../schema'

// ═══════════════════════════════════════════════════════
// 1. 属性 / 动作 schema
// ═══════════════════════════════════════════════════════

/**
 * 属性可读/可写能力位。
 */
export interface AttributeCapabilityFlags {
  readonly readable: boolean
  readonly writable: boolean
}

/**
 * 属性声明。
 *
 * 协议层会按 (kind, attrName) 派生出 getAttribute / setAttribute 工具,
 * 调用时路由到 Capability 同名方法。
 *
 * - name:        属性名(在 kind 内唯一)
 * - description: 给 LLM 看的中文说明
 * - schema:      值类型 schema(LLM 读取/写入此属性时传值的形状)
 * - readable:    是否允许 getAttribute
 * - writable:    是否允许 setAttribute
 * - example:     示例值(可选,帮 LLM 理解)
 */
export interface AttributeSchema extends AttributeCapabilityFlags {
  readonly name: string
  readonly description: string
  readonly schema: LlmJsonSchema
  readonly example?: LlmJsonValue | undefined
}

/**
 * 动作失败模式描述(给 LLM 看)。
 */
export interface ActionFailureMode {
  readonly code: string
  readonly when: string
  readonly fix: string
}

export type ActionResultSchema = LlmJsonSchema | LlmJsonObject

/**
 * 动作声明。
 *
 * 协议层按 (kind, actionName) 派生 invokeAction 工具,
 * 调用时路由到 Capability.invokeAction(pathContext, actionName, args)。
 *
 * - name:         动作名(在 kind 内唯一)
 * - description:  给 LLM 看的中文说明
 * - paramsSchema: 参数 schema(根 type 必须是 object)
 * - resultSchema: 返回值 schema(可选,告知 LLM 期望的返回结构)
 * - usageRules:   调用前注意事项列表(LLM 在 describeKind / invokeAction 描述里能看到)
 * - failureModes: 失败模式列表,展示给 LLM
 * - example:      示例参数(可选)
 */
export interface ActionSchema {
  readonly name: string
  readonly description: string
  readonly paramsSchema: LlmParameterSchemaRoot
  readonly resultSchema?: ActionResultSchema | undefined
  readonly usageRules?: readonly string[] | undefined
  readonly failureModes?: readonly ActionFailureMode[] | undefined
  readonly example?: LlmJsonValue | undefined
}

// ═══════════════════════════════════════════════════════
// 2. 模块类型契约
// ═══════════════════════════════════════════════════════

/**
 * 模块类型构造参数。
 */
export interface ModuleKindOptions {
  readonly kind: string
  readonly name: string
  readonly description: string
  readonly attributes?: readonly AttributeSchema[] | undefined
  readonly actions?: readonly ActionSchema[] | undefined
  readonly children?: readonly string[] | undefined
}

/**
 * 模块类型。
 *
 * 一份元数据,进程内只读。等同于"学校型"、"年级型"、"班级型"这类抽象概念。
 *
 * 实例化方式:业务方继承 ModuleKindBase 抽象类。
 */
export interface ModuleKind {
  readonly kind: string
  readonly name: string
  readonly description: string
  readonly attributes: readonly AttributeSchema[]
  readonly actions: readonly ActionSchema[]
  readonly children: readonly string[]
}

// ═══════════════════════════════════════════════════════
// 3. 便捷基类
// ═══════════════════════════════════════════════════════

/**
 * 模块类型便捷基类。
 *
 * 业务方继承本基类声明自己的模块类型:
 * ```ts
 * export class SchoolModuleKind extends ModuleKindBase {
 *   constructor() {
 *     super({
 *       kind: 'school',
 *       name: '学校',
 *       description: '一所学校',
 *       attributes: [
 *         { name: 'name', description: '校名', schema: { type: 'string' }, readable: true, writable: true },
 *       ],
 *       actions: [],
 *       children: ['grade', 'teacher'],
 *     })
 *   }
 * }
 * ```
 */
export abstract class ModuleKindBase implements ModuleKind {
  public readonly kind: string

  public readonly name: string

  public readonly description: string

  public readonly attributes: readonly AttributeSchema[]

  public readonly actions: readonly ActionSchema[]

  public readonly children: readonly string[]

  protected constructor(options: ModuleKindOptions) {
    this.kind = options.kind
    this.name = options.name
    this.description = options.description
    this.attributes = options.attributes ?? []
    this.actions = options.actions ?? []
    this.children = options.children ?? []
  }
}
