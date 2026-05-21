/**
 * @packageDocumentation
 *
 * 模块语义协议公共入口。
 *
 * 暴露 5 大块:
 * 1. 操作结果对象(check / result)
 * 2. 模块类型协议(ModuleKind / AttributeSchema / ActionSchema)
 * 3. 模块路径(ModulePath / 段类型)
 * 4. 路径上下文 + 实例引用类型
 * 5. 运行时(ModuleSemanticRuntime + 工具规约类型)
 *
 * 业务方典型使用:
 * ```ts
 * import {
 *   ModuleSemanticRuntime,
 *   ModuleKind,
 *   ModulePath,
 * } from '@spark-view/spark-ai/module-semantic'
 *
 * const runtime = new ModuleSemanticRuntime()
 * runtime.registerKind(createSchoolModuleKind())
 * const tools = runtime.getLlmTools()
 * ```
 */

// ═══════════════════════════════════════════════════════
// 1-4. 协议层(re-export from ./protocol)
// ═══════════════════════════════════════════════════════

export * from './protocol/index'

// ═══════════════════════════════════════════════════════
// 5. 运行时
// ═══════════════════════════════════════════════════════

export {
  ModuleSemanticRuntime,
} from './runtime/module-semantic-runtime'

export type {
  ProtocolToolArgs,
} from './runtime/module-semantic-runtime'

export {
  PROTOCOL_TOOL_NAMES,
} from './internal/protocol-tool-generator'

export type {
  ModuleSemanticToolSpec,
  ProtocolToolName,
} from './internal/protocol-tool-generator'

export type {
  ModuleKindDescription,
} from './internal/navigator'

// ═══════════════════════════════════════════════════════
// 注册错误类型(便于业务方 instanceof 判断)
// ═══════════════════════════════════════════════════════

export {
  ModuleKindConflictError,
  ModuleKindNotFoundError,
} from './internal/module-kind-registry'

// ═══════════════════════════════════════════════════════
// 6. host 工具编解码器(re-export from ./host)
//
// Host 直接消费 ModuleSemanticRuntime.getLlmTools() 产生的协议工具。
// ═══════════════════════════════════════════════════════

export * from './host/index'
