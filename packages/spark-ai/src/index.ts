/**
 * @packageDocumentation
 *
 * SPARK AI 公共入口。
 *
 * 本包只暴露三块稳定能力：
 * - schema           — LLM JSON Schema 类型定义、构造器、参数校验器
 * - module-semantic  — ModuleKind 语义协议核心 + ModuleSemanticRuntime 组合根
 * - host             — 框架无关的 AI Host 会话管理、传输层、工具循环
 *
 * 旧 runtime / protocol / core 入口已删除，不再提供兼容导出。
 */

export * from './schema'

export * from './module-semantic'

export * from './host'
