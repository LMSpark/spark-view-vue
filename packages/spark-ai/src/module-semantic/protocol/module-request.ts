/**
 * module-semantic · API 请求 DTO
 *
 * API 边界的请求入参，是协议类型（ModulePath / ModuleHostContext / ModuleInstanceQuery）
 * 在 API 边界上的组合包装。由 ModuleSemanticRuntime 解析后委托给 Navigator → ModuleKind。
 *
 * 三个请求对应三个核心操作：setAttribute / invokeFunction / findInstance
 *
 * 这些 DTO 会通过 protocol/index.ts 统一导出；运行时内部也只依赖该门面。
 */

import type { LlmJsonParams, LlmJsonValue } from '../../schema'
import type { ModuleHostContext, ModuleInstanceQuery } from './module-context'
import type { ModulePath } from './module-path'

/** 属性写入请求 */
export type ModuleSetAttributeRequest = Readonly<{
  /** 目标模块路径 */
  path: ModulePath
  /** 属性名（必须在目标 kind 的 attributes 表中已声明且 writable=true） */
  attrName: string
  /** 属性值（可序列化的 JSON 值） */
  value: LlmJsonValue
  /** Host 上下文（可选） */
  host?: ModuleHostContext
}>

/** 函数调用请求 */
export type ModuleFunctionInvokeRequest = Readonly<{
  /** 目标模块路径 */
  path: ModulePath
  /** 函数所在 kind 路径，必须与目标 path 的 kind 序列一致 */
  kindPath: readonly string[]
  /** 函数名（必须在目标 kind 的 functions 表中已声明） */
  functionName: string
  /** 函数参数 */
  args: LlmJsonParams
  /** Host 上下文（可选） */
  host?: ModuleHostContext
}>

/** 实例查询请求 */
export type ModuleFindInstanceRequest = Readonly<{
  /** 父模块路径 */
  path: ModulePath
  /** 子模块 kind（必须在父 kind 的 children 表中已声明） */
  childKind: string
  /** 查询条件 */
  query: ModuleInstanceQuery
  /** Host 上下文（可选） */
  host?: ModuleHostContext
}>
