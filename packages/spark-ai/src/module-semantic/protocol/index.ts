/**
 * ═══════════════════════════════════════════════════════════════
 * module-semantic/protocol/index.ts — 协议层公共入口
 * ═══════════════════════════════════════════════════════════════
 *
 * 【导出策略】所有类型和值统一从 module-kind.ts 导出。
 *   ModuleKind 既是 class 也是 namespace，消费方用 ModuleKind 构造实例，
 *   用 ModuleKind.Path / ModuleKind.OperationResult 引用附属类型。
 * ═══════════════════════════════════════════════════════════════
 */

// ── ModuleKind class + namespace ──────────────────────────────
export {
  ModuleKind,
} from './module-kind'

export type {
  ActionFailureMode,
  ActionSchema,
  AttributeAccessFlags,
  AttributeSchema,
} from './module-kind'

// ── ActionResultSchema ────────────────────────────────────────
export type {
  ActionResultSchema,
} from './module-kind'
