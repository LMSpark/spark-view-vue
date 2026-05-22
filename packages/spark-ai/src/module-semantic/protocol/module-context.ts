/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  MODULE-SEMANTIC · 运行时上下文与委托契约                                      │
 * │  Runtime Contexts & Delegate Contracts                                        │
 * │                                                                              │
 * │  本文件定义 module-semantic 层的关键上下文类型和委托函数签名。                  │
 * │                                                                              │
 * │  核心类型：                                                                   │
 * │    · ModuleHostContext     — Host 层注入的运行时标识（moduleId + instanceId） │
 * │    · ModulePathContext     — 路径导航上下文（当前段 + 全路径 + 可选 Host）     │
 * │    · ModuleInstanceRef     — 子实例引用（id + label + summary）              │
 * │    · ModuleInstanceQuery   — 实例查询条件（任意键值对）                        │
 * │    · ModuleKindRunner      — 动作执行委托（kind 的核心行为入口）              │
 * │    · ModuleChildrenLister  — 子实例列表委托                                   │
 * │    · ModuleInstanceFinder  — 子实例查询委托                                   │
 * │                                                                              │
 * │  设计决策：构造期委托均返回 ModuleKindOperation<T>（同步或 Promise），          │
 * │  对外只暴露 ModuleKind 协议方法，不暴露可变委托字段。                          │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import type { LlmJsonValue } from '../../schema'
import type { ModuleOperationResult } from './module-operation'
import type { ModulePathSegment } from './module-path'

/* -------------------------------------------------------------------------------
 * 一、上下文字段
 * ----------------------------------------------------------------------------- */

/** Host 层注入的运行时标识（一次会话内不变） */
export type ModuleHostContext = Readonly<{
  moduleId: string
  moduleInstanceId: string
  instanceId: string
}>

/** 路径导航上下文：当前段 + 全路径段列表 + 可选 Host */
export type ModulePathContext = Readonly<{
  segments: readonly ModulePathSegment[]
  segment: ModulePathSegment
  host?: ModuleHostContext | undefined
}>

/* -------------------------------------------------------------------------------
 * 二、实例引用与查询
 * ----------------------------------------------------------------------------- */

/** 子实例引用（LLM 可见的最小实例描述） */
export type ModuleInstanceRef = Readonly<{
  id: string
  label: string
  summary?: string | undefined
}>

/** 实例查询条件（键值对，具体语义由 ModuleKind 构造期 find 委托解释） */
export type ModuleInstanceQuery = Readonly<Record<string, LlmJsonValue>>

/* -------------------------------------------------------------------------------
 * 三、委托函数签名
 * ----------------------------------------------------------------------------- */

/** 可同步或异步返回的操作结果（避免不必要的 Promise 包装） */
export type ModuleKindOperation<TData> = ModuleOperationResult<TData> | Promise<ModuleOperationResult<TData>>

/** 动作执行委托：ctx + actionName + args → 操作结果 */
export type ModuleKindRunner = (
  ctx: ModulePathContext,
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
) => ModuleKindOperation<LlmJsonValue>

/** 子实例列表委托：ctx + 可选 childKind → 实例引用列表 */
export type ModuleChildrenLister = (
  ctx: ModulePathContext,
  childKind?: string,
) => ModuleKindOperation<readonly ModuleInstanceRef[]>

/** 子实例查询委托：ctx + childKind + query → 实例引用列表 */
export type ModuleInstanceFinder = (
  ctx: ModulePathContext,
  childKind: string,
  query: ModuleInstanceQuery,
) => ModuleKindOperation<readonly ModuleInstanceRef[]>
