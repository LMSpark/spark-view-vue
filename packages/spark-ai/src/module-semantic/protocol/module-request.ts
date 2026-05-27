/**
 * module-semantic · API 请求 DTO
 *
 * 协议层级：第 5 层（依赖 module-context + module-path + schema）
 * 核心职责：定义 API 边界的请求入参。是协议类型（ModulePath / ModuleHostContext /
 *   ModuleInstanceQuery）在 API 边界上的组合包装。由 ModuleSemanticRuntime 解析后委托给
 *   Navigator → ModuleKind 执行。
 * 上游依赖：module-context（ModuleHostContext、ModuleInstanceQuery）、
 *          module-path（ModulePath）、schema（LlmJsonValue、LlmJsonParams）
 * 下游消费：ModuleSemanticRuntime（解析请求 → 委托 Navigator）
 *
 * 三个请求对应三个核心 LLM 操作：
 *   ModuleSetAttributeRequest    → setAttribute（属性写入）
 *   ModuleFunctionInvokeRequest  → invokeFunction（函数调用）
 *   ModuleFindInstanceRequest    → findInstance（实例查询）
 *
 * 这些 DTO 通过 protocol/index.ts 统一导出；运行时内部也只依赖该门面。
 */

import type { LlmJsonParams, LlmJsonValue } from '../../schema'
import type { ModuleHostContext, ModuleInstanceQuery } from './module-context'
import type { ModulePath } from './module-path'

// ============================================================================
// 一、属性写入请求 — ModuleSetAttributeRequest
//
// LLM 调用 setAttribute 时，Runtime 将 LLM 参数组装为此 DTO，
// 然后委托 Navigator 解析 path → 定位目标 ModuleKind → 调用 setAttribute 协议方法。
// ============================================================================

export type ModuleSetAttributeRequest = Readonly<{
  /** 目标模块路径（如 /Page[main]/Table[0]） */
  path: ModulePath
  /** 属性名（必须在目标 kind 的 attributes 表中已声明且 writable=true） */
  attrName: string
  /** 属性值（可序列化的 JSON 值，会在 setAttribute 中经 schema 校验） */
  value: LlmJsonValue
  /** Host 上下文（可选，用于定位业务实例） */
  host?: ModuleHostContext
}>

// ============================================================================
// 二、函数调用请求 — ModuleFunctionInvokeRequest
//
// LLM 调用业务函数时，Runtime 将 LLM 参数组装为此 DTO，
// 然后委托 Navigator 解析 path + kindPath → 定位目标 ModuleKind → 调用 invokeFunction。
//
// path 与 kindPath 的关系：
//   path      — 模块实例路径（定位具体实例，如 /Page[main]/Table[0]）
//   kindPath  — 模块类型路径（定位 ModuleKind，如 ["page-design", "table"]）
//   两者长度必须一致，kindPath[i] 是 path.segments[i].kind 对应的注册 kind。
// ============================================================================

export type ModuleFunctionInvokeRequest = Readonly<{
  /** 目标模块路径（定位具体实例） */
  path: ModulePath
  /** 函数所在 kind 路径，必须与目标 path 的 kind 序列一致 */
  kindPath: readonly string[]
  /** 函数名（必须在目标 kind 的 functions 表中已声明） */
  functionName: string
  /** 函数参数（会在 invokeFunction 中经 paramsSchema 校验） */
  args: LlmJsonParams
  /** Host 上下文（可选，用于定位业务实例） */
  host?: ModuleHostContext
}>

// ============================================================================
// 三、实例查询请求 — ModuleFindInstanceRequest
//
// LLM 需要查找子实例时，Runtime 将 LLM 参数组装为此 DTO，
// 然后委托 Navigator 解析 path → 定位父 ModuleKind → 调用 findInstance。
//
// 典型场景：
//   LLM 已知父路径 /Page[main]，需要查找其下的 Table 实例
//   → { path: /Page[main], childKind: "table", query: { type: "data-table" } }
// ============================================================================

export type ModuleFindInstanceRequest = Readonly<{
  /** 父模块路径（查找范围） */
  path: ModulePath
  /** 子模块 kind（必须在父 kind 的 children 表中已声明） */
  childKind: string
  /** 查询条件（由委托实现解释，如 { id: "0" }、{ name: "main-form" }） */
  query: ModuleInstanceQuery
  /** Host 上下文（可选，用于定位业务实例） */
  host?: ModuleHostContext
}>
