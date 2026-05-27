/**
 * module-semantic · 运行时上下文与委托契约
 *
 * 协议层级：第 3 层（依赖 module-operation + module-path）
 * 核心职责：定义 module-semantic 协议层的上下文类型和委托函数签名。
 *   所有 ModuleKind 构造期注入的行为委托均在此声明，与元数据声明（module-metadata.ts）
 *   形成"声明什么"（元数据）与"如何执行"（委托）的清晰边界。
 * 上游依赖：module-operation（ModuleOperationResult）、module-path（ModulePathSegment）
 * 下游消费：module-metadata、module-kind、以及所有委托实现方
 *
 * 类型分组（按时序与依赖：先定义基础标识 → 再定义操作别名 → 上下文 → 最后定义委托）：
 *   一、基础标识类型     — 无内部依赖，被后续所有类型引用
 *   二、操作类型别名     — 仅依赖外部 ModuleOperationResult，被所有委托引用
 *   三、导航上下文       — 依赖基础标识 + 外部 ModulePathSegment
 *   四、委托契约         — 依赖基础标识 + 导航上下文 + 操作类型别名
 */

import type { LlmJsonParams, LlmJsonValue } from '../../schema'
import type { ModuleOperationResult } from './module-operation'
import type { ModulePathSegment } from './module-path'

// ============================================================================
// 一、基础标识类型
//
// 协议中最底层的标识和引用类型。纯数据载体，不依赖本文件其他类型。
// 这些类型在整个协议栈中流通：ModuleKind 协议方法 → 委托实现 → 业务代码。
// ============================================================================

/**
 * Host 运行时标识。一次会话内不变，由 Host 层在构造 ModulePathContext 时注入。
 * ModuleKind 通过 ctx.host 访问，用于定位当前业务实例。
 *
 * 三个 ID 的职责区分：
 *   moduleId         — 模块注册 ID（对应 ModuleKindRegistry 中的 key，如 "school"）
 *   moduleInstanceId — 模块实例 ID（业务层唯一标识，如页面设计器的 pageId）
 *   instanceId       — Host 层实例 ID（与 moduleInstanceId 可能不同，用于 Host 内部路由）
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
 * 子实例引用。LLM 可见的最小实例描述，是 listChildren / findInstance 的返回元素。
 * LLM 通过 id 构建路径、通过 label/summary 区分同名实例。
 */
export type ModuleInstanceRef = Readonly<{
  /** 实例 ID（在同一 kind 下唯一，如 "0"、"main-form"） */
  id: string
  /** 显示标签（LLM 可见，如 "表格_0"、"主表单"） */
  label: string
  /** 摘要说明（可选，帮助 LLM 区分同名实例，如 "3 行 5 列的数据表格"） */
  summary?: string
}>

/**
 * 实例查询条件。键值对，具体语义由 ModuleKind 构造期的 find 委托解释。
 * 常见条件：{ id: "0" }、{ name: "main-form" }、{ type: "table" }
 * 查询能力完全由委托实现决定，协议层仅定义类型约束。
 */
export type ModuleInstanceQuery = Readonly<Record<string, LlmJsonValue>>

// ============================================================================
// 二、操作类型别名
//
// ModuleKindOperation<T> 是委托返回类型的统一别名。
// 支持同步和异步两种模式，由 ModuleKind 协议方法统一 await 处理，避免不必要的 Promise 包装。
// 设计意图：委托实现可自由选择同步或异步返回，协议层通过 await 统一处理。
// ============================================================================

/** 可同步或异步返回的操作结果 */
export type ModuleKindOperation<TData> = ModuleOperationResult<TData> | Promise<ModuleOperationResult<TData>>

// ============================================================================
// 三、导航上下文
//
// ModulePathContext 是协议方法（getAttribute / setAttribute / invokeFunction 等）
// 的第一个参数。由 Navigator 将 ModulePath 解析后传入 ModuleKind 的协议方法。
//
// Navigator 解析流程：
//   ModulePath.parse("/Page[main]/Table[0]")
//   → Navigator 逐段查找对应的 ModuleKind
//   → 对每个段构造 ModulePathContext（segments=全路径, segment=当前段, host=注入）
//   → 调用当前段 ModuleKind 的协议方法
// ============================================================================

export type ModulePathContext = Readonly<{
  /** 完整路径段列表（从根到当前节点）。用于跨层级查询和上下文感知。 */
  segments: readonly ModulePathSegment[]
  /** 当前段（Navigator 解析路径后的当前节点；根级查询时为 undefined） */
  segment?: ModulePathSegment
  /** Host 层注入的运行时标识（可选，根导航或纯协议测试可不提供） */
  host?: ModuleHostContext
}>

// ============================================================================
// 四、委托契约
//
// 以下 4 个委托是 ModuleKind 构造期注入的行为入口，每个覆盖一类运行时操作。
// 所有委托均返回 ModuleKindOperation<T>，由 ModuleKind 协议方法统一 await
// 后包装为 Promise<ModuleOperationResult<T>> 返回给调用方。
//
// 委托与 ModuleKind 协议方法的对应关系：
//   ModuleAttributeAccessor  → getAttribute() / setAttribute()
//   ModuleKindRunner         → invokeFunction()
//   ModuleChildrenLister     → listChildren()
//   ModuleInstanceFinder     → findInstance() / resolveChild()
//
// 每个委托在未提供时均有默认实现（见 ModuleKind 构造函数第三阶段）。
// ============================================================================

/**
 * 属性读写委托。
 * 属性的实际读写不直接操作 runner 对象，而是通过该委托完成。
 * 业务方在构造 ModuleKind 时注入，支持异步读取、写入校验、权限控制等自定义逻辑。
 *
 * 调用链：LLM → Runtime → Navigator → ModuleKind.getAttribute/setAttribute → 此委托 → 业务代码
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
 *
 * 调用链：LLM → Runtime → Navigator → ModuleKind.invokeFunction → 此委托 → 业务代码
 */
export type ModuleKindRunner = (
  ctx: ModulePathContext,
  functionName: string,
  args: LlmJsonParams,
) => ModuleKindOperation<LlmJsonValue>

/**
 * 子实例列表委托。
 * 接收 ctx + 可选 childKind 过滤，返回实例引用列表。
 * 未提供时默认返回空列表。
 *
 * 调用链：LLM → Runtime → Navigator → ModuleKind.listChildren → 此委托 → 业务代码
 */
export type ModuleChildrenLister = (
  ctx: ModulePathContext,
  childKind?: string,
) => ModuleKindOperation<readonly ModuleInstanceRef[]>

/**
 * 子实例查询委托。
 * 接收 ctx + childKind + query，返回匹配的实例引用列表。
 * 未提供时默认仅当 childKind 等于自身 kind 且非路径查询时返回当前实例。
 *
 * 调用链：LLM → Runtime → Navigator → ModuleKind.findInstance/resolveChild → 此委托 → 业务代码
 */
export type ModuleInstanceFinder = (
  ctx: ModulePathContext,
  childKind: string,
  query: ModuleInstanceQuery,
) => ModuleKindOperation<readonly ModuleInstanceRef[]>
