/**
 * @packageDocumentation
 *
 * 模块语义协议 — Capability 抽象基类。
 *
 * Capability 是业务层对接协议的唯一契约面。每种 ModuleKind 必有一个对应实现。
 * 协议从不直接持有业务数据,所有属性读写、动作执行、子模块定位都委托给 Capability。
 *
 * Capability **kind 级单例**:一个学校型对应一个 SchoolCapability 实现,
 * 通过 PathContext 的 instanceId 区分具体哪一所学校。
 *
 * 6 个核心方法对应协议派生的 5 类工具:
 * - getAttribute / setAttribute  ← 属性派生工具
 * - invokeAction                  ← 动作派生工具
 * - listChildren / findInstance   ← 协议内置导航工具
 * - resolveChild                  ← 路径段验证(协议遍历用,不直接暴露给 LLM)
 */

import type { LlmJsonValue } from '../../schema'
import type { ModulePathSegment } from './module-path'
import type { OperationResult } from './operation-result'

// ═══════════════════════════════════════════════════════
// 1. 路径上下文
// ═══════════════════════════════════════════════════════

/**
 * host 作用域信息。
 *
 * 由 host 适配层(如 ModuleSemanticBusinessRuntime)在 executeTool 时注入,
 * 协议核心本身不持有也不解释,只逐层透传给 Capability。
 *
 * Capability 用它来回答"当前 session 操作的是哪个业务实例" — 典型场景:
 * `findInstance(rootCtx, 'node-tree', {})` 返当前页面 id,让 LLM 可以
 * 不靠 systemPrompt 拼路径。
 */
export interface ModuleHostContext {
  readonly moduleId: string
  readonly moduleInstanceId: string
  readonly instanceId: string
}

/**
 * 调用 Capability 方法时传入的路径上下文。
 *
 * 段序列 + 末段位置。Capability 可同时看到:
 * - 自己处于哪一段(`segment`)
 * - 上下文路径(`segments`)用于跨级判断、含环识别、租户路由
 * - host 作用域(`host`),由 host 适配层注入,协议核心透传不解释
 *
 * 协议保证:
 * - 调用 attribute / action 方法时,`segment === segments[segments.length - 1]`
 * - 调用 resolveChild 时,`segment` 是被验证的子段,`segments` 是父路径(不含子段)
 * - `host` 在脱离 host 适配层(直接 new ModuleSemanticRuntime() 调用)时为 undefined
 */
export interface ModulePathContext {
  /** 完整段序列(根 → 当前) */
  readonly segments: readonly ModulePathSegment[]
  /** 当前段(对应 Capability 自己的 kind / instanceId) */
  readonly segment: ModulePathSegment
  /** host 适配层注入的当前业务实例作用域,直接调用时为 undefined */
  readonly host?: ModuleHostContext | undefined
}

// ═══════════════════════════════════════════════════════
// 2. 查询参数 / 列表结果
// ═══════════════════════════════════════════════════════

/**
 * findInstance 查询条件。
 *
 * 协议层不约束 query 内部形状,业务方按自己 Capability 的查询语义解释。
 * 协议只保证 query 是 JSON 兼容值。
 */
export type ModuleInstanceQuery = Readonly<Record<string, LlmJsonValue>>

/**
 * listChildren / findInstance 返回的单条实例摘要。
 *
 * - id:      子实例 id(LLM 接下来用它拼路径)
 * - label:   给 LLM 看的显示名(如"三年级"、"张三")
 * - summary: 可选辅助信息(LLM 用来判断要不要继续走这个 id)
 */
export interface ModuleInstanceRef {
  readonly id: string
  readonly label: string
  readonly summary?: string | undefined
}

// ═══════════════════════════════════════════════════════
// 3. Capability 抽象基类
// ═══════════════════════════════════════════════════════

/**
 * 模块能力契约基类。
 *
 * 业务方继承本类实现具体业务:
 * ```ts
 * export class SchoolCapability extends ModuleCapability {
 *   public readonly kind = 'school'
 *
 *   async getAttribute(ctx, attrName) { ... }
 *   async setAttribute(ctx, attrName, value) { ... }
 *   async invokeAction(ctx, actionName, args) { ... }
 *   async listChildren(ctx, childKind) { ... }
 *   async findInstance(ctx, childKind, query) { ... }
 *   async resolveChild(ctx, childKind, childId) { ... }
 * }
 * ```
 *
 * 所有方法返回 OperationResult:
 * - 业务异常通过 checks 反馈,不抛
 * - ok=true 表示调用成功(包括"未找到"也算成功调用 + checks 提示)
 * - 仅在真正不可恢复时(协议级 bug、配置错误)才允许抛异常
 */
export abstract class ModuleCapability {
  /** 该 Capability 服务的 ModuleKind 标识 */
  public abstract readonly kind: string

  /**
   * 读取属性。LLM 调用 `getAttribute(path, attrName)` 时被协议路由到这里。
   *
   * @param ctx       路径上下文,末段对应本 Capability 的实例
   * @param attrName  属性名,必然在 ModuleKind.attributes 中声明且 readable=true
   */
  public abstract getAttribute(
    ctx: ModulePathContext,
    attrName: string,
  ): Promise<OperationResult<LlmJsonValue>>

  /**
   * 写入属性。LLM 调用 `setAttribute(path, attrName, value)` 时被协议路由到这里。
   */
  public abstract setAttribute(
    ctx: ModulePathContext,
    attrName: string,
    value: LlmJsonValue,
  ): Promise<OperationResult<void>>

  /**
   * 调用动作。LLM 调用 `invokeAction(path, actionName, args)` 时被协议路由到这里。
   *
   * @param args 已通过 ModuleKind.actions[actionName].paramsSchema 校验过的参数对象
   */
  public abstract invokeAction(
    ctx: ModulePathContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): Promise<OperationResult<LlmJsonValue>>

  /**
   * 列出子实例。LLM 调用 `listChildren(path, childKind?)` 时被协议路由到这里。
   *
   * @param childKind 可选过滤;未传时返回所有子 kind 实例(由 Capability 决定如何聚合)
   */
  public abstract listChildren(
    ctx: ModulePathContext,
    childKind?: string,
  ): Promise<OperationResult<readonly ModuleInstanceRef[]>>

  /**
   * 查询子实例。LLM 调用 `findInstance(path, kind, query)` 时被协议路由到这里。
   *
   * @param childKind 目标子 kind(从 ModuleKind.children 中选择)
   * @param query     查询条件,业务方自行解释
   */
  public abstract findInstance(
    ctx: ModulePathContext,
    childKind: string,
    query: ModuleInstanceQuery,
  ): Promise<OperationResult<readonly ModuleInstanceRef[]>>

  /**
   * 验证子实例存在性。协议遍历路径时逐段调用,本方法**不直接对 LLM 暴露**。
   *
   * @param ctx       父段上下文(本 Capability 的实例,即被询问"我下面有 childId 吗")
   * @param childKind 要验证的子 kind
   * @param childId   要验证的子 id
   * @returns         OperationResult.ok=true 时,data 必须是 boolean(true=存在 / false=不存在)
   *                  仅在 Capability 内部错误时返回 ok=false
   */
  public abstract resolveChild(
    ctx: ModulePathContext,
    childKind: string,
    childId: string,
  ): Promise<OperationResult<boolean>>
}
