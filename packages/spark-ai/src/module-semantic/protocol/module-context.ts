/**
 * module-semantic · 运行时上下文与委托契约
 *
 * 定义 module-semantic 协议层的上下文类型和委托函数签名。
 * 所有 ModuleKind 构造期注入的行为委托均在此声明，与元数据声明（module-metadata.ts）
 * 形成"声明什么"与"如何执行"的清晰边界。
 *
 * 类型分组（按依赖顺序排列）：
 *   一、基础标识类型     — 无内部依赖，被后续所有类型引用
 *   二、操作类型别名     — 仅依赖外部 ModuleOperationResult，被所有委托引用
 *   三、导航上下文       — 依赖基础标识 + 外部 ModulePathSegment
 *   四、委托契约         — 依赖基础标识 + 导航上下文 + 操作类型别名
 */

import type { LlmJsonValue } from '../../schema'
import type { ModuleOperationResult } from './module-operation'
import type { ModulePathSegment } from './module-path'

// ============================================================================
// 一、基础标识类型
//
// 协议中最底层的标识和引用类型。纯数据载体，不依赖本文件其他类型。
// ============================================================================

/**
 * Host 运行时标识。一次会话内不变，由 Host 层在构造 ModulePathContext 时注入，
 * ModuleKind 通过 ctx.host 访问，用于定位当前业务实例。
 */
export type ModuleHostContext = Readonly<{
  /** 模块注册 ID（对应 ModuleKindRegistry 中的 key） */
  moduleId: string
  /** 模块实例 ID（业务层唯一标识，如页面设计器的 pageId） */
  moduleInstanceId: string
  /** Host 层实例 ID（与 moduleInstanceId 可能不同，用于 Host 内部路由） */
  instanceId: string
}>

/**
 * 子实例引用。LLM 可见的最小实例描述，listChildren / findInstance 的返回元素。
 */
export type ModuleInstanceRef = Readonly<{
  /** 实例 ID（在同一 kind 下唯一） */
  id: string
  /** 显示标签（LLM 可见，如 "表格_0"、"主表单"） */
  label: string
  /** 摘要说明（可选，帮助 LLM 区分同名实例） */
  summary?: string
}>

/**
 * 实例查询条件。键值对，具体语义由 ModuleKind 构造期的 find 委托解释。
 * 常见条件：{ id: "0" }、{ name: "main-form" }、{ type: "table" }
 */
export type ModuleInstanceQuery = Readonly<Record<string, LlmJsonValue>>

// ============================================================================
// 二、操作类型别名
//
// ModuleKindOperation<T> 是委托返回类型的统一别名。支持同步和异步两种模式，
// 由 ModuleKind 协议方法统一 await 处理，避免不必要的 Promise 包装。
// ============================================================================

/** 可同步或异步返回的操作结果 */
export type ModuleKindOperation<TData> = ModuleOperationResult<TData> | Promise<ModuleOperationResult<TData>>

// ============================================================================
// 三、导航上下文
//
// ModulePathContext 是协议方法（getAttribute / setAttribute / invokeFunction 等）
// 的第一个参数。由 Navigator 将 ModulePath 解析后传入 ModuleKind 的协议方法。
// ============================================================================

export type ModulePathContext = Readonly<{
  /** 完整路径段列表（从根到当前节点） */
  segments: readonly ModulePathSegment[]
  /** 当前段（Navigator 解析路径后的当前节点；根级查询时为 undefined） */
  segment?: ModulePathSegment
  /** Host 层注入的运行时标识（可选，根导航或纯协议测试可不提供） */
  host?: ModuleHostContext
}>

// ============================================================================
// 四、委托契约
//
// 以下 4 个委托是 ModuleKind 构造期注入的行为入口，每个覆盖一类运行时操作：
//   ModuleAttributeAccessor  — 属性读写（get / set）
//   ModuleKindRunner         — 函数执行
//   ModuleChildrenLister     — 子实例列表
//   ModuleInstanceFinder     — 子实例查询
//
// 所有委托均返回 ModuleKindOperation<T>，由 ModuleKind 协议方法统一 await
// 后包装为 Promise<ModuleOperationResult<T>> 返回给调用方。
// ============================================================================

/**
 * 属性读写委托。
 * 属性的实际读写不直接操作 runner 对象，而是通过该委托完成。
 * 业务方在构造 ModuleKind 时注入，支持异步读取、写入校验、权限控制等自定义逻辑。
 */
export type ModuleAttributeAccessor = Readonly<{
  /** 读取属性值（ctx 定位实例，attrName 定位属性） */
  get: (ctx: ModulePathContext, attrName: string) => ModuleKindOperation<unknown>
  /** 写入属性值（ctx 定位实例，attrName 定位属性，value 为 JSON 值） */
  set: (ctx: ModulePathContext, attrName: string, value: LlmJsonValue) => ModuleKindOperation<void>
}>

/**
 * 函数执行委托。
 * 接收 ctx + functionName + args，返回操作结果。
 * 未提供时 ModuleKind 构造函数默认返回 FUNCTION_NOT_IMPLEMENTED。
 */
export type ModuleKindRunner = (
  ctx: ModulePathContext,
  functionName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
) => ModuleKindOperation<LlmJsonValue>

/**
 * 子实例列表委托。
 * 接收 ctx + 可选 childKind 过滤，返回实例引用列表。
 * 未提供时默认返回空列表。
 */
export type ModuleChildrenLister = (
  ctx: ModulePathContext,
  childKind?: string,
) => ModuleKindOperation<readonly ModuleInstanceRef[]>

/**
 * 子实例查询委托。
 * 接收 ctx + childKind + query，返回匹配的实例引用列表。
 * 未提供时默认仅当 childKind 等于自身 kind 且非路径查询时返回当前实例。
 */
export type ModuleInstanceFinder = (
  ctx: ModulePathContext,
  childKind: string,
  query: ModuleInstanceQuery,
) => ModuleKindOperation<readonly ModuleInstanceRef[]>
