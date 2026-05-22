/**
 * @packageDocumentation
 *
 * 模块语义协议公共入口。
 *
 * 协议层导出:
 * - ModuleKind class + namespace（操作结果、模块路径、上下文类型、委托类型）
 * - 属性/动作 schema（AttributeSchema / ActionSchema / ActionFailureMode）
 *
 * 所有类型统一从 module-kind.ts 导出。
 */

// ═══════════════════════════════════════════════════════
// 1. ModuleKind class + namespace
// ═══════════════════════════════════════════════════════

export {
  ModuleKind,
} from './module-kind'

export type {
  ActionFailureMode,
  ActionSchema,
  AttributeAccessFlags,
  AttributeSchema,
} from './module-kind'

// ═══════════════════════════════════════════════════════
// 2. ActionResultSchema
// ═══════════════════════════════════════════════════════

export type {
  ActionResultSchema,
} from './module-kind'
